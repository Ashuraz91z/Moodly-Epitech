"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Me } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { lastWeeks, mondayOf, readHistory, streak, type History } from "../history";
import { Icon, Loader } from "../icons";
import { MatrixPlot, Usefulness, ZONES, zoneOf, type Zone } from "../matrix";
import { fmt, todayInParis } from "../miroir/chart";
import { fromAnswers } from "../questionnaire";

const WEEKS = 12;
const ORDER: Zone[] = ["enthusiasm", "serenity", "middle", "tension", "dejection"];
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
  const thisWeek = mondayOf(today);
  const weeks = lastWeeks(today, WEEKS);
  const answered = weeks.filter((w) => history[w]);
  const counts = Object.fromEntries(ORDER.map((z) => [z, answered.filter((w) => zoneOf(history[w]) === z).length])) as Record<Zone, number>;
  const top = ORDER.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  const max = Math.max(1, ...Object.values(counts));
  const run = streak(history, today);
  const label = (w: string) => (w === thisWeek ? "Cette semaine" : `Sem. du ${short(w)}`);
  const zoneLabel = (w: string) => ZONES[zoneOf(history[w])].label;
  const avgImpact = answered.reduce((s, w) => s + history[w].impact, 0) / (answered.length || 1);

  // Ressenti face aux réponses : écart moyen du moral (moyenne des 3 axes) sur les semaines comparables.
  const compared = answered.filter((w) => history[w].answers);
  const moral = (p: { impact: number; pleasure: number; energy: number }) => (p.impact + p.pleasure + p.energy) / 3;
  const gap = compared.length ? compared.reduce((s, w) => s + moral(history[w]) - moral(fromAnswers(history[w].answers!)), 0) / compared.length : null;

  function exportCsv() {
    downloadCsv("moodly-mon-parcours", [
      ["Semaine du", "Plaisir", "Énergie", "Utilité", "Zone", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11"],
      ...Object.keys(history!).sort().map((w) => {
        const e = history![w];
        return [w, e.pleasure, e.energy, e.impact, ZONES[zoneOf(e)].label, ...(e.answers ?? [])];
      }),
    ]);
  }

  return (
    <main className="screen wide parcours">
      <div className="top">
        <p className="eyebrow">Mon parcours</p>
        <Link className="link" href="/saisie"><Icon name="x" size={16} />Fermer</Link>
      </div>
      <div className="intro">
        <h1>Ton parcours sur {WEEKS} semaines</h1>
        <p className="sub">Ces données restent sur cet appareil : ni ton manager ni l&apos;entreprise ne les voient.</p>
      </div>

      {answered.length === 0 ? (
        <div className="panel empty">
          <Icon name="chart" size={32} />
          <p>Pas encore de réponse enregistrée sur cet appareil.</p>
          <Link className="btn small" href="/saisie">Répondre au questionnaire</Link>
        </div>
      ) : (
        <>
          <section>
            <h2>Ta trajectoire</h2>
            <MatrixPlot
              trail
              label={`Ta trajectoire sur la matrice : ${answered.map((w) => `${label(w)}, ${zoneLabel(w)}`).join(" ; ")}.`}
              marks={answered.map((w, i) => ({
                p: history[w],
                title: `${label(w)} : ${zoneLabel(w)}`,
                label: i === answered.length - 1 ? label(w) : undefined,
                color: ZONES[zoneOf(history[w])].color,
              }))}
            />
            <p className="muted small">
              {answered.length < 3
                ? "Ton parcours se dessine semaine après semaine : ta trajectoire apparaîtra ici."
                : "Chaque point est une semaine, là où tu t'es placé·e ; le plus marqué est le plus récent."}
            </p>
            <Usefulness rows={[{ label: `Moyenne sur ${answered.length} semaine${answered.length > 1 ? "s" : ""}`, value: avgImpact }]} />
          </section>

          <div className="parcours-side">
            <div className="tiles three">
              <div className="tile"><span>Réponses</span><strong>{answered.length}</strong><span>sur les {WEEKS} dernières semaines</span></div>
              <div className="tile"><span>Série</span><strong>{run}</strong><span>{run > 1 ? "semaines d'affilée" : "semaine, c'est un début"}</span></div>
              <div className="tile zone" style={{ background: `color-mix(in srgb, ${ZONES[top].color} 30%, #fff)` }}>
                <span>Zone la plus fréquente · {counts[top]} semaine{counts[top] > 1 ? "s" : ""} sur {answered.length}</span>
                <strong className="zone-name">{ZONES[top].label}</strong>
                <span>{ZONES[top].text}</span>
              </div>
              {gap != null && (
                <div className="tile zone">
                  <span>Ton ressenti face à tes réponses · {compared.length} semaine{compared.length > 1 ? "s" : ""}</span>
                  <strong className="zone-name">{Math.abs(gap) < 0.5 ? "Ils concordent" : gap > 0 ? "Tu te vois plus haut" : "Tu te vois plus bas"}</strong>
                  <span>
                    {Math.abs(gap) < 0.5
                      ? "Là où tu te places et ce que disent tes réponses se rejoignent."
                      : `En moyenne ${fmt(Math.abs(gap))} pt ${gap > 0 ? "au-dessus" : "en dessous"} de ce que disent tes réponses aux affirmations.`}
                  </span>
                </div>
              )}
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
              <h2>Semaine par semaine</h2>
              <div className="history weeks" role="img" aria-label={`Ta zone semaine par semaine sur ${WEEKS} semaines`}>
                {weeks.map((w) => (
                  <span key={w} title={history[w] ? `${label(w)} : ${ZONES[zoneOf(history[w])].label}` : `${label(w)} : pas de réponse`} style={history[w] ? { background: ZONES[zoneOf(history[w])].color } : undefined} />
                ))}
              </div>
              <div className="history-legend"><span>{label(weeks[0])}</span><span>cette semaine</span></div>
            </section>

            <button className="ghost" onClick={exportCsv}><Icon name="download" size={16} />Exporter mes données (CSV)</button>
          </div>
        </>
      )}
    </main>
  );
}
