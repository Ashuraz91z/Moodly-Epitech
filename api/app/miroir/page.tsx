"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Mirror } from "@/lib/api";
import { Logout } from "../logout";
import { Icon, Loader, type IconName } from "../icons";
import { MatrixInput, TeamMatrix, ZONES, zoneOf, type Point } from "../matrix";
import { TeamVotes } from "./votes";
import { Benchmark } from "./benchmark";
import { Accuracy, lastAccuracy } from "./accuracy";
import { FACTORS, USEFUL } from "../questionnaire";
import { downloadCsv } from "@/lib/csv";
import { FORECAST, MirrorChart, TEAM, fmt, todayInParis } from "./chart";

const WEATHER: { min: number; icon: IconName; color: string; label: string }[] = [
  { min: 4.2, icon: "sun", color: "#d97706", label: "Grand soleil" },
  { min: 3.4, icon: "cloudSun", color: "#d97706", label: "Éclaircies" },
  { min: 2.6, icon: "cloud", color: "#64748b", label: "Nuageux" },
  { min: 1.8, icon: "rain", color: "#2563eb", label: "Pluie" },
  { min: 0, icon: "storm", color: "#be123c", label: "Orage" },
];
const weatherOf = (avg: number) => WEATHER.find((w) => avg >= w.min)!;
const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

// Pronostic de la semaine : le manager place son équipe sur la matrice avant de voir le Miroir.
function Forecast({ onDone }: { onDone: () => void }) {
  const [point, setPoint] = useState<Point | null>(null);
  const [impact, setImpact] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await api("/api/predictions", { pleasure: point!.pleasure, energy: point!.energy, impact });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onDone();
      else setError((e as Error).message);
    }
    setBusy(false);
  }
  const ready = point?.energy != null && impact != null;
  return (
    <main className="screen saisie">
      <div className="top">
        <p className="eyebrow">Espace manager</p>
        <Logout />
      </div>
      <div className="intro">
        <h1>Avant de voir les résultats…</h1>
        <p className="sub">
          Où places-tu ton équipe cette semaine ? Pose-la sur la matrice : le plaisir qu&apos;elle prend au travail et son énergie.
          Lundi, une fois la semaine close, tu verras où elle s&apos;est placée elle-même.
        </p>
      </div>
      <MatrixInput value={point} onChange={setPoint} team />
      <div className="saisie-side">
        <fieldset className="segmented energy">
          <legend>Et selon toi, se sent-elle utile ?</legend>
          {USEFUL.map((label, i) => (
            <label key={label}><input type="radio" name="impact" checked={impact === i + 1} onChange={() => setImpact(i + 1)} />{label}</label>
          ))}
        </fieldset>
        <p className="note">Un seul pronostic par semaine, non modifiable : c&apos;est ce qui rend la comparaison honnête.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn dark" disabled={!ready || busy} onClick={send}>{busy ? "Révélation…" : "Révéler le Miroir"}</button>
        {!ready && <p className="hint">{point?.energy == null ? "Place ton équipe sur la matrice." : "Dis si elle se sent utile, selon toi."}</p>}
      </div>
    </main>
  );
}

const tone = (v: number) => (v < 2.6 ? "low" : v < 3.4 ? "mid" : "good");

