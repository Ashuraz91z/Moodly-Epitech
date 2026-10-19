import { cookies } from "next/headers";
import { createClient, type AuthError, type PostgrestError, type Session, type SupabaseClient } from "@supabase/supabase-js";

type Query<T> = PromiseLike<{ data: T; error: PostgrestError | null; status: number }>;

export const client = (authorization?: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });

// Chaque requête passe à Supabase avec le JWT de l'appelant : header Authorization (app iOS)
// ou cookie httpOnly (version web). auth.uid() et les règles RLS s'appliquent à cet utilisateur.
export async function handle<T>(req: Request, run: (sb: SupabaseClient) => Query<T>) {
  const cookie = (await cookies()).get("access_token")?.value;
  const authorization = req.headers.get("authorization") ?? (cookie && `Bearer ${cookie}`);
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ error: "Token manquant" }, { status: 401 });
  }
  const { data, error, status } = await run(client(authorization));
  if (error) return Response.json({ error: error.message }, { status });
  return data == null ? new Response(null, { status: 204 }) : Response.json(data);
}

// Connexion et renouvellement : renvoie les tokens (app iOS) et les pose en cookies (web).
export async function session(req: Request, run: (sb: SupabaseClient) => Promise<{ data: { session: Session | null }; error: AuthError | null }>) {
  const { data, error } = await run(client());
  if (error || !data.session) return Response.json({ error: error?.message ?? "Session invalide" }, { status: 401 });
  const { access_token, refresh_token, expires_at } = data.session;
  const jar = await cookies();
  // Secure seulement en HTTPS : sinon le navigateur refuse le cookie (accès en http sur le réseau local).
  const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const opts = { httpOnly: true, sameSite: "lax", secure: https, path: "/" } as const;
  jar.set("access_token", access_token, { ...opts, maxAge: data.session.expires_in });
  jar.set("refresh_token", refresh_token, { ...opts, maxAge: 60 * 60 * 24 * 30 });
  return Response.json({ access_token, refresh_token, expires_at });
}

// Révoque la session côté Supabase (le refresh token ne marche plus), puis efface les cookies.
export async function logout(req: Request) {
  const jar = await cookies();
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? jar.get("access_token")?.value;
  if (token) {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  jar.delete("access_token");
  jar.delete("refresh_token");
  jar.delete("demo");
  return new Response(null, { status: 204 });
}

export const badRequest = (error: string) => Response.json({ error }, { status: 400 });
