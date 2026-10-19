"use client";

import { useEffect, useRef, useState } from "react";
import type { Day, Week } from "@/lib/api";

export const TEAM = "#e11d48";
export const FORECAST = "#7c3aed";
const GRID = "#f1ebfb";
const AXIS = "#475569";
const DAYS = 30;
const M = { top: 34, right: 12, bottom: 26, left: 26 };
const MS = 864e5;

const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const label = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

// Graphe du Miroir : moral réel (ligne), pronostic (paliers pointillés), zone d'écart, bulles « tag dominant ».
export function MirrorChart({ days, weeks, today }: { days: Day[]; weeks: Week[]; today: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  const H = W > 700 ? 300 : 240;
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);

  const start = utc(today) - (DAYS - 1) * MS;
  const idx = (d: string) => Math.round((utc(d) - start) / MS);
  const x = (i: number) => M.left + (i * (W - M.left - M.right)) / (DAYS - 1);
  const y = (v: number) => M.top + ((5 - v) / 4) * (H - M.top - M.bottom);

  const teamAt = new Map(days.map((d) => [idx(d.day), d]));
  const predAt = (i: number) => {
    const w = weeks.find((w) => w.prediction != null && i >= idx(w.week_start) && i < idx(w.week_start) + 7);
    return w?.prediction ?? null;
  };

  const pts = days.map((d) => ({ i: idx(d.day), v: d.team_avg })).filter((p) => p.i >= 0);
  const team = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)} ${y(p.v)}`).join("");

  let forecast = "";
  let lastEnd = -1;
  for (const w of weeks) {
    if (w.prediction == null) continue;
    const s = Math.max(idx(w.week_start), 0);
    const e = Math.min(idx(w.week_start) + 7, DAYS - 1);
    if (s > DAYS - 1) continue;
    forecast += s === lastEnd ? `V${y(w.prediction)}H${x(e)}` : `M${x(s)} ${y(w.prediction)}H${x(e)}`;
    lastEnd = e;
  }

  // Zone d'écart : une surface par suite de jours ayant moral + pronostic.
  const areas: string[] = [];
  let run: { i: number; v: number; p: number }[] = [];
  const flush = () => {
    if (run.length > 1) {
      const top = run.map((r) => `${x(r.i)} ${y(r.v)}`);
      const bottom = [...run].reverse().map((r) => `${x(r.i)} ${y(r.p)}`);
      areas.push(`M${[...top, ...bottom].join("L")}Z`);
    }
    run = [];
  };
  pts.forEach((p, k) => {
    const pr = predAt(p.i);
    if (pr == null || (k > 0 && run.length && pts[k - 1].i !== run[run.length - 1].i)) flush();
    if (pr != null) run.push({ ...p, p: pr });
  });
  flush();

  // Bulles : semaines consécutives au même tag fusionnées, ancrées sur le point le plus bas.
  const notes: { i: number; v: number; tag: string }[] = [];
  for (const w of weeks) {
    if (!w.dominant_tag) continue;
    const inWeek = pts.filter((p) => p.i >= idx(w.week_start) && p.i < idx(w.week_start) + 7);
    if (!inWeek.length) continue;
    const low = inWeek.reduce((a, b) => (b.v < a.v ? b : a));
    const prev = notes[notes.length - 1];
    if (prev && prev.tag === w.dominant_tag && low.i - prev.i <= 14) {
      if (low.v < prev.v) Object.assign(prev, low);
    } else notes.push({ ...low, tag: w.dominant_tag });
  }

  function move(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (DAYS - 1));
    setHover(Math.max(0, Math.min(DAYS - 1, i)));
  }
  function key(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(DAYS - 1, (h ?? DAYS - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
  }

  const h = hover == null ? null : { day: teamAt.get(hover), pred: predAt(hover) };

  return (
    <div className="chart" ref={box}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="Moral de l'équipe et ton pronostic sur 30 jours. Flèches gauche et droite pour parcourir les jours."
        tabIndex={0}
        onKeyDown={key}
        onFocus={() => setHover((h) => h ?? DAYS - 1)}
        onBlur={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={M.left - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill={AXIS}>{v}</text>
          </g>
        ))}
        {[1, 8, 15, 22, 29].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 29 ? "end" : "middle"} fontSize="12" fill={AXIS}>
            {label(start + i * MS)}
          </text>
        ))}
        {areas.map((d, k) => <path key={k} d={d} fill={TEAM} fillOpacity="0.12" className="appear" />)}
        <path d={forecast} fill="none" stroke={FORECAST} strokeWidth="2" strokeDasharray="6 5" />
        <path d={team} fill="none" stroke={TEAM} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw" />
        {notes.map((n) => {
          const w = n.tag.length * 6.6 + 16;
          const bx = Math.min(Math.max(x(n.i) - w / 2, M.left), W - M.right - w);
          return (
            <g key={n.i} className="pop">
              <line x1={x(n.i)} x2={x(n.i)} y1={26} y2={y(n.v) - 9} stroke={TEAM} strokeOpacity="0.35" strokeDasharray="2 3" />
              <circle cx={x(n.i)} cy={y(n.v)} r="9" fill="none" stroke={TEAM} strokeOpacity="0.35" />
              <circle cx={x(n.i)} cy={y(n.v)} r="4.5" fill={TEAM} stroke="#fff" strokeWidth="2" />
              <rect x={bx} y={4} width={w} height={22} rx={11} fill="#fff1f2" stroke={TEAM} strokeOpacity="0.4" />
              <text x={bx + w / 2} y={19} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f172a">{n.tag}</text>
            </g>
          );
        })}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} stroke="#968cb0" />
            {h?.day && <circle cx={x(hover)} cy={y(h.day.team_avg)} r="5" fill={TEAM} stroke="#fff" strokeWidth="2" />}
            {h?.pred != null && <circle cx={x(hover)} cy={y(h.pred)} r="5" fill={FORECAST} stroke="#fff" strokeWidth="2" />}
          </g>
        )}
        <rect
          x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="transparent"
          onPointerMove={move} onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: x(hover) > W - 180 ? x(hover) - 172 : x(hover) + 12, top: M.top }} aria-live="polite">
          <span>{label(start + hover * MS)}</span>
          <div><svg width="14" height="2"><line x2="14" stroke={TEAM} strokeWidth="4" /></svg><b>{h?.day ? fmt(h.day.team_avg) : "—"}</b> Équipe{h?.day ? ` · ${h.day.responses} rép.` : ""}</div>
          {!h?.day && <span>moins de 5 réponses</span>}
          <div><svg width="14" height="2"><line x2="14" stroke={FORECAST} strokeWidth="4" strokeDasharray="4 2" /></svg><b>{h?.pred != null ? fmt(h.pred) : "—"}</b> Mon pronostic</div>
        </div>
      )}
    </div>
  );
}

// "AAAA-MM-JJ" en heure française, comme moodly_today() côté base.
export const todayInParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
