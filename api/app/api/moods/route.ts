import { badRequest, handle } from "@/lib/supabase";

// Questionnaire de la semaine : point perçu (plaisir, énergie, impact), Q3 à Q11, tendance Q12, sujets Q13.
export async function POST(req: Request) {
  const { pleasure, energy, impact, answers, trend, tagIds } = await req.json().catch(() => ({}));
  if (![pleasure, energy, impact, trend].every((n) => typeof n === "number") || !Array.isArray(answers) || !Array.isArray(tagIds)) {
    return badRequest("Attendu : { pleasure, energy, impact, answers: [9 notes], trend, tagIds }");
  }
  return handle(req, (sb) => sb.rpc("submit_mood", { pleasure, energy, impact, answers, trend, tag_ids: tagIds }));
}
