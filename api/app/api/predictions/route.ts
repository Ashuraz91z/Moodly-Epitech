import { badRequest, handle } from "@/lib/supabase";

const note = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;

// Pronostic sur la matrice : où le manager place son équipe (plaisir, énergie) et son utilité.
export async function POST(req: Request) {
  const { pleasure, energy, impact } = await req.json().catch(() => ({}));
  if (![pleasure, energy, impact].every(note)) return badRequest("Attendu : { pleasure, energy, impact } de 1 à 5");
  return handle(req, (sb) => sb.rpc("submit_prediction", { pleasure, energy, impact }));
}
