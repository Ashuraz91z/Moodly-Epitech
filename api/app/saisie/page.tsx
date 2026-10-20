"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, type Me, type Tag } from "@/lib/api";
import { fmt, todayInParis } from "../miroir/chart";
import { Logout } from "../logout";
import { Icon, Loader } from "../icons";
import { Compare, MatrixInput, ZONES, zoneOf, type Point } from "../matrix";
import { ONBOARDING_KEY, historyKey, lastWeeks, mondayOf, readHistory, streak, type Entry, type History } from "../history";
import { AGREE, ENERGY, STATEMENTS, TRENDS, compareText, factorsOf, fromAnswers, needsHelp } from "../questionnaire";

type Step = "loading" | "onboarding" | "closed" | "questions" | "self" | "done";
type WeekStatus = { submitted: boolean; open: boolean; opens_on: string };
const longDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const short = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

const Header = () => (
  <div className="top">
    <p className="eyebrow">Moodly</p>
    <span className="badge"><Icon name="shield" size={14} />100 % anonyme</span>
  </div>
);

const Links = () => (
  <div className="links">
    <Link className="link" href="/parcours"><Icon name="chart" size={16} />Mon parcours</Link>
    <Logout />
  </div>
);

function Help() {
  return (
    <div className="help" role="note">
      <h2>Ça n&apos;a pas l&apos;air facile en ce moment.</h2>
      Tu n&apos;as pas à gérer ça seul·e :
      <ul>
        <li>la <strong>médecine du travail</strong>, tenue au secret médical ;</li>
        <li>une personne de confiance, au travail ou en dehors ;</li>
        <li>en cas de détresse, le <strong>3114</strong> : gratuit, 24 h/24, 7 j/7.</li>
      </ul>
    </div>
  );
}

// Après l'envoi : où la personne s'est placée face à ce que disent ses réponses.
function Done({ history }: { history: History }) {
  const today = todayInParis();
  const entry = history[mondayOf(today)];
  const weeks = lastWeeks(today, 12);
  const n = streak(history, today);
  const calc = entry?.answers && fromAnswers(entry.answers);
  const factors = entry?.answers && [...factorsOf(entry.answers)].sort((a, b) => b.value - a.value);
  return (
    <>
      <div className="done-head">
        <svg className="done-check" viewBox="0 0 72 72" aria-hidden>
          <circle cx="36" cy="36" r="36" />
          <path d="M22 37l10 10 18-20" pathLength={1} className="draw" />
        </svg>
        <div>
          <h1>{calc ? "Voici ce que disent tes réponses" : "Merci, c'est noté pour cette semaine."}</h1>
          <p className="sub">
            Envoyé, de façon anonyme. Ta réponse rejoindra les résultats de l&apos;équipe lundi, une fois la semaine close
            et avec au moins 5 réponses. Rendez-vous jeudi prochain.
          </p>
        </div>
      </div>

      {calc && (
        <section>
          <Compare self={entry} calc={calc} />
          <p className="verdict">{compareText(entry, calc)}</p>
          {factors && factors[0].value - factors.at(-1)!.value >= 1 && (
            <div className="insights">
              <div><span>Point d&apos;appui</span><strong>{factors[0].label}</strong><small>{fmt(factors[0].value)} / 5</small></div>
              <div className="watch"><span>Point de vigilance</span><strong>{factors.at(-1)!.label}</strong><small>{fmt(factors.at(-1)!.value)} / 5</small></div>
            </div>
          )}
        </section>
      )}

      {entry && needsHelp(entry, entry.answers) && <Help />}

      {n > 0 && (
        <div>
          <div className="streak">
            <strong>{n}</strong>
            <span>{n > 1 ? "semaines d'affilée. Continue comme ça !" : "semaine. C'est un début !"}</span>
          </div>
          <div className="history weeks" role="img" aria-label="Ta zone sur la matrice, les 12 dernières semaines">
            {weeks.map((w) => (
              <span key={w} title={history[w] ? `Semaine du ${short(w)} : ${ZONES[zoneOf(history[w])].label}` : `Semaine du ${short(w)}`} style={history[w] ? { background: ZONES[zoneOf(history[w])].color } : undefined} />
            ))}
          </div>
          <div className="history-legend"><span>il y a 12 semaines</span><span>cette semaine</span></div>
          <p className="note" style={{ marginTop: 12 }}>Ton historique et ta comparaison restent sur cet appareil : ils ne sont jamais envoyés.</p>
          <Link className="btn ghost-btn" href="/parcours" style={{ marginTop: 12 }}><Icon name="chart" size={18} />Voir mon parcours</Link>
        </div>
      )}
    </>
  );
}

