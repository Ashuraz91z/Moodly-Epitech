import { badRequest, handle } from "@/lib/supabase";

// Plan d'action du manager : les règles RLS limitent tout à son équipe.
export function GET(req: Request) {
  return handle(req, (sb) =>
    sb.from("actions").select("id, week_start, label, done_at").order("week_start", { ascending: false }).order("created_at"),
  );
}

export async function POST(req: Request) {
  const { label } = await req.json().catch(() => ({}));
  if (typeof label !== "string" || !label.trim()) return badRequest("Attendu : { label }");
  return handle(req, async (sb) => {
    const team = await sb.from("teams").select("id").single();
    if (team.error) return team;
    return sb.from("actions").insert({ team_id: team.data.id, label: label.trim().slice(0, 120) }).select("id").single();
  });
}

export async function PATCH(req: Request) {
  const { id, done } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || typeof done !== "boolean") return badRequest("Attendu : { id, done }");
  return handle(req, (sb) => sb.from("actions").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id));
}

export async function DELETE(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return badRequest("Attendu : { id }");
  return handle(req, (sb) => sb.from("actions").delete().eq("id", id));
}
