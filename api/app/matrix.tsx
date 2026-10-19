"use client";

import { useRef, useState } from "react";

// Matrice du bonheur au travail : impact en largeur, plaisir en hauteur, de 1 à 5.
// 3 est sur un axe : « entre deux ». Mêmes règles que get_mirror côté base.
export type Point = { impact: number; pleasure: number };
export type Zone = "thriving" | "dreamer" | "danger" | "robot" | "middle";

export const ZONES: Record<Zone, { label: string; text: string; color: string }> = {
  thriving: { label: "Épanouissement", text: "Tu prends du plaisir et tu te sens utile.", color: "#6ee7b7" },
  dreamer: { label: "Le Rêveur", text: "Tu apprécies tes journées, mais tu manques d'impact ou de sens.", color: "#c4b5fd" },
  robot: { label: "Le Robot", text: "Tu es efficace, mais sans plaisir. Attention à l'épuisement.", color: "#fdba74" },
  danger: { label: "Zone de danger", text: "Ni plaisir ni impact : le signe d'un décrochage.", color: "#fca5a5" },
  middle: { label: "Entre deux", text: "", color: "#e2e8f0" },
};

export const zoneOf = ({ impact, pleasure }: Point): Zone =>
  impact > 3 && pleasure > 3 ? "thriving"
  : impact < 3 && pleasure > 3 ? "dreamer"
  : impact < 3 && pleasure < 3 ? "danger"
  : impact > 3 && pleasure < 3 ? "robot"
  : "middle";

const LEVEL = ["très faible", "faible", "moyen", "élevé", "très élevé"];
export const describe = (p: Point) => `Impact ${LEVEL[p.impact - 1]}, plaisir ${LEVEL[p.pleasure - 1]}`;

const clamp = (n: number) => Math.max(1, Math.min(5, n));
// Position du point en % (centre de la case), plaisir élevé en haut.
export const pos = (p: Point) => ({ left: `${(p.impact - 0.5) * 20}%`, top: `${(5.5 - p.pleasure) * 20}%` });

function Quadrants() {
  return (
    <>
      <span className="q q-dreamer">{ZONES.dreamer.label}</span>
      <span className="q q-thriving">{ZONES.thriving.label}</span>
      <span className="q q-danger">{ZONES.danger.label}</span>
      <span className="q q-robot">{ZONES.robot.label}</span>
    </>
  );
}

export function MatrixInput({ value, onChange }: { value: Point | null; onChange: (p: Point) => void }) {
  const pad = useRef<HTMLDivElement>(null);
  // Souris : aperçu de la case visée avant de cliquer.
  const [hover, setHover] = useState<Point | null>(null);

  function at(e: React.PointerEvent): Point {
    const r = pad.current!.getBoundingClientRect();
    return {
      impact: clamp(1 + Math.floor(((e.clientX - r.left) / r.width) * 5)),
      pleasure: clamp(5 - Math.floor(((e.clientY - r.top) / r.height) * 5)),
    };
  }

  function key(e: React.KeyboardEvent) {
    const move = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!move) return;
    e.preventDefault();
    const p = value ?? { impact: 3, pleasure: 3 };
    onChange({ impact: clamp(p.impact + move[0]), pleasure: clamp(p.pleasure + move[1]) });
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
          <Quadrants />
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
          <span>Plaisir : ce que tu ressens au quotidien. Impact : le sentiment d&apos;être utile.</span>
        )}
      </div>
    </div>
  );
}

export type TeamMatrixData = { responses: number; impact: number; pleasure: number; zones: Record<Zone, number> };

// Côté manager : répartition des réponses par zone et point moyen de l'équipe.
export function TeamMatrix({ data }: { data: TeamMatrixData }) {
  const share = (z: Zone) => Math.round((data.zones[z] / data.responses) * 100);
  const avg = { impact: data.impact, pleasure: data.pleasure };
  return (
    <div className="team-matrix">
      <div className="matrix-frame">
        <span className="axis-y" aria-hidden>Plaisir ↑</span>
        <div className="matrix" role="img" aria-label={`Point moyen de l'équipe : impact ${data.impact.toFixed(1)}, plaisir ${data.pleasure.toFixed(1)} sur 5.`}>
          {(["dreamer", "thriving", "danger", "robot"] as const).map((z) => (
            <span key={z} className={`q q-${z}`}>
              <b>{share(z)} %</b>
              {ZONES[z].label}
            </span>
          ))}
          <span className="dot team" style={pos(avg)} />
        </div>
        <span className="axis-x" aria-hidden>Impact →</span>
      </div>
      <p className="muted small">
        Le rond indique le point moyen de l&apos;équipe ({data.responses} réponses). {share("middle")} % des réponses sont sur un axe (« entre deux »).
      </p>
    </div>
  );
}
