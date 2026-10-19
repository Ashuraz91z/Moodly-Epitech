import { badRequest, handle } from "@/lib/supabase";

export async function POST(req: Request) {
  const { impact, pleasure, score, tagIds } = await req.json().catch(() => ({}));
  // Ancien format { score } (app iOS pas encore à jour) : reporté sur les deux axes.
  const [i, p] = typeof impact === "number" ? [impact, pleasure] : [score, score];
  if (typeof i !== "number" || typeof p !== "number" || !Array.isArray(tagIds)) return badRequest("Attendu : { impact, pleasure, tagIds }");
  return handle(req, (sb) => sb.rpc("submit_mood", { impact: i, pleasure: p, tag_ids: tagIds }));
}
