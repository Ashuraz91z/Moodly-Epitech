import { handle } from "@/lib/supabase";

export function GET(req: Request) {
  return handle(req, (sb) => sb.from("tags").select("id, label").order("id"));
}
