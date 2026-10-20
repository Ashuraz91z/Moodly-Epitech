"use client";

import { useRef, useState } from "react";
import type { LastWeek } from "@/lib/api";

// Matrice du bonheur au travail, de 1 à 5 sur trois axes. Le plaisir est toujours en hauteur ;
// en largeur, l'impact (sentiment d'être utile) ou l'énergie (modèle de Warr).
// 3 est sur un axe : « entre deux ». Mêmes règles que private.zone / private.energy_zone côté base.
export type Point = { impact: number; pleasure: number; energy?: number };
export type Axis = "impact" | "energy";
export type Zone = "thriving" | "dreamer" | "danger" | "robot" | "middle";
export type EnergyZone = "enthusiasm" | "serenity" | "tension" | "dejection" | "middle";
type ZoneInfo = { label: string; text: string; color: string };

export const ZONES: Record<Zone, ZoneInfo> = {
  thriving: { label: "Épanouissement", text: "Tu prends du plaisir et tu te sens utile.", color: "#6ee7b7" },
  dreamer: { label: "Le Rêveur", text: "Tu apprécies tes journées, mais tu manques d'impact ou de sens.", color: "#c4b5fd" },
  robot: { label: "Le Robot", text: "Tu es efficace, mais sans plaisir. Attention à l'épuisement.", color: "#fdba74" },
  danger: { label: "Zone de danger", text: "Ni plaisir ni impact : le signe d'un décrochage.", color: "#fca5a5" },
  middle: { label: "Entre deux", text: "", color: "#e2e8f0" },
};
export const ENERGY_ZONES: Record<EnergyZone, ZoneInfo> = {
  enthusiasm: { label: "Enthousiasme", text: "De l'énergie et du plaisir : tu es à fond, dans le bon sens.", color: "#6ee7b7" },
  serenity: { label: "Sérénité", text: "Calme et à l'aise, sans être survolté·e.", color: "#93c5fd" },
  tension: { label: "Tension", text: "Beaucoup d'énergie mais peu de plaisir : du stress.", color: "#fdba74" },
  dejection: { label: "Abattement", text: "Peu d'énergie, peu de plaisir : le signe d'un épuisement.", color: "#fca5a5" },
  middle: { label: "Entre deux", text: "", color: "#e2e8f0" },
};

const quadrant = (x: number, y: number) => (x > 3 && y > 3 ? "tr" : x < 3 && y > 3 ? "tl" : x < 3 && y < 3 ? "bl" : x > 3 && y < 3 ? "br" : null);
export const zoneOf = (p: Point): Zone => {
  const c = quadrant(p.impact, p.pleasure);
  return c ? ({ tr: "thriving", tl: "dreamer", bl: "danger", br: "robot" } as const)[c] : "middle";
};
export const energyZoneOf = (p: Point): EnergyZone => {
  const c = quadrant(p.energy ?? 3, p.pleasure);
  return c ? ({ tr: "enthusiasm", tl: "serenity", bl: "dejection", br: "tension" } as const)[c] : "middle";
};

// Les deux vues : libellé de l'axe horizontal et zones par coin (haut-gauche, haut-droite, bas-gauche, bas-droite).
const VIEWS = {
  impact: { label: "Impact", corners: { tl: ZONES.dreamer, tr: ZONES.thriving, bl: ZONES.danger, br: ZONES.robot }, keys: { tl: "dreamer", tr: "thriving", bl: "danger", br: "robot" } },
  energy: { label: "Énergie", corners: { tl: ENERGY_ZONES.serenity, tr: ENERGY_ZONES.enthusiasm, bl: ENERGY_ZONES.dejection, br: ENERGY_ZONES.tension }, keys: { tl: "serenity", tr: "enthusiasm", bl: "dejection", br: "tension" } },
} as const;
const CORNERS = ["tl", "tr", "bl", "br"] as const;
type Corner = (typeof CORNERS)[number];

const LEVEL = ["très faible", "faible", "moyen", "élevé", "très élevé"];
export const describe = (p: Point) => `Impact ${LEVEL[Math.round(p.impact) - 1]}, plaisir ${LEVEL[Math.round(p.pleasure) - 1]}`;

