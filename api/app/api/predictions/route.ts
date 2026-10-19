import { badRequest, handle } from "@/lib/supabase";

export async function POST(req: Request) {
  const { score } = await req.json().catch(() => ({}));
  if (typeof score !== "number") return badRequest("Attendu : { score }");
  return handle(req, (sb) => sb.rpc("submit_prediction", { score }));
}
