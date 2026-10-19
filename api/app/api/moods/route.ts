import { badRequest, handle } from "@/lib/supabase";

export async function POST(req: Request) {
  const { score, tagIds } = await req.json().catch(() => ({}));
  if (typeof score !== "number" || !Array.isArray(tagIds)) return badRequest("Attendu : { score, tagIds }");
  return handle(req, (sb) => sb.rpc("submit_mood", { score, tag_ids: tagIds }));
}
