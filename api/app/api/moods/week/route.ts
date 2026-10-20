import { handle } from "@/lib/supabase";

// { submitted, open, opens_on } : déjà répondu cette semaine ? questionnaire ouvert (jeudi, vendredi) ?
export function GET(req: Request) {
  return handle(req, (sb) => sb.rpc("week_status"));
}