export default function Saisie() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [opensOn, setOpensOn] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>(() => STATEMENTS.map(() => null));
  const [trend, setTrend] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [point, setPoint] = useState<Point | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [history, setHistory] = useState<History>({});
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<WeekStatus>("/api/moods/week"), api<Tag[]>("/api/tags"), api<Me>("/api/me")])
      .then(([week, tags, me]) => {
        setTags(tags);
        setUserId(me.id);
        setHistory(readHistory(me.id));
        setOpensOn(week.opens_on);
        let seen = false;
        try { seen = localStorage.getItem(ONBOARDING_KEY) === "1"; } catch {}
        setStep(week.submitted ? "done" : !week.open ? "closed" : seen ? "questions" : "onboarding");
      })
      .catch((e) => e instanceof ApiError && e.status === 403 ? router.replace("/") : setError(e.message));
  }, [router]);

  function go(next: Step) {
    setStep(next);
    scrollTo({ top: 0 });
  }

  function closeOnboarding() {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    go("questions");
  }

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((t) => t !== id) : [...p, id]));
  }

  async function send() {
    setError("");
    setBusy(true);
    const all = answers as number[];
    try {
      await api("/api/moods", { pleasure: point!.pleasure, energy, impact: point!.impact, answers: all, trend, tagIds: picked });
      const entry: Entry = { impact: point!.impact, pleasure: point!.pleasure, energy: energy!, answers: all };
      const next = { ...readHistory(userId), [mondayOf(todayInParis())]: entry };
      try { localStorage.setItem(historyKey(userId), JSON.stringify(next)); } catch {}
      setHistory(next);
      go("done");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) go("done");
      else setError((e as Error).message);
    }
    setBusy(false);
  }

  if (step === "onboarding") {
    return (
      <main className="screen">
        <Header />
        <h1>Ta réponse reste anonyme. Vraiment.</h1>
        <ul className="points">
          <li><Icon name="check" /><span>Ta réponse est enregistrée <strong>sans ton identité</strong> : seulement tes réponses, ton point sur la matrice, des sujets et la semaine.</span></li>
          <li><Icon name="check" /><span>La base de données <strong>refuse toute lecture individuelle</strong>, même à ton manager.</span></li>
          <li><Icon name="check" /><span>Ton manager ne voit qu&apos;une <strong>moyenne d&apos;équipe</strong>, une fois la semaine close et à partir de 5 réponses.</span></li>
          <li><Icon name="check" /><span>Pas de commentaire libre, pas de localisation : rien qui permette de te reconnaître.</span></li>
        </ul>
        <p className="note">Une fois par semaine, le jeudi ou le vendredi : 2 minutes sur ta semaine de travail.</p>
        <button className="btn" onClick={closeOnboarding}>J&apos;ai compris</button>
      </main>
    );
  }

  if (step === "closed") {
    return (
      <main className="screen">
        <Header />
        <h1>Rendez-vous {opensOn ? longDate(opensOn) : "jeudi"}</h1>
        <p className="sub">Le questionnaire de la semaine est ouvert le jeudi et le vendredi : 2 minutes pour faire le point sur ta semaine de travail.</p>
        <p className="note">En attendant, ton parcours des semaines passées est disponible.</p>
        <Link className="btn ghost-btn" href="/parcours"><Icon name="chart" size={18} />Voir mon parcours</Link>
        <Logout />
      </main>
    );
  }

  if (step === "done") {
    return (
      <main className="screen roomy">
        <Header />
        <Done history={history} />
        <Logout />
      </main>
    );
  }

  if (step === "self") {
    const mood = point ? ZONES[zoneOf(point)] : null;
    const ready = point && energy;
    return (
      <main className={`screen saisie${mood ? " mood" : ""}`} style={mood ? ({ "--mood": mood.color } as React.CSSProperties) : undefined}>
        <Header />
        <div className="intro">
          <p className="step-label">Étape 2 sur 2 · Ton ressenti</p>
          <h1>Et toi, où te situes-tu cette semaine ?</h1>
          <p className="sub">Avant de voir ce que disent tes réponses, place-toi toi-même : ton plaisir au travail, et ton sentiment d&apos;avoir été utile.</p>
        </div>
        <MatrixInput value={point} onChange={setPoint} />
        <div className="saisie-side">
          <fieldset className="segmented energy">
            <legend>Et ton niveau d&apos;énergie ?</legend>
            {ENERGY.map((label, i) => (
              <label key={label}><input type="radio" name="energy" checked={energy === i + 1} onChange={() => setEnergy(i + 1)} />{label}</label>
            ))}
          </fieldset>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={!ready || busy} onClick={send}>{busy ? "Envoi…" : "Voir ce que disent mes réponses"}</button>
          {!ready && <p className="hint">{!point ? "Place ton point sur la matrice." : "Indique ton niveau d'énergie."}</p>}
          <button className="link" onClick={() => go("questions")}>← Revoir mes réponses</button>
        </div>
      </main>
    );
  }

  const missing = answers.filter((a) => a == null).length;
  const complete = missing === 0 && trend != null && picked.length > 0;
  return (
    <main className="screen roomy">
      <Header />
      {step === "loading" ? (
        error ? <p className="error" role="alert">{error}</p> : <Loader />
      ) : (
        <>
          <div className="intro">
            <p className="step-label">Étape 1 sur 2 · Ta semaine</p>
            <h1>Ta semaine en 9 affirmations</h1>
            <p className="sub">« Cette semaine… » Réponds de 1 (pas du tout d&apos;accord) à 5 (tout à fait d&apos;accord). Environ 2 minutes.</p>
          </div>
          <ol className="likert">
            {STATEMENTS.map((text, i) => (
              <li key={text}>
                <fieldset>
                  <legend><span className="qn">{i + 1}</span>{text}</legend>
                  <div className="scale5">
                    {AGREE.map((label, v) => (
                      <label key={label} title={label}>
                        <input
                          type="radio"
                          name={`q${i}`}
                          checked={answers[i] === v + 1}
                          onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? v + 1 : x)))}
                          aria-label={label}
                        />
                        <span>{v + 1}</span>
                      </label>
                    ))}
                  </div>
                  <div className="scale5-ends" aria-hidden><span>Pas du tout d&apos;accord</span><span>Tout à fait</span></div>
                </fieldset>
              </li>
            ))}
          </ol>
          <fieldset className="segmented">
            <legend>Par rapport à la semaine dernière, ta semaine a été…</legend>
            {TRENDS.map((t) => (
              <label key={t.value}><input type="radio" name="trend" checked={trend === t.value} onChange={() => setTrend(t.value)} />{t.label}</label>
            ))}
          </fieldset>
          <div>
            <h2>Qu&apos;est-ce qui a le plus pesé cette semaine, en bien ou en mal ? <small>(1 à 3)</small></h2>
            <div className="chips">
              {tags.map((t) => (
                <button key={t.id} className="chip" aria-pressed={picked.includes(t.id)} disabled={!picked.includes(t.id) && picked.length >= 3} onClick={() => toggle(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" disabled={!complete} onClick={() => go("self")}>Continuer</button>
          {!complete && (
            <p className="hint">
              {missing ? `Encore ${missing} affirmation${missing > 1 ? "s" : ""}.` : trend == null ? "Compare avec la semaine dernière." : "Choisis au moins un sujet."}
            </p>
          )}
          <p className="note">Ton manager ne verra jamais ta réponse individuelle.</p>
          <Links />
        </>
      )}
    </main>
  );
}
