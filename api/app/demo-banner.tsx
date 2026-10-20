"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { DEMO_EMPLOYEE, readHistory, seedDemoHistory } from "./history";
import { Icon } from "./icons";
import { todayInParis } from "./miroir/chart";

// Parcours guidé de la démo : collaborateur → manager → RH, sans réinitialiser entre les étapes.
const STEPS = [
  {
    as: "employee", label: "Collaborateur", paths: ["/saisie", "/parcours"],
    who: "Tu es Inès, collaboratrice de l'Équipe Produit.",
    todo: "Réponds au questionnaire de la semaine (2 min), place-toi toi-même sur la matrice, puis découvre où tes réponses te situent vraiment. Tout reste anonyme : l'équipe n'en voit qu'une moyenne, lundi.",
  },
  {
    as: "manager", label: "Manager", paths: ["/miroir"],
    who: "Tu es Thomas, manager de l'Équipe Produit.",
    todo: "Fais ton pronostic de la semaine, puis lis le Miroir : semaine après semaine, il y a un mois Thomas avait un angle mort de près de 2 points sur la charge de travail ; il a agi et l'équipe est remontée.",
  },
  {
    as: "admin", label: "RH", paths: ["/admin"],
    who: "Tu es l'admin RH de l'entreprise.",
    todo: "Toutes les équipes sur la matrice (impact ou énergie) : Support client est efficace mais épuisé alors que son manager le croit en forme. Comptes, sujets et exports dans les onglets.",
  },
];

const inDemo = () => document.cookie.split("; ").includes("demo=1");

export async function enterDemo(as: string, reset: boolean) {
  const res = await fetch("/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ as, reset }) });
  if (!res.ok) return false;
  if (reset) seedDemoHistory(todayInParis());
  location.replace("/");
  return true;
}

export function DemoBanner() {
  const path = usePathname();
  const on = useSyncExternalStore(() => () => {}, inDemo, () => false);
  const [busy, setBusy] = useState(false);
  const i = STEPS.findIndex((s) => s.paths.includes(path));

  // Démo ouverte sur un autre appareil ou une autre adresse du site : historique d'Inès absent ici.
  useEffect(() => {
    if (on && i === 0 && Object.keys(readHistory(DEMO_EMPLOYEE)).length < 5) seedDemoHistory(todayInParis(), true);
  }, [on, i]);
  if (!on || i < 0) return null;

  const step = STEPS[i];
  const next = STEPS[i + 1];
  async function go(as: string, reset = false) {
    setBusy(true);
    if (!(await enterDemo(as, reset))) setBusy(false);
  }
  async function quit() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.replace("/login");
  }

  const nextButton = next ? (
    <>Étape {i + 2} : {next.label}<Icon name="arrow" size={16} /></>
  ) : (
    <><Icon name="restart" size={16} />Recommencer la démo</>
  );
  const onNext = () => (next ? go(next.as) : go("employee", true));

  return (
    <>
      <aside className="demo-bar" aria-label="Parcours de démo">
        <ol className="demo-steps">
          {STEPS.map((s, k) => (
            <li key={s.as}>
              <button aria-current={k === i ? "step" : undefined} disabled={busy || k === i} onClick={() => go(s.as)}>
                <span>{k + 1}</span>{s.label}
              </button>
            </li>
          ))}
        </ol>
        <p><strong>{step.who}</strong> {step.todo}</p>
        <div className="demo-actions">
          <button className="demo-next" disabled={busy} onClick={onNext}>{nextButton}</button>
          <button className="demo-quit" onClick={quit}>Quitter</button>
        </div>
      </aside>
      {/* Toujours à portée, même après avoir fait défiler la page. */}
      <button className="demo-float" disabled={busy} onClick={onNext} aria-hidden tabIndex={-1}>{busy ? "Chargement…" : nextButton}</button>
    </>
  );
}
