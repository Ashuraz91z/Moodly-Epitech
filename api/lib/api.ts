// Appels à l'API depuis la version web (cookies httpOnly envoyés automatiquement).
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  let res = await fetch(path, init);
  if (res.status === 401 && (await fetch("/api/auth/refresh", { method: "POST" })).ok) res = await fetch(path, init);
  if (res.status === 401) location.replace("/login");
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? "Erreur réseau");
  return res.status === 204 ? (null as T) : res.json();
}

export type Me = { id: string; role: "employee" | "manager"; team: { id: string; name: string } | null };
export type Tag = { id: number; label: string };
export type Day = { day: string; team_avg: number; responses: number };
export type Week = { week_start: string; prediction: number | null; team_avg: number | null; gap: number | null; dominant_tag: string | null };
export type Mirror =
  | { needs_prediction: true }
  | { needs_prediction: false; team_size: number; avg_daily_responses: number; days: Day[]; weeks: Week[] };
