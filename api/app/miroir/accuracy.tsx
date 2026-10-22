import type { Week } from "@/lib/api";
import { Icon } from "../icons";
import { fmt } from "./chart";

const AXES = [
  { key: "pleasure", label: "Plaisir", tip: "Demande en réunion ce qui a plu et ce qui a pesé cette semaine." },
  { key: "energy", label: "Énergie", tip: "Regarde la charge réelle : heures, urgences, messages hors horaires." },
  { key: "impact", label: "Utilité", tip: "Partage les retours sur le travail de l'équipe et ce qu'il a permis." },
] as const;
type Axis = (typeof AXES)[number]["key"];
const RECENT = 4; // semaines prises en compte pour le biais par axe
const short = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

// Semaines closes avec un pronostic sur la matrice.
const judged = (weeks: Week[]) => weeks.filter((w) => w.forecast && w.pleasure != null && w.energy != null && w.impact != null);
const gapOf = (w: Week, k: Axis) => w.forecast![k] - w[k]!;

// Justesse du regard, de 0 à 100 % : 100 si le pronostic tombe pile sur l'équipe, 0 à 4 points d'écart sur chaque axe.
export const accuracyOf = (w: Week) =>
  w.forecast && w.pleasure != null ? Math.round(100 * (1 - AXES.reduce((s, a) => s + Math.abs(gapOf(w, a.key)), 0) / 3 / 4)) : null;

// Les deux dernières semaines jugées : pour le récap du Miroir.
export function lastAccuracy(weeks: Week[]) {
  const j = judged(weeks);
  return { now: j.length ? accuracyOf(j.at(-1)!) : null, before: j.length > 1 ? accuracyOf(j.at(-2)!) : null };
}

const tone = (v: number) => (v >= 85 ? "good" : v >= 70 ? "mid" : "low");

// La justesse du regard du manager, semaine après semaine, et l'axe sur lequel il se trompe le plus.
export function Accuracy({ weeks }: { weeks: Week[] }) {
  const j = judged(weeks);
  if (!j.length) return null;
  const scores = j.map((w) => ({ week: w.week_start, v: accuracyOf(w)! }));
  const now = scores.at(-1)!;
  const first = scores[0];
  const recent = j.slice(-RECENT);
  const bias = AXES.map((a) => ({ ...a, gap: recent.reduce((s, w) => s + gapOf(w, a.key), 0) / recent.length }));
  const blind = [...bias].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
  const delta = now.v - first.v;

  return (
    <section className="accuracy">
      <h2>La justesse de ton regard <small>ton pronostic sur la matrice face à l&apos;équipe</small></h2>
      <div className="accuracy-trend">
        <div className="accuracy-head">
          <strong className={tone(now.v)}>{now.v} %</strong>
          <div>
            <span>Semaine du {short(now.week)}</span>
            {scores.length > 1 && delta !== 0 && (
              <span className={`trend ${delta > 0 ? "good" : "bad"}`}>
                <Icon name={delta > 0 ? "up" : "down"} size={14} />
                {delta > 0 ? "+" : "−"}{Math.abs(delta)} pts depuis le {short(first.week)}
              </span>
            )}
          </div>
        </div>

        <div className="accuracy-bars" role="img" aria-label={`Justesse semaine par semaine : ${scores.map((s) => `${short(s.week)} ${s.v} %`).join(", ")}.`}>
          {scores.map((s) => (
            <div key={s.week} title={`Semaine du ${short(s.week)} : ${s.v} %`}>
              <span>{s.v}</span>
              <i className={tone(s.v)} style={{ height: `${s.v}%` }} />
              <small>{short(s.week)}</small>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3>Axe par axe <small>{recent.length} dernière{recent.length > 1 ? "s" : ""} semaine{recent.length > 1 ? "s" : ""}</small></h3>
        <ul className="accuracy-axes">
          {bias.map((a) => {
            const off = Math.abs(a.gap) >= 0.5;
            return (
              <li key={a.key}>
                <span>{a.label}</span>
                <div className="diverge" aria-hidden>
                  <i className={off ? "off" : undefined} style={a.gap >= 0 ? { left: "50%", width: `${Math.min(Math.abs(a.gap) / 4, 1) * 50}%` } : { right: "50%", width: `${Math.min(Math.abs(a.gap) / 4, 1) * 50}%` }} />
                </div>
                <small>{!off ? "juste" : a.gap > 0 ? `surestimé de ${fmt(a.gap)}` : `sous-estimé de ${fmt(-a.gap)}`}</small>
              </li>
            );
          })}
        </ul>
        <div className="diverge-legend" aria-hidden><span>tu vois plus bas</span><span>tu vois plus haut</span></div>
      </div>

      {Math.abs(blind.gap) >= 0.5 ? (
        <p className="verdict">
          Ton angle mort en ce moment : <strong>{blind.label.toLowerCase()}</strong>. Tu le vois {fmt(Math.abs(blind.gap))} pt
          {blind.gap > 0 ? " plus haut" : " plus bas"} que ce que dit l&apos;équipe. {blind.tip}
        </p>
      ) : (
        <p className="verdict">Ces dernières semaines, ton regard est juste sur les trois axes : continue à le confronter chaque semaine.</p>
      )}
    </section>
  );
}
