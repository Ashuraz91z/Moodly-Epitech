import { handle } from "@/lib/supabase";

export function GET(req: Request) {
  return handle(req, (sb) => sb.from("profiles").select("id, role, team:teams(id, name)").single());
}
