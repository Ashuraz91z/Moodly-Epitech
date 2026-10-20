"use client";

import { useEffect, useRef, useState } from "react";
import type { Week } from "@/lib/api";

export const TEAM = "#e11d48";
export const FORECAST = "#7c3aed";
const GRID = "#f1ebfb";
const AXIS = "#475569";
const M = { top: 34, right: 12, bottom: 28, left: 26 };

export const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const label = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

// Graphe du Miroir, une colonne par semaine : moral de l'équipe (semaines closes), pronostic (paliers
// pointillés), écart en surface, bulle « sujet dominant » sur les angles morts. La semaine en cours n'a
// que le pronostic : ses résultats sont publiés lundi.
export function MirrorChart({ weeks, thisWeek }: { weeks: Week[]; thisWeek: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  const H = W > 700 ? 300 : 240;
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);

  const N = Math.max(weeks.length, 1);
  const slot = (W - M.left - M.right) / N;
  const x = (i: number) => M.left + (i + 0.5) * slot;
  const y = (v: number) => M.top + ((5 - v) / 4) * (H - M.top - M.bottom);
  const blind = (w: Week) => w.gap != null && Math.abs(w.gap) > 1.5;

  let team = "";
  weeks.forEach((w, i) => {
    if (w.team_avg == null) return;
    team += `${i > 0 && weeks[i - 1].team_avg != null ? "L" : "M"}${x(i)} ${y(w.team_avg)}`;
  });
  let forecast = "";
  weeks.forEach((w, i) => {
    if (w.prediction == null) return;
    const s = x(i) - slot / 2, e = x(i) + slot / 2;
    forecast += i > 0 && weeks[i - 1].prediction != null ? `V${y(w.prediction)}H${e}` : `M${s} ${y(w.prediction)}H${e}`;
  });

  // Bulles : semaines consécutives au même sujet fusionnées sur la plus basse.
  const notes: { i: number; v: number; tag: string }[] = [];
  weeks.forEach((w, i) => {
    if (!blind(w) || !w.dominant_tag || w.team_avg == null) return;
    const prev = notes.at(-1);
    if (prev && prev.tag === w.dominant_tag && i - prev.i <= 2) {
      if (w.team_avg < prev.v) Object.assign(prev, { i, v: w.team_avg });
    } else notes.push({ i, v: w.team_avg, tag: w.dominant_tag });
  });

  function move(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(N - 1, Math.floor(((e.clientX - r.left) / r.width) * N))));
  }
  function key(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(N - 1, (h ?? N - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
  }
  const h = hover == null ? null : weeks[hover];
  const every = N > 9 ? 2 : 1;

  return (
    <div className="chart" ref={box}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={`Moral de l'équipe et ton pronostic, semaine par semaine sur ${N} semaines. Flèches gauche et droite pour parcourir les semaines.`}
        tabIndex={0}
        onKeyDown={key}
        onFocus={() => setHover((v) => v ?? N - 1)}
        onBlur={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={M.left - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill={AXIS}>{v}</text>
          </g>
        ))}
        {weeks.map((w, i) => (i % every === (N - 1) % every || w.week_start === thisWeek) && (
          <text key={w.week_start} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill={AXIS} fontWeight={w.week_start === thisWeek ? 700 : 400}>
            {w.week_start === thisWeek ? "en cours" : label(w.week_start)}
          </text>
        ))}
        {weeks.map((w, i) => w.team_avg != null && w.prediction != null && (
          <rect key={`gap${i}`} className="appear" x={x(i) - slot * 0.22} width={slot * 0.44}
            y={Math.min(y(w.team_avg), y(w.prediction))} height={Math.abs(y(w.team_avg) - y(w.prediction))}
            rx={4} fill={TEAM} fillOpacity={blind(w) ? 0.22 : 0.1} />
        ))}
        <path d={forecast} fill="none" stroke={FORECAST} strokeWidth="2" strokeDasharray="6 5" />
        <path d={team} fill="none" stroke={TEAM} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw" />
        {weeks.map((w, i) => w.team_avg != null && (
          <circle key={`p${i}`} cx={x(i)} cy={y(w.team_avg)} r={blind(w) ? 5.5 : 4} fill={TEAM} stroke="#fff" strokeWidth="2" />
        ))}
        {notes.map((n) => {
          const w = n.tag.length * 6.6 + 16;
          const bx = Math.min(Math.max(x(n.i) - w / 2, M.left), W - M.right - w);
          return (
            <g key={n.i} className="pop">
              <line x1={x(n.i)} x2={x(n.i)} y1={26} y2={y(n.v) - 9} stroke={TEAM} strokeOpacity="0.35" strokeDasharray="2 3" />
              <rect x={bx} y={4} width={w} height={22} rx={11} fill="#fff1f2" stroke={TEAM} strokeOpacity="0.4" />
              <text x={bx + w / 2} y={19} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f172a">{n.tag}</text>
            </g>
          );
        })}
        {hover != null && (
          <rect x={x(hover) - slot / 2} y={M.top} width={slot} height={H - M.top - M.bottom} fill="#7c3aed" fillOpacity="0.06" pointerEvents="none" />
        )}
        <rect
          x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="transparent"
          onPointerMove={move} onPointerLeave={() => setHover(null)}
        />
      </svg>
      {h && hover != null && (
        <div className="tooltip" style={{ left: x(hover) > W - 190 ? x(hover) - 182 : x(hover) + 12, top: M.top }} aria-live="polite">
          <span>Semaine du {label(h.week_start)}</span>
          <div>
            <svg width="14" height="2"><line x2="14" stroke={TEAM} strokeWidth="4" /></svg>
            <b>{h.team_avg != null ? fmt(h.team_avg) : "—"}</b> Équipe{h.responses ? ` · ${h.responses} rép.` : ""}
          </div>
          {h.team_avg == null && <span>{h.week_start === thisWeek ? "résultats lundi" : "moins de 5 réponses"}</span>}
          <div>
            <svg width="14" height="2"><line x2="14" stroke={FORECAST} strokeWidth="4" strokeDasharray="4 2" /></svg>
            <b>{h.prediction != null ? fmt(h.prediction) : "—"}</b> Mon pronostic
          </div>
        </div>
      )}
    </div>
  );
}

// "AAAA-MM-JJ" en heure française, comme moodly_today() côté base.
export const todayInParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
