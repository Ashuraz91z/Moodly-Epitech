import type { NextRequest } from "next/server";
import { handle } from "@/lib/supabase";

export function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
  return handle(req, (sb) => sb.rpc("get_mirror", { days }));
}
