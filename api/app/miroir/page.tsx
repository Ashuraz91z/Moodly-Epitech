"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Mirror } from "@/lib/api";
import { Logout } from "../logout";
import { Icon, Loader, type IconName } from "../icons";
import { TeamMatrix } from "../matrix";
import { ActionPlan } from "./plan";
import { downloadCsv } from "@/lib/csv";
import { FORECAST, MirrorChart, TEAM, fmt, todayInParis } from "./chart";

const ACTIONS: Record<string, string[]> = {
  "Charge de travail": ["Point d'équipe sur la charge", "Entretiens individuels", "Revoir les priorités du sprint"],
  Ambiance: ["Moment d'équipe informel", "Rétrospective sur le fonctionnement de l'équipe", "Clarifier les règles de communication"],
  Management: ["Demander un retour anonyme sur ton management", "Expliquer davantage les décisions", "Points individuels réguliers"],
  Reconnaissance: ["Valoriser les réussites en réunion", "Retours individuels positifs et précis", "Parler des perspectives d'évolution"],
  "Équilibre vie pro / perso": ["Limiter réunions et messages hors horaires", "Rediscuter télétravail et flexibilité", "Surveiller les heures supplémentaires"],
  "Sens du travail": ["Rappeler l'impact du travail de l'équipe", "Associer l'équipe aux décisions", "Partager les retours clients"],
  "Conditions matérielles": ["Lister les irritants matériels avec l'équipe", "Remonter les besoins prioritaires", "Suivre les demandes en cours"],
  Personnel: ["Rester disponible sans insister", "Rappeler les ressources d'aide (médecine du travail)", "Alléger temporairement si besoin"],
};
const WEATHER: { min: number; icon: IconName; color: string; label: string }[] = [
  { min: 4.2, icon: "sun", color: "#d97706", label: "Grand soleil" },
  { min: 3.4, icon: "cloudSun", color: "#d97706", label: "Éclaircies" },
  { min: 2.6, icon: "cloud", color: "#64748b", label: "Nuageux" },
  { min: 1.8, icon: "rain", color: "#2563eb", label: "Pluie" },
  { min: 0, icon: "storm", color: "#be123c", label: "Orage" },
];
const weatherOf = (avg: number) => WEATHER.find((w) => avg >= w.min)!;
const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

const UNDERESTIMATE = ["Te rassurer : l'équipe va plutôt bien", "Partager ce constat positif avec l'équipe", "Prêter attention à ton propre moral"];

function Forecast({ onDone }: { onDone: () => void }) {
  const [score, setScore] = useState(3);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await api("/api/predictions", { score });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onDone();
      else setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <main className="screen">
      <p className="eyebrow">Espace manager</p>
      <h1>Avant de voir les résultats…</h1>
      <p className="sub">Selon toi, quel est le moral de ton équipe cette semaine ?</p>
      <div>
        <div className="forecast">
          <output htmlFor="forecast">{fmt(score)} <small>/ 5</small></output>
          <input id="forecast" type="range" style={{ "--pct": `${((score - 1) / 4) * 100}%` } as React.CSSProperties} min="1" max="5" step="0.5" value={score} onChange={(e) => setScore(Number(e.target.value))} aria-label="Ton pronostic, de 1 à 5" />
          <div className="ticks" aria-hidden>{[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}</div>
        </div>
      </div>
      <div className="card">
        <strong>Pourquoi ce pronostic ?</strong>
        <p>Le Miroir compare ta perception au ressenti réel de l&apos;équipe : la moyenne de son plaisir et de son impact sur la matrice. Un seul pronostic par semaine : il ne pourra plus être modifié.</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn dark" disabled={busy} onClick={send}>{busy ? "Révélation…" : "Révéler le Miroir"}</button>
    </main>
  );
}

