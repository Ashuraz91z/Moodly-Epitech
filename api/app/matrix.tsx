"use client";

import { useRef, useState } from "react";
import type { LastWeek } from "@/lib/api";
import { FORECAST, fmt } from "./miroir/chart";

// Matrice du moral (modèle de Warr) : plaisir en hauteur, énergie en largeur, de 1 à 5.
// Le 3e axe, l'impact (sentiment d'avoir été utile), s'affiche à côté en jauge.
// 3 est sur un axe : « mitigé ». Mêmes règles que private.energy_zone côté base.
export type Point = { impact: number; pleasure: number; energy?: number };
export type Zone = "enthusiasm" | "serenity" | "tension" | "dejection" | "middle";

export const ZONES: Record<Zone, { label: string; text: string; color: string }> = {
  enthusiasm: { label: "En forme", text: "Du plaisir et de l'énergie : tu es dans une bonne dynamique.", color: "#6ee7b7" },
  serenity: { label: "Serein·e", text: "Du plaisir mais peu d'énergie : calme, peut-être en train de récupérer.", color: "#93c5fd" },
  tension: { label: "Sous pression", text: "De l'énergie mais peu de plaisir : du stress, à surveiller.", color: "#fdba74" },
  dejection: { label: "À bout", text: "Peu d'énergie et peu de plaisir : un signe d'épuisement, parles-en.", color: "#fca5a5" },
  middle: { label: "Mitigé", text: "Ni vraiment bien, ni vraiment mal.", color: "#e2e8f0" },
};
// Coins de la matrice : haut-gauche, haut-droite, bas-gauche, bas-droite.
const CORNERS = { tl: "serenity", tr: "enthusiasm", bl: "dejection", br: "tension" } as const;
type Corner = keyof typeof CORNERS;

const energyOf = (p: Point) => p.energy ?? 3;
export const zoneOf = (p: Point): Zone => {
  const e = energyOf(p), v = p.pleasure;
  return e > 3 && v > 3 ? "enthusiasm" : e < 3 && v > 3 ? "serenity" : e > 3 && v < 3 ? "tension" : e < 3 && v < 3 ? "dejection" : "middle";
};

const LEVEL = ["très faible", "faible", "moyen", "élevé", "très élevé"];
const LEVEL_F = ["très faible", "faible", "moyenne", "élevée", "très élevée"];
export const describe = (p: Point) => `Plaisir ${LEVEL[Math.round(p.pleasure) - 1]}, énergie ${LEVEL_F[Math.round(energyOf(p)) - 1]}`;

const clamp = (n: number) => Math.max(1, Math.min(5, n));
// Position du point en % (centre de la case), plaisir élevé en haut, énergie à droite.
export const pos = (p: Point) => ({ left: `${(energyOf(p) - 0.5) * 20}%`, top: `${(5.5 - p.pleasure) * 20}%` });

function Quadrants({ content }: { content?: Partial<Record<Corner, React.ReactNode>> }) {
  return (Object.keys(CORNERS) as Corner[]).map((c) => (
    <span key={c} className={`q q-${c}`} style={{ background: `color-mix(in srgb, ${ZONES[CORNERS[c]].color} 38%, #fff)` }}>
      {content?.[c] ?? ZONES[CORNERS[c]].label}
    </span>
  ));
}

