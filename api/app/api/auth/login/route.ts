import { badRequest, session } from "@/lib/supabase";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string") return badRequest("Attendu : { email, password }");
  return session(req, (sb) => sb.auth.signInWithPassword({ email, password }));
}
