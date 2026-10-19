"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Me } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { lastDays, readHistory, streak, type History } from "../history";
import { Icon, Loader } from "../icons";
import { MatrixPlot, ZONES, zoneOf, type Zone } from "../matrix";
import { todayInParis } from "../miroir/chart";

const DAYS = 30;
const ORDER: Zone[] = ["thriving", "dreamer", "middle", "robot", "danger"];
const short = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

// Mon parcours : lu uniquement depuis cet appareil, rien n'est demandé au serveur à part l'identité.
export default function Parcours() {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Me>("/api/me").then((me) => setHistory(readHistory(me.id)), (e) => setError(e.message));
  }, []);

  if (!history) return <main className="screen">{error ? <p className="error" role="alert">{error}</p> : <Loader />}</main>;

  const today = todayInParis();
  const days = lastDays(today, DAYS);
  const answered = days.filter((d) => history[d]);
  const counts = Object.fromEntries(ORDER.map((z) => [z, answered.filter((d) => zoneOf(history[d]) === z).length])) as Record<Zone, number>;
  const top = ORDER.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  const max = Math.max(1, ...Object.values(counts));

  function exportCsv() {
    downloadCsv("moodly-mon-parcours", [
      ["Date", "Impact", "Plaisir", "Zone"],
      ...Object.keys(history!).sort().map((d) => [d, history![d].impact, history![d].pleasure, ZONES[zoneOf(history![d])].label]),
    ]);
  }

  return (
    <main className="screen wide parcours">
      <div className="top">
        <p className="eyebrow">Mon parcours</p>
        <Link className="link" href="/saisie"><Icon name="x" size={16} />Fermer</Link>
      </div>
      <div className="intro">
        <h1>Ton parcours sur {DAYS} jours</h1>
        <p className="sub">Ces données restent sur cet appareil : ni ton manager ni l&apos;entreprise ne les voient.</p>
      </div>

      {answered.length === 0 ? (
        <div className="panel empty">
          <Icon name="chart" size={32} />
          <p>Pas encore de réponse enregistrée sur cet appareil.</p>
          <Link className="btn small" href="/saisie">Répondre aujourd&apos;hui</Link>
        </div>
      ) : (
        <>
          <section>
            <h2>Ta trajectoire</h2>
            <MatrixPlot
              trail
              label={`Ta trajectoire sur la matrice : ${answered.map((d) => `${short(d)}, ${ZONES[zoneOf(history[d])].label}`).join(" ; ")}.`}
              marks={answered.map((d, i) => ({
                p: history[d],
                title: `${short(d)} : ${ZONES[zoneOf(history[d])].label}`,
                label: i === answered.length - 1 ? (d === today ? "Aujourd'hui" : short(d)) : undefined,
                color: ZONES[zoneOf(history[d])].color,
              }))}
            />
            <p className="muted small">Chaque point est une journée ; le plus marqué est le plus récent.</p>
          </section>

          <div className="parcours-side">
            <div className="tiles three">
              <div className="tile"><span>Réponses</span><strong>{answered.length}</strong><span>sur {DAYS} jours</span></div>
              <div className="tile"><span>Série</span><strong>{streak(history, today)}</strong><span>jours d&apos;affilée</span></div>
              <div className="tile" style={{ background: `color-mix(in srgb, ${ZONES[top].color} 30%, #fff)` }}>
                <span>Zone fréquente</span><strong className="zone-name">{ZONES[top].label}</strong><span>{counts[top]} jour{counts[top] > 1 ? "s" : ""}</span>
              </div>
            </div>

            <section>
              <h2>Répartition</h2>
              <ol className="bars">
                {ORDER.map((z) => (
                  <li key={z}>
                    <span>{ZONES[z].label}</span>
                    <div className="meter" aria-hidden><div style={{ width: `${(counts[z] / max) * 100}%`, background: ZONES[z].color }} /></div>
                    <span className="small">{counts[z]}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h2>Calendrier</h2>
              <div className="history month" role="img" aria-label={`Ta zone jour par jour sur ${DAYS} jours`}>
                {days.map((d) => (
                  <span key={d} title={history[d] ? `${short(d)} : ${ZONES[zoneOf(history[d])].label}` : `${short(d)} : pas de réponse`} style={history[d] ? { background: ZONES[zoneOf(history[d])].color } : undefined} />
                ))}
              </div>
              <div className="history-legend"><span>{short(days[0])}</span><span>aujourd&apos;hui</span></div>
            </section>

            <button className="ghost" onClick={exportCsv}><Icon name="download" size={16} />Exporter mes données (CSV)</button>
          </div>
        </>
      )}
    </main>
  );
}
