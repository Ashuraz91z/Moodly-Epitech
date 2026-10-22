import type { Zone } from "@/app/matrix";
import type { FactorKey } from "@/app/questionnaire";

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
export type Week = {
  week_start: string; prediction: number | null; forecast: { pleasure: number; energy: number; impact: number } | null;
  factors: Record<FactorKey, number> | null; team_avg: number | null; impact: number | null; pleasure: number | null; energy: number | null; responses: number | null; gap: number | null; dominant_tag: string | null };
export type Mirror =
  | { needs_prediction: true }
  | { needs_prediction: false; team_size: number; current: { week_start: string; responses: number }; last: LastWeek | null; weeks: Week[] };

// Dernière semaine close de l'équipe (au moins 5 réponses) : point, 2 matrices, facteurs, tendance, sujets.
export type LastWeek = {
  week_start: string; responses: number; team_avg: number; impact: number; pleasure: number; energy: number;
  // zones : matrice plaisir × impact (non affichée) ; energy_zones : la matrice plaisir × énergie.
  zones: Record<string, number>; energy_zones: Partial<Record<Zone, number>>; tags: string[];
  factors: Record<FactorKey, number> | null; trend: { better: number; same: number; worse: number } | null;
};

export type AdminTeam = { id: string; name: string; manager_id: string; size: number; participation: number | null; avg: number | null; impact: number | null; pleasure: number | null; energy: number | null; trend: { week_start: string; avg: number }[] | null };
export type AdminUser = { id: string; email: string; role: Role; team_id: string | null; created_at: string; last_sign_in_at: string | null };
export type Admin = {
  stats: { week_start: string; avg: number | null; participation: number | null; zones: Record<string, number> | null; energy_zones: Partial<Record<Zone, number>> | null };
  teams: AdminTeam[];
  users: AdminUser[];
  tags: (Tag & { uses: number })[];
};
// Moyennes de l'entreprise, dernière semaine close : pour comparer son équipe.
export type Benchmark = {
  week_start: string; teams: number; responses: number; participation: number | null;
  team_avg: number; pleasure: number; energy: number; impact: number;
  factors: Record<FactorKey, number> | null; energy_zones: Partial<Record<Zone, number>>;
};
// Votes « ce qui m'aiderait le plus » d'une semaine close : facteur (ou « rien ») → nombre de votes.
export type Wishes = { week_start: string; votes: number; wishes: Partial<Record<FactorKey | "rien", number>> };
