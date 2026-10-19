import type { Point } from "./matrix";

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