const clamp = (n: number) => Math.max(1, Math.min(5, n));
const xOf = (p: Point, axis: Axis) => (axis === "energy" ? p.energy ?? 3 : p.impact);
// Position du point en % (centre de la case), plaisir élevé en haut.
export const pos = (p: Point, axis: Axis = "impact") => ({ left: `${(xOf(p, axis) - 0.5) * 20}%`, top: `${(5.5 - p.pleasure) * 20}%` });

function Quadrants({ axis, content }: { axis: Axis; content?: Partial<Record<Corner, React.ReactNode>> }) {
  return CORNERS.map((c) => (
    <span key={c} className={`q q-${c}`} style={{ background: `color-mix(in srgb, ${VIEWS[axis].corners[c].color} 38%, #fff)` }}>
      {content?.[c] ?? VIEWS[axis].corners[c].label}
    </span>
  ));
}

export function MatrixInput({ value, onChange }: { value: Point | null; onChange: (p: Point) => void }) {
  const pad = useRef<HTMLDivElement>(null);
  // Souris : aperçu de la case visée avant de cliquer.
  const [hover, setHover] = useState<Point | null>(null);

  function at(e: React.PointerEvent): Point {
    const r = pad.current!.getBoundingClientRect();
    return {
      ...value,
      impact: clamp(1 + Math.floor(((e.clientX - r.left) / r.width) * 5)),
      pleasure: clamp(5 - Math.floor(((e.clientY - r.top) / r.height) * 5)),
    };
  }

  function key(e: React.KeyboardEvent) {
    const move = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!move) return;
    e.preventDefault();
    const p = value ?? { impact: 3, pleasure: 3 };
    onChange({ ...p, impact: clamp(p.impact + move[0]), pleasure: clamp(p.pleasure + move[1]) });
  }

  const zone = value && zoneOf(value);
  return (
    <div className="matrix-field">
      <div className="matrix-frame">
        <span className="axis-y" aria-hidden>Plaisir ↑</span>
        <div
          ref={pad}
          className="matrix input"
          tabIndex={0}
          role="group"
          aria-label="Matrice du bonheur au travail. Flèches gauche et droite pour l'impact, haut et bas pour le plaisir."
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
          <Quadrants axis="impact" />
          {hover && (hover.impact !== value?.impact || hover.pleasure !== value?.pleasure) && <span className="dot ghost" style={pos(hover)} />}
          {value ? <span className="dot" style={{ ...pos(value), background: ZONES[zone!].color }} /> : <span className="matrix-hint">Place ton point ici</span>}
        </div>
        <span className="axis-x" aria-hidden>Impact →</span>
      </div>
      <div id="matrix-value" className="zone-card" aria-live="polite" style={zone ? { borderColor: ZONES[zone].color } : undefined}>
        {value ? (
          <>
            <strong>{ZONES[zone!].label}</strong>
            <span>{ZONES[zone!].text || `${describe(value)}.`}</span>
            {ZONES[zone!].text && <small>{describe(value)}</small>}
          </>
        ) : (
          <span>Plaisir : ce que tu as ressenti au travail. Impact : le sentiment d&apos;avoir été utile.</span>
        )}
      </div>
    </div>
  );
}

const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const coords = (p: Point, axis: Axis) => `${(xOf(p, axis) - 0.5) * 20},${(5.5 - p.pleasure) * 20}`;

export type Mark = { p: Point; title: string; label?: string; color?: string; strong?: boolean };

// Matrice en lecture : contenu libre par zone, points reliés dans l'ordre (trail), dernier point mis en avant.
export function MatrixPlot({ marks, label, axis = "impact", trail = false, zones }: {
  marks: Mark[]; label: string; axis?: Axis; trail?: boolean; zones?: Partial<Record<Corner, React.ReactNode>>;
}) {
  return (
    <div className="matrix-frame">
      <span className="axis-y" aria-hidden>Plaisir ↑</span>
      <div className="matrix" role="img" aria-label={label}>
        <Quadrants axis={axis} content={zones} />
        {trail && marks.length > 1 && (
          <svg className="trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={marks.map((m) => coords(m.p, axis)).join(" ")} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {marks.map((m, i) => {
          const last = m.strong ?? (!trail || i === marks.length - 1);
          const x = xOf(m.p, axis);
          return (
            <span
              key={i}
              className={`mark${last ? " last" : ""}${x > 4 ? " edge-r" : x < 2 ? " edge-l" : ""}`}
              title={m.title}
              style={{ ...pos(m.p, axis), background: m.color, opacity: last || !trail ? undefined : 0.35 + 0.65 * (i / (marks.length - 1)) }}
            >
              {m.label && <em>{m.label}</em>}
            </span>
          );
        })}
      </div>
      <span className="axis-x" aria-hidden>{VIEWS[axis].label} →</span>
    </div>
  );
}

