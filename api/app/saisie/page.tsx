"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, type Me, type Tag } from "@/lib/api";
import { todayInParis } from "../miroir/chart";
import { Logout } from "../logout";
import { Icon, Loader } from "../icons";
import { MatrixInput, ZONES, zoneOf, type Point } from "../matrix";
import { ONBOARDING_KEY, historyKey, lastDays, readHistory, streak, type History } from "../history";

function Done({ history }: { history: History }) {
  const today = todayInParis();
  const days = lastDays(today, 14);
  const point = history[today];
  const n = streak(history, today);
  return (
    <>
      <svg className="done-check" viewBox="0 0 72 72" aria-hidden>
        <circle cx="36" cy="36" r="36" />
        <path d="M22 37l10 10 18-20" pathLength={1} className="draw" />
      </svg>
      <h1>Merci, c&apos;est noté.</h1>
      <p className="sub">Ta réponse compte dans la moyenne de l&apos;équipe. Reviens demain, ça prend moins de 10 secondes.</p>

      {point != null && point.pleasure <= 2 && (
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
          <div className="history" role="img" aria-label="Ta zone sur la matrice, les 14 derniers jours">
            {days.map((d) => (
              <span key={d} title={history[d] ? `${d} : ${ZONES[zoneOf(history[d])].label}` : d} style={history[d] ? { background: ZONES[zoneOf(history[d])].color } : undefined} />
            ))}
          </div>
          <div className="history-legend"><span>il y a 14 jours</span><span>aujourd&apos;hui</span></div>
          <p className="note" style={{ marginTop: 12 }}>Ton historique reste sur cet appareil : il n&apos;est jamais envoyé.</p>
          <Link className="btn ghost-btn" href="/parcours" style={{ marginTop: 12 }}><Icon name="chart" size={18} />Voir mon parcours</Link>
        </div>
      )}
    </>
  );
}

export default function Saisie() {
  const router = useRouter();
  const [step, setStep] = useState<"loading" | "onboarding" | "form" | "done">("loading");
  const [tags, setTags] = useState<Tag[]>([]);
  const [point, setPoint] = useState<Point | null>(null);
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
      await api("/api/moods", { ...point, tagIds: picked });
      const next = { ...readHistory(userId), [todayInParis()]: point! };
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
          <li><Icon name="check" /><span>Ta réponse est enregistrée <strong>sans ton identité</strong> : seulement ton point sur la matrice, des tags et la date.</span></li>
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

  const mood = point ? ZONES[zoneOf(point)] : null;

  return (
    <main className={`screen saisie${mood ? " mood" : ""}`} style={mood ? ({ "--mood": mood.color } as React.CSSProperties) : undefined}>
      {header}
      {step === "loading" ? (
        error ? <p className="error" role="alert">{error}</p> : <Loader />
      ) : (
        <>
          <div className="intro">
            <h1>Où te <span style={{ whiteSpace: "nowrap" }}>situes-tu</span> aujourd&apos;hui ?</h1>
            <p className="sub">Place ton point sur la matrice du bonheur au travail.</p>
          </div>
          <MatrixInput value={point} onChange={setPoint} />
          <div className="saisie-side">
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
            <button className="btn" disabled={!point || picked.length === 0 || busy} onClick={send}>{busy ? "Envoi…" : "Envoyer"}</button>
            {(!point || picked.length === 0) && <p className="hint">{!point ? "Place d'abord ton point sur la matrice." : "Choisis au moins un sujet."}</p>}
            <p className="note">Ton manager ne verra jamais ta réponse individuelle.</p>
            <div className="links">
              <Link className="link" href="/parcours"><Icon name="chart" size={16} />Mon parcours</Link>
              <Logout />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
