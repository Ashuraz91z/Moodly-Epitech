import { badRequest, handle } from "@/lib/supabase";

// Questionnaire de la semaine : point perçu (plaisir, énergie, impact), Q3 à Q11, tendance Q12, sujets Q13,
// et le vote « ce qui t'aiderait le plus » (facteur ou « rien »).
export async function POST(req: Request) {
  const { pleasure, energy, impact, answers, trend, tagIds, wish = null } = await req.json().catch(() => ({}));
  if (![pleasure, energy, impact, trend].every((n) => typeof n === "number") || !Array.isArray(answers) || !Array.isArray(tagIds)) {
    return badRequest("Attendu : { pleasure, energy, impact, answers: [9 notes], trend, tagIds, wish? }");
  }
  return handle(req, (sb) => sb.rpc("submit_mood", { pleasure, energy, impact, answers, trend, tag_ids: tagIds, wish }));
}