// Les 6 facteurs de risques psychosociaux, la tendance déclarée et les sujets (dernière semaine close).
function Factors({ last }: { last: NonNullable<Extract<Mirror, { needs_prediction: false }>["last"]> }) {
  const t = last.trend;
  const total = t ? t.better + t.same + t.worse : 0;
  return (
    <section className="factors-block">
      <h2>Ce qui pèse et ce qui porte <small>semaine du {shortDate(last.week_start)}</small></h2>
      <div className="factors-grid">
        {last.factors ? (
          <ol className="bars factors">
            {[...FACTORS].sort((a, b) => last.factors![a.key] - last.factors![b.key]).map((f) => (
              <li key={f.key}>
                <span>{f.label}</span>
                <div className="meter" aria-hidden><div className={tone(last.factors![f.key])} style={{ width: `${(last.factors![f.key] / 5) * 100}%` }} /></div>
                <span className="small">{fmt(last.factors![f.key])}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="note">Facteurs affichés à partir de 5 questionnaires complets.</p>
        )}
        <div className="factors-side">
          {t && (
            <div>
              <h3>Par rapport à la semaine d&apos;avant</h3>
              <div className="trend-bar" role="img" aria-label={`${t.better} meilleure, ${t.same} pareille, ${t.worse} moins bonne`}>
                {t.better > 0 && <span className="good" style={{ flex: t.better }}>{Math.round((t.better / total) * 100)} % mieux</span>}
                {t.same > 0 && <span className="same" style={{ flex: t.same }}>{Math.round((t.same / total) * 100)} % pareille</span>}
                {t.worse > 0 && <span className="low" style={{ flex: t.worse }}>{Math.round((t.worse / total) * 100)} % moins bien</span>}
              </div>
            </div>
          )}
          {last.tags.length > 0 && (
            <div>
              <h3>Sujets les plus cités</h3>
              <div className="chips">{last.tags.map((tag) => <span key={tag} className="pill">{tag}</span>)}</div>
            </div>
          )}
          <p className="muted small">Notes de 1 à 5, 5 = favorable. Moyennes d&apos;équipe uniquement, à partir de 5 réponses.</p>
        </div>
      </div>
    </section>
  );
}

export default function Miroir() {
  const router = useRouter();
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<Mirror>("/api/mirror?weeks=8")
      .then(setMirror)
      .catch((e) => (e instanceof ApiError && e.status === 403 ? router.replace("/") : setError(e.message)));
  }, [router]);
  useEffect(load, [load]);

  if (!mirror) return <main className="screen">{error ? <p className="error" role="alert">{error}</p> : <Loader />}</main>;
  if (mirror.needs_prediction) return <Forecast onDone={load} />;

  const today = todayInParis();
  // Révélation sur la dernière semaine close : le pronostic d'alors face au moral réel.
  const last = mirror.last;
  const row = last ? mirror.weeks.find((w) => w.week_start === last.week_start) : undefined;
  const prediction = row?.prediction ?? null;
  const teamAvg = last?.team_avg ?? null;
  const gap = row?.gap ?? null;
  const blind = gap != null && Math.abs(gap) > 1.5;
  const dominant = row?.dominant_tag ?? null;
  const first = mirror.weeks.find((w) => w.gap != null);
  const participation = last && mirror.team_size ? Math.round((last.responses / mirror.team_size) * 100) : null;
  const forecast = row?.forecast ?? null;
  // Récap : moral face à la semaine close précédente, justesse du pronostic.
  const closed = mirror.weeks.filter((w) => w.team_avg != null);
  const moralDelta = closed.length > 1 ? closed.at(-1)!.team_avg! - closed.at(-2)!.team_avg! : null;
  const acc = lastAccuracy(mirror.weeks);

  function exportCsv() {
    if (mirror?.needs_prediction !== false) return;
    downloadCsv(`moodly-miroir-${today}`, [
      ["Semaine du", "Pronostic", "Moral équipe", "Plaisir", "Énergie", "Impact", "Réponses", "Écart", "Sujet dominant"],
      ...mirror.weeks.map((w) => [w.week_start, w.prediction, w.team_avg, w.pleasure, w.energy, w.impact, w.responses, w.gap, w.dominant_tag]),
      ...(last?.factors ? [[], [`Facteurs, semaine du ${last.week_start}`, "Note / 5"], ...FACTORS.map((f) => [f.label, last.factors![f.key]])] : []),
    ]);
  }

  return (
    <main className="screen wide">
      <div className="top">
        <p className="eyebrow">Le Miroir · 8 semaines</p>
        <div className="top-actions no-print">
          <button className="ghost" onClick={exportCsv}><Icon name="download" size={16} />CSV</button>
          <button className="ghost" onClick={() => print()}><Icon name="printer" size={16} />PDF</button>
          <Logout />
        </div>
      </div>

      {last && teamAvg != null ? (
        <div className="weather">
          <span className="icon" style={{ color: weatherOf(teamAvg).color }}><Icon name={weatherOf(teamAvg).icon} size={36} /></span>
          <div>
            <strong>Météo de l&apos;équipe : {weatherOf(teamAvg).label}</strong>
            <p>
              Semaine du {shortDate(last.week_start)} :{" "}
              {prediction != null && <>tu pensais <strong style={{ color: FORECAST }}>{fmt(prediction)}</strong> · </>}
              l&apos;équipe était à <strong style={{ color: TEAM }}>{fmt(teamAvg)}</strong> / 5
              {moralDelta != null && Math.abs(moralDelta) >= 0.05 && <> ({moralDelta > 0 ? "+" : "−"}{fmt(Math.abs(moralDelta))} sur une semaine)</>}
            </p>
          </div>
        </div>
      ) : (
        <p className="note">Aucune semaine close avec au moins 5 réponses pour l&apos;instant : les résultats apparaîtront le lundi qui suit.</p>
      )}

      <div className="tiles three">
        <div className={`tile${blind ? " alert" : ""}`}>
          <span>Justesse de ton regard{blind ? " · angle mort" : ""}</span>
          <strong>{acc.now == null ? "—" : `${acc.now} %`}</strong>
          <span>
            {acc.now == null
              ? gap == null ? "Pas de pronostic ou pas assez de réponses" : `Écart de moral : ${fmt(Math.abs(gap))} pt`
              : acc.before == null || acc.now === acc.before ? "semaine dernière" : `${acc.now > acc.before ? "+" : "−"}${Math.abs(acc.now - acc.before)} pts sur une semaine`}
          </span>
        </div>
        <div className="tile">
          <span>Participation</span>
          <strong>{participation == null ? "—" : `${participation} %`}</strong>
          <span>semaine dernière</span>
        </div>
        <div className="tile zone">
          <span>Cette semaine · questionnaire jeudi et vendredi</span>
          <strong className="zone-name">{mirror.current.responses} réponse{mirror.current.responses > 1 ? "s" : ""} sur {mirror.team_size}</strong>
          <span>Résultats lundi, une fois la semaine close, s&apos;il y a au moins 5 réponses.</span>
        </div>
      </div>

      <div className="chart-block">
        <div className="legend">
          <span><svg width="22" height="4"><line x2="22" y1="2" y2="2" stroke={TEAM} strokeWidth="3" /></svg>Équipe</span>
          <span><svg width="22" height="4"><line x2="22" y1="2" y2="2" stroke={FORECAST} strokeWidth="3" strokeDasharray="6 4" /></svg>Mon pronostic</span>
        </div>
        <MirrorChart weeks={mirror.weeks} thisWeek={mirror.current.week_start} />
        {first && first.week_start !== row?.week_start && first.gap != null && gap != null && (
          <span className={`trend ${Math.abs(gap) <= Math.abs(first.gap) ? "down" : "up"}`}>
            <Icon name={Math.abs(gap) <= Math.abs(first.gap) ? "down" : "up"} size={16} />
            {Math.abs(gap) <= Math.abs(first.gap) ? "Écart réduit" : "Écart en hausse"} : {fmt(Math.abs(first.gap))} → {fmt(Math.abs(gap))} pt depuis le {shortDate(first.week_start)}
          </span>
        )}
      </div>

      <section className="matrix-block">
        <h2>Matrice de l&apos;équipe <small>ton pronostic face à ses réponses</small></h2>
        {last && forecast && (
          <p className="verdict">
            {zoneOf(forecast) === zoneOf(last)
              ? <>Tu voyais ton équipe « {ZONES[zoneOf(forecast)].label} » : c&apos;est bien là qu&apos;elle s&apos;est placée.</>
              : <>Tu voyais ton équipe « {ZONES[zoneOf(forecast)].label} », elle s&apos;est placée « {ZONES[zoneOf(last)].label} ».</>}
          </p>
        )}
        {last ? <TeamMatrix data={last} weeks={mirror.weeks} forecast={forecast} /> : <p className="note">La matrice s&apos;affiche à partir de 5 réponses dans une semaine close.</p>}
      </section>

      <div className="miroir-side">
        {blind ? (
          <div className="alert-card" role="status">
            <Icon name="alert" size={24} />
            <div>
              <h2>Angle mort détecté</h2>
              <p>
                La semaine dernière, ton équipe allait {gap! > 0 ? "moins bien" : "mieux"} que tu ne le pensais.
                {gap! > 0 && dominant && <> Sujet dominant : <strong>{dominant}</strong></>}
              </p>
            </div>
          </div>
        ) : gap != null ? (
          <div className="ok-card" role="status"><Icon name="check" size={22} />Ta perception était proche du ressenti de l&apos;équipe la semaine dernière.</div>
        ) : null}

        <TeamVotes />
      </div>

      <Accuracy weeks={mirror.weeks} />

      {last && <Factors last={last} />}

      {last && <Benchmark last={last} teamSize={mirror.team_size} />}

      <details>
        <summary>Voir les données du graphe</summary>
        <table>
          <thead><tr><th>Semaine du</th><th>Pronostic</th><th>Équipe</th><th>Réponses</th><th>Écart</th><th>Sujet dominant</th></tr></thead>
          <tbody>
            {mirror.weeks.map((w) => (
              <tr key={w.week_start}>
                <td>{w.week_start}</td>
                <td>{w.prediction == null ? "—" : fmt(w.prediction)}</td>
                <td>{w.team_avg == null ? "—" : fmt(w.team_avg)}</td>
                <td>{w.responses ?? "—"}</td>
                <td>{w.gap == null ? "—" : fmt(w.gap)}</td>
                <td>{w.dominant_tag ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  );
}
