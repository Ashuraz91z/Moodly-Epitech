import { handle } from "@/lib/supabase";

export function GET(req: Request) {
  return handle(req, async (sb) => {
    const res = await sb.rpc("has_submitted_today");
    return { ...res, data: res.error ? null : { submitted: res.data } };
  });
}
