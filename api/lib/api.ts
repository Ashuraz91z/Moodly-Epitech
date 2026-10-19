// Appels à l'API depuis la version web (cookies httpOnly envoyés automatiquement).
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const init: RequestInit = body === undefined ? {} : {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  let res = await fetch(path, init);
  if (res.status === 401 && (await fetch("/api/auth/refresh", { method: "POST" })).ok) res = await fetch(path, init);
  if (res.status === 401) location.replace("/login");
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? "Erreur réseau");
  return res.status === 204 ? (null as T) : res.json();
}

export type Role = "employee" | "manager" | "admin";
export type Me = { id: string; role: Role; team: { id: string; name: string } | null };
export type Tag = { id: number; label: string };
export type Day = { day: string; team_avg: number; responses: number };
export type Week = { week_start: string; prediction: number | null; team_avg: number | null; gap: number | null; dominant_tag: string | null };
export type Mirror =
  | { needs_prediction: true }
  | { needs_prediction: false; team_size: number; avg_daily_responses: number; days: Day[]; weeks: Week[] };

export type AdminTeam = { id: string; name: string; manager_id: string; size: number; participation: number | null; avg: number | null; trend: { week_start: string; avg: number }[] | null };
export type AdminUser = { id: string; email: string; role: Role; team_id: string | null; created_at: string; last_sign_in_at: string | null };
export type Admin = {
  stats: { avg: number | null; participation: number | null };
  teams: AdminTeam[];
  users: AdminUser[];
  tags: (Tag & { uses: number })[];
};
