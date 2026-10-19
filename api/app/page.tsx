"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, type Me } from "@/lib/api";

// Aiguillage selon le rôle.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api<Me>("/api/me").then((me) => router.replace(me.role === "manager" ? "/miroir" : "/saisie"), () => {});
  }, [router]);
  return <main className="screen"><p className="eyebrow">Moodly</p></main>;
}
