import { badRequest, handle } from "@/lib/supabase";

// Crée l'équipe sans id, la modifie avec.
export async function POST(req: Request) {
  const { id, name, managerId } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || typeof managerId !== "string") return badRequest("Attendu : { id?, name, managerId }");
  return handle(req, (sb) => sb.rpc("admin_save_team", { id: id ?? null, name, manager_id: managerId }));
}

export async function DELETE(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return badRequest("Attendu : { id }");
  return handle(req, (sb) => sb.rpc("admin_delete_team", { id }));
}
