import type { Point } from "./matrix";

export const ONBOARDING_KEY = "moodly-onboarding-vu";

// Historique personnel : uniquement dans ce navigateur, jamais envoyé (la base ne sait pas qui a répondu quoi).
export const historyKey = (userId: string) => `moodly-historique-${userId}`;

export type History = Record<string, Point>;

export function readHistory(userId: string): History {
  try {
    const raw: Record<string, Point | number> = JSON.parse(localStorage.getItem(historyKey(userId)) ?? "{}");
    // Anciennes saisies (une note de 1 à 5) : reportées sur les deux axes.
    return Object.fromEntries(Object.entries(raw).map(([d, v]) => [d, typeof v === "number" ? { impact: v, pleasure: v } : v]));
  } catch {
    return {};
  }
}

export function lastDays(today: string, n: number) {
  const t = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, k) => new Date(t - (n - 1 - k) * 864e5).toISOString().slice(0, 10));
}

export function streak(history: History, today: string) {
  let n = 0;
  for (const d of lastDays(today, 365).reverse()) {
    if (history[d]) n++;
    else if (d !== today) break;
  }
  return n;
}

// Démo : 30 jours d'historique plausibles pour Inès (le parcours guidé), et l'accueil réaffiché.
const DEMO_EMPLOYEE = "00000000-0000-0000-0000-000000000002";
export function seedDemoHistory(today: string) {
  const t = Date.parse(`${today}T00:00:00Z`);
  const r = (n: number) => Math.floor(Math.random() * n);
  const h: History = {};
  for (let d = 30; d >= 1; d--) {
    if (Math.random() < 0.12) continue;
    const [impact, pleasure] = d > 14 ? [2 + r(3), 1 + r(2)] : d > 7 ? [3 + r(2), 2 + r(3)] : [3 + r(3), 3 + r(3)];
    h[new Date(t - d * 864e5).toISOString().slice(0, 10)] = { impact, pleasure };
  }
  try {
    localStorage.setItem(historyKey(DEMO_EMPLOYEE), JSON.stringify(h));
    localStorage.removeItem(ONBOARDING_KEY);
  } catch {}
}
