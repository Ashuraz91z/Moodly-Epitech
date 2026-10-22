"use client";

import { useEffect, useState } from "react";
import { api, type Wishes } from "@/lib/api";
import type { FactorKey } from "../questionnaire";

const MS = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (n: number) => `${Math.round(n * 100)} %`;

// Ce que l'équipe demande, vu côté manager (mêmes clés que le vote du questionnaire).
const ASKS: Record<FactorKey | "rien", string> = {
  intensite: "Alléger la charge, mieux prioriser",
  autonomie: "Plus de liberté pour s'organiser",
  emotions: "Du soutien face aux situations tendues",
  relations: "Plus d'échanges et de reconnaissance",
  sens: "Mieux voir à quoi sert son travail",
  securite: "Plus de visibilité sur l'avenir",
  rien: "Rien de particulier, ça va",
};

// Vote de fin de questionnaire : ce qui aiderait le plus l'équipe, dernière semaine close (5 votes minimum).
export function TeamVotes() {
  const [wishes, setWishes] = useState<Wishes[] | null>(null);
  useEffect(() => {
    api<Wishes[]>("/api/wishes?weeks=2").then(setWishes, () => setWishes([]));
  }, []);
  if (!wishes) return null;

  const latest = wishes.at(-1);
  const prev = latest && wishes.find((w) => w.week_start === iso(utc(latest.week_start) - 7 * MS));
  const ranked = latest
    ? (Object.entries(latest.wishes) as [FactorKey | "rien", number][]).sort((a, b) => (a[0] === "rien" ? 1 : b[0] === "rien" ? -1 : b[1] - a[1]))
    : [];

  return (
    <div className="votes">
      <h2>Ce que ton équipe demande <small>{latest ? `${latest.votes} votes, semaine du ${shortDate(latest.week_start)}` : "vote de fin de questionnaire"}</small></h2>
      {latest ? (
        <ol className="wish-list">
          {ranked.map(([k, n], i) => {
            const was = prev?.wishes[k] ?? (prev ? 0 : undefined);
            return (
              <li key={k} className={i === 0 && k !== "rien" ? "top" : k === "rien" ? "calm" : undefined}>
                <span>{ASKS[k]}</span>
                <div className="meter" aria-hidden><div style={{ width: pct(n / latest.votes) }} /></div>
                <b>{pct(n / latest.votes)}</b>
                {was != null && was !== n && <small>{n > was ? "+" : "−"}{Math.abs(n - was)} vote{Math.abs(n - was) > 1 ? "s" : ""} par rapport à la semaine d&apos;avant</small>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="note">Les votes de l&apos;équipe s&apos;affichent ici dès qu&apos;une semaine close compte 5 votes.</p>
      )}
      <p className="muted small">Chaque collaborateur choisit, anonymement, ce qui l&apos;aiderait le plus.</p>
    </div>
  );
}