export default function Miroir() {
  const router = useRouter();
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<Mirror>("/api/mirror?days=30")
      .then(setMirror)
      .catch((e) => (e instanceof ApiError && e.status === 403 ? router.replace("/") : setError(e.message)));
  }, [router]);
  useEffect(load, [load]);

  if (!mirror) return <main className="screen">{error ? <p className="error" role="alert">{error}</p> : <Loader />}</main>;
  if (mirror.needs_prediction) return <Forecast onDone={load} />;

  const today = todayInParis();
  const week = mirror.weeks.at(-1);
  const gap = week?.gap ?? null;
  const blind = gap != null && Math.abs(gap) > 1.5;
  const first = mirror.weeks.find((w) => w.gap != null);
  const participation = mirror.team_size ? Math.round((mirror.avg_daily_responses / mirror.team_size) * 100) : 0;
  const actions = gap != null && gap < 0 ? UNDERESTIMATE : ACTIONS[week?.dominant_tag ?? ""] ?? [];

  function exportCsv() {
    if (mirror?.needs_prediction !== false) return;
    downloadCsv(`moodly-miroir-${today}`, [
      ["Semaine du", "Pronostic", "Moral équipe", "Impact", "Plaisir", "Écart", "Tag dominant"],
      ...mirror.weeks.map((w) => [w.week_start, w.prediction, w.team_avg, w.impact, w.pleasure, w.gap, w.dominant_tag]),
      [],
      ["Jour", "Moral équipe", "Réponses"],
      ...mirror.days.map((d) => [d.day, d.team_avg, d.responses]),
    ]);
  }

  return (
    <main className="screen wide">
      <div className="top">
        <p className="eyebrow">Le Miroir · 30 jours</p>
        <div className="top-actions no-print">
          <button className="ghost" onClick={exportCsv}><Icon name="download" size={16} />CSV</button>
          <button className="ghost" onClick={() => print()}><Icon name="printer" size={16} />PDF</button>
          <Logout />
        </div>
      </div>

      {week?.team_avg != null && week.prediction != null && (
        <div className="weather">
          <span className="icon" style={{ color: weatherOf(week.team_avg).color }}><Icon name={weatherOf(week.team_avg).icon} size={36} /></span>
          <div>
            <strong>Météo de l&apos;équipe : {weatherOf(week.team_avg).label}</strong>
            <p>Tu pensais <strong style={{ color: FORECAST }}>{fmt(week.prediction)}</strong> · l&apos;équipe est à <strong style={{ color: TEAM }}>{fmt(week.team_avg)}</strong> / 5 cette semaine</p>
          </div>
        </div>
      )}

      <div className="tiles">
        <div className={`tile${blind ? " alert" : ""}`}>
          <span>Écart semaine{blind ? " · angle mort" : ""}</span>
          <strong>{gap == null ? "—" : `${fmt(Math.abs(gap))} pt`}</strong>
          <span>{gap == null ? "Pas encore assez de réponses" : gap > 0 ? "Tu surestimes" : gap < 0 ? "Tu sous-estimes" : "Lecture juste"}</span>
        </div>
        <div className="tile">
          <span>Participation</span>
          <strong>{participation} %</strong>
          <span>sur les 7 derniers jours</span>
        </div>
      </div>

      <div className="chart-block">
        <div className="legend">
          <span><svg width="22" height="4"><line x2="22" y1="2" y2="2" stroke={TEAM} strokeWidth="3" /></svg>Équipe</span>
          <span><svg width="22" height="4"><line x2="22" y1="2" y2="2" stroke={FORECAST} strokeWidth="3" strokeDasharray="6 4" /></svg>Mon pronostic</span>
        </div>
        <MirrorChart days={mirror.days} weeks={mirror.weeks} today={today} />
        {first && first !== week && first.gap != null && gap != null && (
          <span className={`trend ${Math.abs(gap) <= Math.abs(first.gap) ? "down" : "up"}`}>
            <Icon name={Math.abs(gap) <= Math.abs(first.gap) ? "down" : "up"} size={16} />
            {Math.abs(gap) <= Math.abs(first.gap) ? "Écart réduit" : "Écart en hausse"} : {fmt(Math.abs(first.gap))} → {fmt(Math.abs(gap))} pt depuis le {shortDate(first.week_start)}
          </span>
        )}
      </div>

      <section className="matrix-block">
        <h2>Matrice de l&apos;équipe <small>trajectoire sur 30 jours</small></h2>
        {mirror.matrix ? (
          <TeamMatrix data={mirror.matrix} weeks={mirror.weeks} />
        ) : (
          <p className="note">Pas encore assez de réponses : la matrice s&apos;affiche à partir de 5 réponses par jour.</p>
        )}
      </section>

      <div className="miroir-side">
        {blind ? (
          <div className="alert-card" role="status">
            <Icon name="alert" size={24} />
            <div>
              <h2>Angle mort détecté</h2>
              <p>
                Ton équipe va {gap! > 0 ? "moins bien" : "mieux"} que tu ne le penses.
                {gap! > 0 && week?.dominant_tag && <> Tag dominant : <strong>{week.dominant_tag}</strong></>}
              </p>
            </div>
          </div>
        ) : gap != null ? (
          <div className="ok-card" role="status"><Icon name="check" size={22} />Ta perception est proche du ressenti de l&apos;équipe cette semaine.</div>
        ) : null}

        <ActionPlan suggestions={blind ? actions : []} weeks={mirror.weeks} today={today} />
      </div>

      <details>
        <summary>Voir les données du graphe</summary>
        <table>
          <thead><tr><th>Jour</th><th>Équipe</th><th>Réponses</th></tr></thead>
          <tbody>
            {mirror.days.map((d) => (
              <tr key={d.day}><td>{d.day}</td><td>{fmt(d.team_avg)}</td><td>{d.responses}</td></tr>
            ))}
          </tbody>
        </table>
        <table>
          <thead><tr><th>Semaine du</th><th>Pronostic</th><th>Équipe</th><th>Écart</th><th>Tag</th></tr></thead>
          <tbody>
            {mirror.weeks.map((w) => (
              <tr key={w.week_start}>
                <td>{w.week_start}</td>
                <td>{w.prediction == null ? "—" : fmt(w.prediction)}</td>
                <td>{w.team_avg == null ? "—" : fmt(w.team_avg)}</td>
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
