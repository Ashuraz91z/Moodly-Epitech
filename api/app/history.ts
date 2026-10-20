import type { Point } from "./matrix";

export const ONBOARDING_KEY = "moodly-onboarding-vu";
// Historique personnel : uniquement dans ce navigateur, jamais envoyé (la base ne sait pas qui a répondu quoi).
export const historyKey = (userId: string) => `moodly-historique-${userId}`;

// Une entrée par semaine (clé : le lundi, AAAA-MM-JJ) : point où l'on s'est placé et les 9 réponses.
export type Entry = Required<Point> & { answers?: number[] };
export type History = Record<string, Entry>;

const MS = 864e5;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const mondayOf = (d: string) => iso(utc(d) - ((new Date(utc(d)).getUTCDay() + 6) % 7) * MS);

export function readHistory(userId: string): History {
  try {
    const raw: Record<string, Partial<Entry> | number> = JSON.parse(localStorage.getItem(historyKey(userId)) ?? "{}");
    const out: History = {};
    // Anciennes saisies quotidiennes (une note, puis un point par jour) : la dernière de chaque semaine.
    for (const d of Object.keys(raw).sort()) {
      const v = raw[d];
      const p = typeof v === "number" ? { impact: v, pleasure: v } : v;
      if (p.impact == null || p.pleasure == null) continue;
      out[mondayOf(d)] = { impact: p.impact, pleasure: p.pleasure, energy: p.energy ?? p.impact, ...(p.answers && { answers: p.answers }) };
    }
    return out;
  } catch {
    return {};
  }
}

// Les n dernières semaines (lundis), de la plus ancienne à la semaine en cours.
export function lastWeeks(today: string, n: number) {
  const m = utc(mondayOf(today));
  return Array.from({ length: n }, (_, k) => iso(m - (n - 1 - k) * 7 * MS));
}

// Semaines d'affilée ; la semaine en cours compte si elle est faite, sans casser la série sinon.
export function streak(history: History, today: string) {
  const weeks = lastWeeks(today, 104).reverse();
  let n = 0;
  for (const w of weeks) {
    if (history[w]) n++;
    else if (w !== weeks[0]) break;
  }
  return n;
}

// Démo : 11 semaines plausibles pour Inès (le parcours guidé), et l'accueil réaffiché.
export const DEMO_EMPLOYEE = "00000000-0000-0000-0000-000000000002";
export function seedDemoHistory(today: string, keep = false) {
  const n = (x: number) => Math.max(1, Math.min(5, Math.round(x + (Math.random() - 0.5) * 1.6)));
  const weeks = lastWeeks(today, 12).slice(0, -1);
  const h: History = {};
  weeks.forEach((w, idx) => {
    const k = weeks.length - idx; // semaines avant la semaine en cours
    if (k > 2 && Math.random() < 0.1) return; // un trou de temps en temps, jamais sur la série récente
    // Comme son équipe : à bout (charge de travail), transition, puis en forme.
    const [p, e, i] = k > 5 ? [1.8, 2.2, 4.2] : k > 3 ? [3, 3, 4] : [4.2, 4, 4.3];
    h[w] = { pleasure: n(p), energy: n(e), impact: n(i), answers: [n(e), n(e), n(i), n(6 - p), n(p), n(p), n(i), n(i), n(p)] };
  });
  try {
    // keep : complète sans écraser les réponses déjà données sur cet appareil.
    localStorage.setItem(historyKey(DEMO_EMPLOYEE), JSON.stringify(keep ? { ...h, ...readHistory(DEMO_EMPLOYEE) } : h));
    if (!keep) localStorage.removeItem(ONBOARDING_KEY);
  } catch {}
}
