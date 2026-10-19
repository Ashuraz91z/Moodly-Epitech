"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "../icons";
import { enterDemo } from "../demo-banner";

const DEMOS: { as: string; label: string; text: string; icon: IconName }[] = [
  { as: "employee", label: "Collaborateur", text: "Placer son humeur sur la matrice", icon: "user" },
  { as: "manager", label: "Manager", text: "Le Miroir et le plan d'action", icon: "users" },
  { as: "admin", label: "Admin", text: "Le back-office de l'entreprise", icon: "chart" },
];

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState("");

  // Chaque entrée en démo repart d'une démo remise à zéro.
  async function startDemo(as: string) {
    setDemo(as);
    setError("");
    if (await enterDemo(as, true)) return;
    setDemo("");
    setError("Démo indisponible : la démo n'est pas installée sur cette base (migration 005_demo.sql).");
  }

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
          <button className="demo-cta" disabled={!!demo} onClick={() => startDemo("employee")}>
            <Icon name="play" size={18} />
            <span><strong>{demo === "employee" ? "Préparation de la démo…" : "Lancer la démo guidée"}</strong><small>3 étapes : collaborateur, manager, RH · données remises à zéro</small></span>
          </button>
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
          <div className="demo">
            <p className="demo-title"><span>ou entre directement en démo</span></p>
            <div className="demo-list">
              {DEMOS.map((d) => (
                <button key={d.as} type="button" className="demo-btn" disabled={!!demo} onClick={() => startDemo(d.as)}>
                  <Icon name={d.icon} size={20} />
                  <span><strong>{demo === d.as ? "Ouverture…" : d.label}</strong><small>{d.text}</small></span>
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
