"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Me, type Tag } from "@/lib/api";
import { todayInParis } from "../miroir/chart";
import { Logout } from "../logout";
import { Icon, Loader } from "../icons";

const FACES = [
  { color: "#fca5a5", label: "Épuisé·e" },
  { color: "#fdba74", label: "Pas terrible" },
  { color: "#fde68a", label: "Bof" },
  { color: "#bef264", label: "Bien" },
  { color: "#6ee7b7", label: "Au top" },
];
const ONBOARDING_KEY = "moodly-onboarding-vu";
// Historique personnel : uniquement dans ce navigateur, jamais envoyé (la base ne sait pas qui a répondu quoi).
const historyKey = (userId: string) => `moodly-historique-${userId}`;

type History = Record<string, number>;

function readHistory(userId: string): History {
  try { return JSON.parse(localStorage.getItem(historyKey(userId)) ?? "{}"); } catch { return {}; }
}

function lastDays(today: string, n: number) {
  const t = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, k) => new Date(t - (n - 1 - k) * 864e5).toISOString().slice(0, 10));
}

function streak(history: History, today: string) {
  let n = 0;
  for (const d of lastDays(today, 365).reverse()) {
    if (history[d]) n++;
    else if (d !== today) break;
  }
  return n;
}

function Face({ score, color }: { score: number; color: string }) {
  const curve = 36 + (score - 3) * 5;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="26" fill={color} />
      <circle cx="20" cy="23" r="2.5" fill="#1f2937" />
      <circle cx="36" cy="23" r="2.5" fill="#1f2937" />
      <path d={`M18 37 Q28 ${curve} 38 37`} stroke="#1f2937" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Done({ history }: { history: History }) {
  const today = todayInParis();
  const days = lastDays(today, 14);
  const score = history[today];
  const n = streak(history, today);
  return (
    <>
      <svg className="done-check" viewBox="0 0 72 72" aria-hidden>
        <circle cx="36" cy="36" r="36" />
        <path d="M22 37l10 10 18-20" pathLength={1} className="draw" />
      </svg>
      <h1>Merci, c&apos;est noté.</h1>
      <p className="sub">Ta réponse compte dans la moyenne de l&apos;équipe. Reviens demain, ça prend moins de 10 secondes.</p>

      {score != null && score <= 2 && (
        <div className="help" role="note">
          <h2>Ça n&apos;a pas l&apos;air facile en ce moment.</h2>
          Tu n&apos;as pas à gérer ça seul·e :
          <ul>
            <li>la <strong>médecine du travail</strong>, tenue au secret médical ;</li>
            <li>une personne de confiance, au travail ou en dehors ;</li>
            <li>en cas de détresse, le <strong>3114</strong> : gratuit, 24 h/24, 7 j/7.</li>
          </ul>
        </div>
      )}

      {n > 0 && (
        <div>
          <div className="streak">
            <strong>{n}</strong>
            <span>{n > 1 ? "jours d'affilée. Continue comme ça !" : "jour. C'est un début !"}</span>
          </div>
          <div className="history" role="img" aria-label="Ton humeur sur les 14 derniers jours">
            {days.map((d) => (
              <span key={d} title={history[d] ? `${d} : ${FACES[history[d] - 1].label}` : d} style={history[d] ? { background: FACES[history[d] - 1].color } : undefined} />
            ))}
          </div>
          <div className="history-legend"><span>il y a 14 jours</span><span>aujourd&apos;hui</span></div>
          <p className="note" style={{ marginTop: 12 }}>Ton historique reste sur cet appareil : il n&apos;est jamais envoyé.</p>
        </div>
      )}
    </>
  );
}

export default function Saisie() {
  const router = useRouter();
  const [step, setStep] = useState<"loading" | "onboarding" | "form" | "done">("loading");
  const [tags, setTags] = useState<Tag[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [history, setHistory] = useState<History>({});
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<{ submitted: boolean }>("/api/moods/today"), api<Tag[]>("/api/tags"), api<Me>("/api/me")])
      .then(([today, tags, me]) => {
        setTags(tags);
        setUserId(me.id);
        setHistory(readHistory(me.id));
        let seen = false;
        try { seen = localStorage.getItem(ONBOARDING_KEY) === "1"; } catch {}
        setStep(today.submitted ? "done" : seen ? "form" : "onboarding");
      })
      .catch((e) => e instanceof ApiError && e.status === 403 ? router.replace("/") : setError(e.message));
  }, [router]);

  function closeOnboarding() {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    setStep("form");
  }

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((t) => t !== id) : [...p, id]));
  }

  async function send() {
    setError("");
    setBusy(true);
    try {
      await api("/api/moods", { score, tagIds: picked });
      const next = { ...readHistory(userId), [todayInParis()]: score! };
      try { localStorage.setItem(historyKey(userId), JSON.stringify(next)); } catch {}
      setHistory(next);
      setStep("done");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setStep("done");
      else setError((e as Error).message);
    }
    setBusy(false);
  }

  const header = (
    <div className="top">
      <p className="eyebrow">Moodly</p>
      <span className="badge"><Icon name="shield" size={14} />100 % anonyme</span>
    </div>
  );

  if (step === "onboarding") {
    return (
      <main className="screen">
        {header}
        <h1>Ta réponse reste anonyme. Vraiment.</h1>
        <ul className="points">
          <li><Icon name="check" /><span>Ta réponse est enregistrée <strong>sans ton identité</strong> : seulement une note, des tags et la date.</span></li>
          <li><Icon name="check" /><span>La base de données <strong>refuse toute lecture individuelle</strong>, même à ton manager.</span></li>
          <li><Icon name="check" /><span>Ton manager ne voit qu&apos;une <strong>moyenne d&apos;équipe</strong>, et seulement à partir de 5 réponses.</span></li>
          <li><Icon name="check" /><span>Pas de commentaire libre, pas de localisation : rien qui permette de te reconnaître.</span></li>
        </ul>
        <p className="note">Le but : que ton manager voie ce qu&apos;il ne voit pas, pour agir avant que ça déraille.</p>
        <button className="btn" onClick={closeOnboarding}>J&apos;ai compris</button>
      </main>
    );
  }

  if (step === "done") {
    return (
      <main className="screen">
        {header}
        <Done history={history} />
        <Logout />
      </main>
    );
  }

  const mood = score ? FACES[score - 1] : null;

  return (
    <main className={`screen${mood ? " mood" : ""}`} style={mood ? ({ "--mood": mood.color } as React.CSSProperties) : undefined}>
      {header}
      {step === "loading" ? (
        error ? <p className="error" role="alert">{error}</p> : <Loader />
      ) : (
        <>
          <h1>Comment te <span style={{ whiteSpace: "nowrap" }}>sens-tu</span> aujourd&apos;hui ?</h1>
          <div>
            <div className="faces" role="group" aria-label="Ton moral, de 1 à 5">
              {FACES.map((f, i) => (
                <button key={i} className="face" aria-pressed={score === i + 1} aria-label={`${i + 1} sur 5 : ${f.label}`} onClick={() => setScore(i + 1)}>
                  <Face score={i + 1} color={f.color} />
                </button>
              ))}
            </div>
            {mood ? <p className="mood-label" aria-live="polite">{mood.label}</p> : <div className="scale" aria-hidden><span>Épuisé·e</span><span>Au top</span></div>}
          </div>
          <div>
            <h2>Qu&apos;est-ce qui joue ? <small>(1 à 3)</small></h2>
            <div className="chips">
              {tags.map((t) => (
                <button key={t.id} className="chip" aria-pressed={picked.includes(t.id)} disabled={!picked.includes(t.id) && picked.length >= 3} onClick={() => toggle(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={!score || picked.length === 0 || busy} onClick={send}>{busy ? "Envoi…" : "Envoyer"}</button>
          {(!score || picked.length === 0) && <p className="hint">{!score ? "Choisis d'abord ton humeur." : "Choisis au moins un sujet."}</p>}
          <p className="note">Ton manager ne verra jamais ta réponse individuelle.</p>
          <Logout />
        </>
      )}
    </main>
  );
}
