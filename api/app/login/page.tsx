"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    if (res.ok) return router.replace("/");
    setBusy(false);
    setError(res.status === 401 ? "E-mail ou mot de passe incorrect." : "Connexion impossible, réessaie.");
  }

  return (
    <div className="hero-page">
      <div className="hero">
        <div className="hero-title">
          <p className="kicker">MOOD TRACKING · ANONYME</p>
          <p className="logo">MOODLY</p>
          <p className="name">Le Miroir</p>
          <div className="bar" />
          <p className="tagline">Rendre visible ce que<br />le management ne voit pas.</p>
          <svg viewBox="0 0 400 110" aria-hidden>
            <path d="M0 34L20 26L48 44L76 40L100 52L130 48L160 70L190 78L210 68L230 82L260 64L290 52L320 44L350 46L380 38L400 30L400 40H290V58H180V22H0Z" fill="#fb7185" fillOpacity=".22" className="appear" />
            <path d="M0 22H180V58H290V40H400" fill="none" stroke="#c4b5fd" strokeWidth="3" strokeDasharray="8 6" />
            <path d="M0 34L20 26L48 44L76 40L100 52L130 48L160 70L190 78L210 68L230 82L260 64L290 52L320 44L350 46L380 38L400 30" fill="none" stroke="#fb7185" strokeWidth="3.5" strokeLinejoin="round" pathLength={1} className="draw" />
          </svg>
        </div>
        <main className="screen">
          <h1>Connexion</h1>
          <p className="sub">Ta réponse reste anonyme, toujours.</p>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label className="field">E-mail<input name="email" type="email" autoComplete="email" required /></label>
            <label className="field">Mot de passe<input name="password" type="password" autoComplete="current-password" required /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
          </form>
        </main>
      </div>
    </div>
  );
}
