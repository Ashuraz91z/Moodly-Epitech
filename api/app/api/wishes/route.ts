import type { NextRequest } from "next/server";
import { handle } from "@/lib/supabase";

// Votes de l'équipe du manager, par semaine close (à partir de 5 votes).
export function GET(req: NextRequest) {
  const weeks = Number(req.nextUrl.searchParams.get("weeks") ?? 8);
  return handle(req, (sb) => sb.rpc("get_wishes", { weeks }));
}
