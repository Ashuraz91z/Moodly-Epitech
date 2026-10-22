import { handle } from "@/lib/supabase";

// Moyennes de l'entreprise sur la dernière semaine close (équipes avec au moins 5 réponses).
export function GET(req: Request) {
  return handle(req, (sb) => sb.rpc("get_benchmark"));
}
