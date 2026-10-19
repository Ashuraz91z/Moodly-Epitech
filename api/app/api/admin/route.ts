import { handle } from "@/lib/supabase";

export function GET(req: Request) {
  return handle(req, (sb) => sb.rpc("admin_dashboard"));
}
