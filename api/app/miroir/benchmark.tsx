"use client";

import { useEffect, useState } from "react";
import { api, type Benchmark as Data, type LastWeek } from "@/lib/api";
import { FACTORS } from "../questionnaire";
import { MatrixPlot, Usefulness, ZONES, zoneOf } from "../matrix";
import { TEAM, fmt } from "./chart";

const COMPANY = "#475569";
const pct = (n: number) => `${Math.round(n * 100)} %`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;
const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

// Ton équipe face à l'entreprise, sur la même semaine close : matrice, facteurs, participation.
export function Benchmark({ last, teamSize }: { last: LastWeek; teamSize: number }) {
  const [b, setB] = useState<Data | null>(null);
  useEffect(() => {
    api<Data | null>("/api/benchmark").then(setB, () => {});
  }, []);
  // Comparaison seulement sur la même semaine, et s'il y a d'autres équipes.
  if (!b || b.week_start !== last.week_start || b.teams < 2) return null;

  const rows = last.factors && b.factors
    ? FACTORS.map((f) => ({ ...f, team: last.factors![f.key], company: b.factors![f.key], gap: last.factors![f.key] - b.factors![f.key] })).sort((x, y) => x.gap - y.gap)
    : [];
  const worst = rows[0];
  const best = rows.at(-1);
  const participation = teamSize ? last.responses / teamSize : null;
  const moral = last.team_avg - b.team_avg;

  return (
    <section className="benchmark">
      <h2>Ton équipe face à l&apos;entreprise <small>semaine du {shortDate(b.week_start)}, {b.teams} équipes, {b.responses} réponses</small></h2>

      <div className="benchmark-matrix">
        <MatrixPlot
          label={`Ton équipe en « ${ZONES[zoneOf(last)].label} », l'entreprise en « ${ZONES[zoneOf(b)].label} ».`}
          marks={[
            { p: b, title: "Moyenne de l'entreprise", label: "Entreprise", color: COMPANY, strong: true, up: true },
            { p: last, title: "Ton équipe", label: "Ton équipe", color: TEAM, strong: true },
          ]}
        />
        <Usefulness rows={[{ label: "Ton équipe", value: last.impact, color: TEAM }, { label: "Entreprise", value: b.impact, color: COMPANY }]} />
        <div className="tiles">
          <div className="tile">
            <span>Moral</span>
            <strong>{fmt(last.team_avg)}</strong>
            <span>{signed(moral)} face à l&apos;entreprise ({fmt(b.team_avg)})</span>
          </div>
          <div className="tile">
            <span>Participation</span>
            <strong>{participation == null ? "—" : pct(participation)}</strong>
            <span>{b.participation == null ? "" : `${pct(b.participation)} dans l'entreprise`}</span>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="benchmark-factors">
          <h3>Facteur par facteur <small>écart avec la moyenne de l&apos;entreprise</small></h3>
          <ul className="accuracy-axes bench">
            {rows.map((r) => (
              <li key={r.key}>
                <span>{r.label}</span>
                <div className="diverge" aria-hidden>
                  <i className={r.gap < 0 ? "off" : undefined} style={{ [r.gap >= 0 ? "left" : "right"]: "50%", width: `${Math.min(Math.abs(r.gap) / 2, 1) * 50}%` }} />
                </div>
                <small><b>{signed(r.gap)}</b> · {fmt(r.team)} contre {fmt(r.company)}</small>
              </li>
            ))}
          </ul>
          <div className="diverge-legend bench" aria-hidden><span>en dessous</span><span>au-dessus</span></div>
          <p className="verdict">
            {worst.gap <= -0.3
              ? <>Là où ton équipe décroche le plus : <strong>{worst.label.toLowerCase()}</strong> ({fmt(worst.team)} contre {fmt(worst.company)} dans l&apos;entreprise).</>
              : <>Ton équipe n&apos;est en retrait sur aucun facteur.</>}
            {best && best.gap >= 0.3 && <> Son point fort : <strong>{best.label.toLowerCase()}</strong> ({signed(best.gap)}).</>}
          </p>
        </div>
      )}
      <p className="muted small">Moyennes de toutes les équipes ayant au moins 5 réponses cette semaine-là : aucune réponse individuelle n&apos;est visible.</p>
    </section>
  );
}
