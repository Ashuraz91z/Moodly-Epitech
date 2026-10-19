import { badRequest, handle } from "@/lib/supabase";

export async function POST(req: Request) {
  const { email, password, role, teamId } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string" || typeof role !== "string") {
    return badRequest("Attendu : { email, password, role, teamId? }");
  }
  return handle(req, (sb) => sb.rpc("admin_create_user", { email, password, role, team_id: teamId ?? null }));
}

export async function PATCH(req: Request) {
  const { id, role, teamId } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || typeof role !== "string") return badRequest("Attendu : { id, role, teamId? }");
  return handle(req, (sb) => sb.rpc("admin_update_user", { id, role, team_id: teamId ?? null }));
}

export async function DELETE(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return badRequest("Attendu : { id }");
  return handle(req, (sb) => sb.rpc("admin_delete_user", { id }));
}
