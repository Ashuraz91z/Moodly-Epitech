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
import { AGREE, SHORT, STATEMENTS, TRENDS, USEFUL, WISHES, compareText, factorsOf, fromAnswers, needsHelp } from "../questionnaire";

type Step = "loading" | "onboarding" | "closed" | "questions" | "done";

// Le questionnaire, écran par écran : 9 affirmations, le bilan de la semaine, puis le ressenti.
type Kind = "agree" | "trend" | "tags" | "wish" | "matrix" | "useful";
const STEPS: { kind: Kind; short: string; group: string }[] = [
  ...SHORT.map((short) => ({ kind: "agree" as const, short, group: "Ta semaine" })),
  { kind: "trend", short: "Comparée à la précédente", group: "Le bilan" },
  { kind: "tags", short: "Ce qui a pesé", group: "Le bilan" },
  { kind: "wish", short: "Ce qui t'aiderait", group: "Le bilan" },
  { kind: "matrix", short: "Ta place sur la matrice", group: "Ton ressenti" },
  { kind: "useful", short: "Sentiment d'utilité", group: "Ton ressenti" },
];
const GROUPS = [...new Set(STEPS.map((s) => s.group))];
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
  const [impact, setImpact] = useState<number | null>(null);
  const [wish, setWish] = useState<number | null>(null); // index dans WISHES
  const [q, setQ] = useState(0);
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
      await api("/api/moods", { pleasure: point!.pleasure, energy: point!.energy, impact, answers: all, trend, tagIds: picked, wish: WISHES[wish!].key });
      const entry: Entry = { impact: impact!, pleasure: point!.pleasure, energy: point!.energy!, answers: all };
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

  if (step === "loading") {
    return <main className="screen"><Header />{error ? <p className="error" role="alert">{error}</p> : <Loader />}</main>;
  }

  return <Wizard {...{ q, setQ, answers, setAnswers, trend, setTrend, tags, picked, toggle, wish, setWish, point, setPoint, impact, setImpact, error, busy, send }} />;
}

type WizardProps = {
  q: number; setQ: React.Dispatch<React.SetStateAction<number>>;
  answers: (number | null)[]; setAnswers: React.Dispatch<React.SetStateAction<(number | null)[]>>;
  trend: number | null; setTrend: (v: number) => void;
  tags: Tag[]; picked: number[]; toggle: (id: number) => void;
  wish: number | null; setWish: (v: number) => void;
  point: Point | null; setPoint: (p: Point) => void;
  impact: number | null; setImpact: (v: number) => void;
  error: string; busy: boolean; send: () => void;
};

