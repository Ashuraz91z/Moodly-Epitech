import { cookies } from "next/headers";
import { badRequest, client, session } from "@/lib/supabase";

// Entrée en démo sans identifiants. { reset: true } remet toute la démo à zéro (005_demo.sql) ;
// sans reset, on change seulement de rôle au fil du parcours guidé.
// ponytail: n'importe qui sur le réseau peut entrer, admin compris ; DEMO_PASSWORD vide pour couper la démo.
const ACCOUNTS: Record<string, string> = {
  employee: "ines@moodly.test",
  manager: "thomas@moodly.test",
  admin: "admin@moodly.test",
};

export async function POST(req: Request) {
  const { as, reset } = await req.json().catch(() => ({}));
  const email = ACCOUNTS[as];
  const password = process.env.DEMO_PASSWORD ?? "moodly-demo";
  if (!email || !password) return badRequest("Démo indisponible");

  const res = await session(req, (sb) => sb.auth.signInWithPassword({ email, password }));
  if (!res.ok) return res;
  if (reset) {
    const { access_token } = await res.clone().json();
    const { error } = await client(`Bearer ${access_token}`).rpc("demo_reset");
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  // Lisible par la page : affiche le bandeau du parcours guidé.
  (await cookies()).set("demo", "1", { path: "/", sameSite: "lax" });
  return res;
}
