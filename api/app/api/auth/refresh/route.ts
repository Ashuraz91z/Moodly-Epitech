import { cookies } from "next/headers";
import { badRequest, session } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const refresh_token = body.refresh_token ?? (await cookies()).get("refresh_token")?.value;
  if (typeof refresh_token !== "string") return badRequest("Attendu : { refresh_token }");
  return session(req, (sb) => sb.auth.refreshSession({ refresh_token }));
}
