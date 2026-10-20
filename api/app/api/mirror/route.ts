import type { NextRequest } from "next/server";
import { handle } from "@/lib/supabase";

export function GET(req: NextRequest) {
  const weeks = Number(req.nextUrl.searchParams.get("weeks") ?? 8);
  return handle(req, (sb) => sb.rpc("get_mirror", { weeks }));
}