// Une question par écran, avec la liste des questions sur le côté (barre de progression sur mobile).
function Wizard({ q, setQ, answers, setAnswers, trend, setTrend, tags, picked, toggle, wish, setWish, point, setPoint, impact, setImpact, error, busy, send }: WizardProps) {
  const answered = (k: number) =>
    ({
      agree: answers[k] != null,
      trend: trend != null,
      tags: picked.length > 0,
      wish: wish != null,
      matrix: point?.energy != null,
      useful: impact != null,
    })[STEPS[k].kind];
  const firstOpen = STEPS.findIndex((_, k) => !answered(k));
  const reachable = (k: number) => firstOpen === -1 || k <= firstOpen;
  const done = STEPS.filter((_, k) => answered(k)).length;
  const step = STEPS[q];
  const last = q === STEPS.length - 1;

  // Passe à la suivante après un choix à la souris ou au doigt (pas aux flèches du clavier).
  const advance = (k: number) => setTimeout(() => setQ((cur) => (cur === k && k < STEPS.length - 1 ? k + 1 : cur)), 260);
  const setAnswer = (k: number, v: number) => setAnswers((a) => a.map((x, i) => (i === k ? v : x)));

  // Touches 1 à 5 sur les affirmations.
  useEffect(() => {
    if (step.kind !== "agree") return;
    const onKey = (e: KeyboardEvent) => {
      const v = Number(e.key);
      if (v >= 1 && v <= 5 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setAnswers((a) => a.map((x, i) => (i === q ? v : x)));
        advance(q);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  function go(k: number) {
    setQ(k);
    scrollTo({ top: 0 });
  }

  const options = (name: string, labels: string[], value: number | null, onPick: (v: number) => void, values?: number[], auto = true) => (
    <div className="answers" role="radiogroup">
      {labels.map((label, i) => {
        const v = values?.[i] ?? i + 1;
        return (
          <label key={label} className="answer">
            <input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} onClick={(e) => auto && e.detail > 0 && advance(q)} />
            {!values && <span className="n">{v}</span>}
            {label}
          </label>
        );
      })}
    </div>
  );

  const mood = step.kind === "matrix" && point?.energy != null ? ZONES[zoneOf(point)] : null;
  return (
    <main className={`screen wizard${mood ? " mood" : ""}`} style={mood ? ({ "--mood": mood.color } as React.CSSProperties) : undefined}>
      <Header />
      <aside className="wizard-nav" aria-label="Les questions">
        <div className="wizard-progress" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={done} aria-label="Questions répondues">
          <div style={{ width: `${(done / STEPS.length) * 100}%` }} />
        </div>
        <p className="wizard-count">{done} sur {STEPS.length} · environ 2 minutes</p>
        {GROUPS.map((g) => (
          <div key={g} className="wizard-group">
            <p>{g}</p>
            <ol>
              {STEPS.map((s, k) => s.group === g && (
                <li key={k}>
                  <button className={answered(k) ? "done" : undefined} aria-current={k === q ? "step" : undefined} disabled={!reachable(k)} onClick={() => go(k)}>
                    <span className="n" aria-hidden>{answered(k) && k !== q ? <Icon name="check" size={12} /> : k + 1}</span>
                    {s.short}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
        <Links />
      </aside>

      <section className="wizard-main" key={q}>
        <p className="step-label">Question {q + 1} sur {STEPS.length} · {step.group}</p>
        {step.kind === "agree" && (
          <>
            <div className="intro">
              <p className="wizard-lead">Cette semaine…</p>
              <h1>{STATEMENTS[q]}</h1>
            </div>
            {options(`q${q}`, AGREE, answers[q], (v) => setAnswer(q, v))}
            <p className="hint wizard-keys">Astuce : touches 1 à 5 au clavier.</p>
          </>
        )}
        {step.kind === "trend" && (
          <>
            <div className="intro"><h1>Par rapport à la semaine dernière, ta semaine a été…</h1></div>
            {options("trend", TRENDS.map((t) => t.label), trend, setTrend, TRENDS.map((t) => t.value))}
          </>
        )}
        {step.kind === "tags" && (
          <>
            <div className="intro">
              <h1>Qu&apos;est-ce qui a le plus pesé cette semaine, en bien ou en mal ?</h1>
              <p className="sub">Choisis 1 à 3 sujets.</p>
            </div>
            <div className="chips">
              {tags.map((t) => (
                <button key={t.id} className="chip" aria-pressed={picked.includes(t.id)} disabled={!picked.includes(t.id) && picked.length >= 3} onClick={() => toggle(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
        {step.kind === "wish" && (
          <>
            <div className="intro">
              <h1>Qu&apos;est-ce qui t&apos;aiderait le plus en ce moment ?</h1>
              <p className="sub">Ton choix compte, anonymement, dans le vote de l&apos;équipe : ton manager voit ce que l&apos;équipe demande le plus.</p>
            </div>
            {options("wish", WISHES.map((w) => w.label), wish, setWish, WISHES.map((_, i) => i))}
          </>
        )}
        {step.kind === "matrix" && (
          <>
            <div className="intro">
              <h1>Et toi, où te situes-tu cette semaine ?</h1>
              <p className="sub">Avant de voir ce que disent tes réponses, place-toi toi-même : le plaisir que tu as pris au travail, et ton énergie.</p>
            </div>
            <MatrixInput value={point} onChange={setPoint} />
          </>
        )}
        {step.kind === "useful" && (
          <>
            <div className="intro"><h1>As-tu eu le sentiment d&apos;être utile cette semaine ?</h1></div>
            {options("impact", USEFUL, impact, setImpact, undefined, false)}
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        <div className="wizard-foot">
          <button className="link" disabled={q === 0} onClick={() => go(q - 1)}>← Précédente</button>
          {last ? (
            <button className="btn small" disabled={firstOpen !== -1 || busy} onClick={send}>{busy ? "Envoi…" : "Voir ce que disent mes réponses"}</button>
          ) : (
            <button className="btn small" disabled={!answered(q)} onClick={() => go(q + 1)}>Suivante →</button>
          )}
        </div>
        {last && firstOpen !== -1 && answered(q) && <p className="hint">Il manque une réponse : « {STEPS[firstOpen].short} ».</p>}
        <p className="note">Ton manager ne verra jamais ta réponse individuelle.</p>
      </section>
    </main>
  );
}
