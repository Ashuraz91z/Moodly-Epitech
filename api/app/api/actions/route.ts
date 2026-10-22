import { badRequest, handle } from "@/lib/supabase";

const FACTORS = ["intensite", "autonomie", "emotions", "relations", "sens", "securite"];

// Plan d'action du manager : les règles RLS limitent tout à son équipe ;
// un collaborateur ne lit que les actions partagées de la sienne.
export function GET(req: Request) {
  return handle(req, (sb) =>
    sb.from("actions").select("id, week_start, label, factor, shared, done_at").order("week_start", { ascending: false }).order("created_at"),
  );
}

export async function POST(req: Request) {
  const { label, factor = null } = await req.json().catch(() => ({}));
  if (typeof label !== "string" || !label.trim() || (factor !== null && !FACTORS.includes(factor))) return badRequest("Attendu : { label, factor? }");
  return handle(req, async (sb) => {
    const team = await sb.from("teams").select("id").single();
    if (team.error) return team;
    return sb.from("actions").insert({ team_id: team.data.id, label: label.trim().slice(0, 120), factor }).select("id").single();
  });
}

export async function PATCH(req: Request) {
  const { id, done, shared } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || (typeof done !== "boolean" && typeof shared !== "boolean")) return badRequest("Attendu : { id, done?, shared? }");
  return handle(req, (sb) =>
    sb.from("actions").update({
      ...(typeof done === "boolean" && { done_at: done ? new Date().toISOString() : null }),
      ...(typeof shared === "boolean" && { shared }),
    }).eq("id", id),
  );
}

export async function DELETE(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return badRequest("Attendu : { id }");
  return handle(req, (sb) => sb.from("actions").delete().eq("id", id));
}