// Point plaisir × énergie ; l'impact du point d'origine est conservé. team : pronostic du manager sur son équipe.
export function MatrixInput({ value, onChange, team = false }: { value: Point | null; onChange: (p: Point) => void; team?: boolean }) {
  const pad = useRef<HTMLDivElement>(null);
  // Souris : aperçu de la case visée avant de cliquer.
  const [hover, setHover] = useState<Point | null>(null);

  function at(e: React.PointerEvent): Point {
    const r = pad.current!.getBoundingClientRect();
    return {
      impact: value?.impact ?? 0,
      energy: clamp(1 + Math.floor(((e.clientX - r.left) / r.width) * 5)),
      pleasure: clamp(5 - Math.floor(((e.clientY - r.top) / r.height) * 5)),
    };
  }

  function key(e: React.KeyboardEvent) {
    const move = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!move) return;
    e.preventDefault();
    const p = value ?? { impact: 0, pleasure: 3, energy: 3 };
    onChange({ ...p, energy: clamp(energyOf(p) + move[0]), pleasure: clamp(p.pleasure + move[1]) });
  }

  const placed = value?.energy != null;
  const zone = placed ? zoneOf(value!) : null;
  return (
    <div className="matrix-field">
      <div className="matrix-frame">
        <span className="axis-y" aria-hidden>Plaisir ↑</span>
        <div
          ref={pad}
          className="matrix input"
          tabIndex={0}
          role="group"
          aria-label="Matrice du moral. Flèches gauche et droite pour l'énergie, haut et bas pour le plaisir."
          aria-describedby="matrix-value"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onChange(at(e));
          }}
          onPointerMove={(e) => {
            if (e.buttons) onChange(at(e));
            else if (e.pointerType === "mouse") setHover(at(e));
          }}
          onPointerLeave={() => setHover(null)}
          onKeyDown={key}
        >
          <Quadrants />
          {hover && (hover.energy !== value?.energy || hover.pleasure !== value?.pleasure) && <span className="dot ghost" style={pos(hover)} />}
          {placed ? <span className="dot" style={{ ...pos(value!), background: ZONES[zone!].color }} /> : <span className="matrix-hint">{team ? "Place ton équipe ici" : "Place ton point ici"}</span>}
        </div>
        <span className="axis-x" aria-hidden>Énergie →</span>
      </div>
      <div id="matrix-value" className="zone-card" aria-live="polite" style={zone ? { borderColor: ZONES[zone].color } : undefined}>
        {zone ? (
          <>
            <strong>{ZONES[zone].label}</strong>
            {!team && <span>{ZONES[zone].text}</span>}
            <small>{describe(value!)}</small>
          </>
        ) : (
          <span>{team ? "En haut, l'équipe prend du plaisir au travail ; à droite, elle a de l'énergie." : "En haut, tu as pris du plaisir au travail ; à droite, tu avais de l'énergie."}</span>
        )}
      </div>
    </div>
  );
}

const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const coords = (p: Point) => `${(energyOf(p) - 0.5) * 20},${(5.5 - p.pleasure) * 20}`;

export type Mark = { p: Point; title: string; label?: string; color?: string; strong?: boolean };

// Matrice en lecture : contenu libre par zone, points reliés dans l'ordre (trail), dernier point mis en avant.
export function MatrixPlot({ marks, label, trail = false, zones }: {
  marks: Mark[]; label: string; trail?: boolean; zones?: Partial<Record<Corner, React.ReactNode>>;
}) {
  // Le tracé relie les points sans « strong » explicite (un pronostic, par exemple, reste à part).
  const path = marks.filter((m) => m.strong == null);
  return (
    <div className="matrix-frame">
      <span className="axis-y" aria-hidden>Plaisir ↑</span>
      <div className="matrix" role="img" aria-label={label}>
        <Quadrants content={zones} />
        {trail && path.length > 1 && (
          <svg className="trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={path.map((m) => coords(m.p)).join(" ")} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {marks.map((m, i) => {
          const k = path.indexOf(m);
          const last = m.strong ?? (!trail || k === path.length - 1);
          const x = energyOf(m.p);
          return (
            <span
              key={i}
              className={`mark${last ? " last" : ""}${x > 4 ? " edge-r" : x < 2 ? " edge-l" : ""}`}
              title={m.title}
              style={{ ...pos(m.p), background: m.color, opacity: last || !trail ? undefined : 0.35 + 0.65 * (k / (path.length - 1)) }}
            >
              {m.label && <em>{m.label}</em>}
            </span>
          );
        })}
      </div>
      <span className="axis-x" aria-hidden>Énergie →</span>
    </div>
  );
}