export function AxisSwitch({ axis, onChange }: { axis: Axis; onChange: (a: Axis) => void }) {
  return (
    <div className="axis-switch" role="group" aria-label="Axe horizontal de la matrice">
      {(["impact", "energy"] as const).map((a) => (
        <button key={a} type="button" aria-pressed={axis === a} onClick={() => onChange(a)}>
          Plaisir × {VIEWS[a].label}
        </button>
      ))}
    </div>
  );
}

const pointText = (p: Point, axis: Axis) => `${VIEWS[axis].label.toLowerCase()} ${xOf(p, axis).toFixed(1)}, plaisir ${p.pleasure.toFixed(1)}`;

// Côté manager : trajectoire semaine par semaine et répartition de la dernière semaine close.
export function TeamMatrix({ data, weeks }: { data: LastWeek; weeks: { week_start: string; impact: number | null; pleasure: number | null; energy: number | null }[] }) {
  const [axis, setAxis] = useState<Axis>("impact");
  const counts: Record<string, number> = (axis === "impact" ? data.zones : data.energy_zones) ?? {};
  const share = (k: string) => Math.round(((counts[k] ?? 0) / data.responses) * 100);
  const path = weeks.filter((w) => w.impact != null && w.pleasure != null);
  const marks: Mark[] = path.map((w, i) => ({
    p: { impact: w.impact!, pleasure: w.pleasure!, energy: w.energy ?? undefined },
    title: `Semaine du ${shortDate(w.week_start)}`,
    label: i === 0 || i === path.length - 1 ? shortDate(w.week_start) : undefined,
  }));
  const zones = Object.fromEntries(CORNERS.map((c) => [c, <><b>{share(VIEWS[axis].keys[c])} %</b>{VIEWS[axis].corners[c].label}</>]));
  return (
    <div className="team-matrix">
      <AxisSwitch axis={axis} onChange={setAxis} />
      <MatrixPlot
        marks={marks}
        axis={axis}
        trail
        zones={zones}
        label={`Trajectoire de l'équipe : ${marks.map((m) => `${m.title}, ${pointText(m.p, axis)}`).join(" ; ")}.`}
      />
      <p className="muted small">
        Chaque point est une semaine close, le plus marqué la plus récente. Pourcentages : semaine du {shortDate(data.week_start)} ({data.responses} réponses),
        dont {share("middle")} % « entre deux ».
        {data.tags.length > 0 && <> Sujets les plus cités : <strong>{data.tags.join(" · ")}</strong>.</>}
      </p>
    </div>
  );
}

// Collaborateur : où il s'est placé (« Toi ») face à ce que disent ses réponses, dans les deux vues.
export function Compare({ self, calc }: { self: Required<Point>; calc: Required<Point> }) {
  const marks: Mark[] = [
    { p: calc, title: "D'après tes réponses", label: "Tes réponses", color: "var(--primary)", strong: true },
    { p: self, title: "Là où tu t'es placé·e", label: "Toi", color: "var(--ink)", strong: true },
  ];
  const zone = (axis: Axis, p: Point) => (axis === "impact" ? ZONES[zoneOf(p)] : ENERGY_ZONES[energyZoneOf(p)]).label;
  return (
    <div className="compare">
      {(["impact", "energy"] as const).map((axis) => (
        <figure key={axis}>
          <figcaption>
            <strong>Plaisir × {VIEWS[axis].label}</strong>
            <span>Toi : {zone(axis, self)} · Tes réponses : {zone(axis, calc)}</span>
          </figcaption>
          <MatrixPlot axis={axis} marks={marks} label={`Plaisir et ${VIEWS[axis].label.toLowerCase()} : tu te places en ${zone(axis, self)}, tes réponses te situent en ${zone(axis, calc)}.`} />
        </figure>
      ))}
    </div>
  );
}
