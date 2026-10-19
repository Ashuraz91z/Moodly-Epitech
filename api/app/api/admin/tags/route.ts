import { badRequest, handle } from "@/lib/supabase";

// Crée le tag sans id, le renomme avec.
export async function POST(req: Request) {
  const { id, label } = await req.json().catch(() => ({}));
  if (typeof label !== "string") return badRequest("Attendu : { id?, label }");
  return handle(req, (sb) => sb.rpc("admin_save_tag", { id: id ?? null, label }));
}