// Le 3e axe : sentiment d'avoir été utile, de 1 à 5, une ou plusieurs valeurs comparées.
export function Usefulness({ rows }: { rows: { label: string; value: number; color?: string }[] }) {
  return (
    <div className="usefulness">
      <span className="usefulness-title">Sentiment d&apos;avoir été utile</span>
      {rows.map((r) => (
        <div key={r.label} className="usefulness-row">
          <span>{r.label}</span>
          <div className="meter" aria-hidden><div style={{ width: `${(r.value / 5) * 100}%`, background: r.color }} /></div>
          <span className="small">{fmt(r.value)} / 5</span>
        </div>
      ))}
    </div>
  );
}

// Coins en pourcentages pour une répartition par zone (manager, back-office).
export const zoneShares = (counts: Partial<Record<Zone, number>>, total: number) =>
  Object.fromEntries((Object.keys(CORNERS) as Corner[]).map((c) => [c, <><b>{Math.round(((counts[CORNERS[c]] ?? 0) / total) * 100)} %</b>{ZONES[CORNERS[c]].label}</>]));

// Côté manager : trajectoire semaine par semaine, répartition de la dernière semaine close
// et, s'il existe, le pronostic fait pour cette semaine-là.
export function TeamMatrix({ data, weeks, forecast }: {
  data: LastWeek; weeks: { week_start: string; pleasure: number | null; energy: number | null; impact: number | null }[]; forecast?: Required<Point> | null;
}) {
  const counts = data.energy_zones ?? {};
  const path = weeks.filter((w) => w.energy != null && w.pleasure != null);
  const marks: Mark[] = path.map((w, i) => ({
    p: { impact: w.impact ?? 0, pleasure: w.pleasure!, energy: w.energy! },
    title: `Semaine du ${shortDate(w.week_start)}`,
    label: i === path.length - 1 ? "Équipe" : i === 0 ? shortDate(w.week_start) : undefined,
  }));
  if (forecast) marks.push({ p: forecast, title: "Ton pronostic", label: "Ton pronostic", color: FORECAST, strong: true });
  const middle = Math.round(((counts.middle ?? 0) / data.responses) * 100);
  return (
    <div className="team-matrix">
      <MatrixPlot
        marks={marks}
        trail
        zones={zoneShares(counts, data.responses)}
        label={`Trajectoire de l'équipe : ${marks.map((m) => `${m.title}, plaisir ${fmt(m.p.pleasure)}, énergie ${fmt(energyOf(m.p))}`).join(" ; ")}.`}
      />
      <Usefulness rows={[
        { label: "Équipe", value: data.impact },
        ...(forecast ? [{ label: "Ton pronostic", value: forecast.impact, color: FORECAST }] : []),
      ]} />
      <p className="muted small">
        Chaque point est une semaine close, le plus marqué la plus récente{forecast && <>, face à ton pronostic pour cette semaine-là</>}. Pourcentages : semaine du {shortDate(data.week_start)} ({data.responses} réponses),
        dont {middle} % « mitigé ».
        {data.tags.length > 0 && <> Sujets les plus cités : <strong>{data.tags.join(" · ")}</strong>.</>}
      </p>
    </div>
  );
}

// Collaborateur : là où il s'est placé (« Toi ») face à ce que disent ses réponses.
export function Compare({ self, calc }: { self: Required<Point>; calc: Required<Point> }) {
  const marks: Mark[] = [
    { p: calc, title: "D'après tes réponses", label: "Tes réponses", color: "var(--primary)", strong: true },
    { p: self, title: "Là où tu t'es placé·e", label: "Toi", color: "var(--ink)", strong: true },
  ];
  const zs = ZONES[zoneOf(self)].label, zc = ZONES[zoneOf(calc)].label;
  return (
    <div className="compare">
      <figure>
        <figcaption>
          <strong>Toi : {zs}</strong>
          <span>Tes réponses : {zc}</span>
        </figcaption>
        <MatrixPlot marks={marks} label={`Tu te places en « ${zs} », tes réponses te situent en « ${zc} ».`} />
      </figure>
      <Usefulness rows={[{ label: "Toi", value: self.impact, color: "var(--ink)" }, { label: "Tes réponses", value: calc.impact }]} />
    </div>
  );
}
