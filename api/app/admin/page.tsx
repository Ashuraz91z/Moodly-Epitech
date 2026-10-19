"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Admin } from "@/lib/api";
import { Icon, Loader, type IconName } from "../icons";
import { Logout } from "../logout";
import { Overview, Tags, Teams, Users, type Run } from "./sections";

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: "apercu", label: "Vue d'ensemble", icon: "chart" },
  { id: "equipes", label: "Équipes", icon: "users" },
  { id: "comptes", label: "Comptes", icon: "user" },
  { id: "tags", label: "Tags", icon: "tag" },
];

// L'onglet est dans l'URL (#equipes…) : lien direct et rechargement gardent la vue.
const initialTab = () => {
  const h = typeof location === "undefined" ? "" : location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? h : TABS[0].id;
};

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<Admin | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(initialTab);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(() => api<Admin>("/api/admin").then(setData), []);

  useEffect(() => {
    load().catch((e) => (e instanceof ApiError && e.status === 403 ? router.replace("/") : setError(e.message)));
  }, [load, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Exécute une action, recharge les données et confirme. Renvoie l'erreur éventuelle
  // (inline : l'appelant l'affiche dans son formulaire au lieu d'un toast).
  const run: Run = async (fn, ok, inline = false) => {
    try {
      await fn();
      await load();
      setToast({ text: ok });
      return null;
    } catch (e) {
      const msg = (e as Error).message;
      if (!inline) setToast({ text: msg, error: true });
      return msg;
    }
  };

  function go(id: string) {
    setTab(id);
    history.replaceState(null, "", `#${id}`);
  }

  if (!data) return <main className="screen">{error ? <p className="error" role="alert">{error}</p> : <Loader />}</main>;

  return (
    <div className="admin">
      <aside className="admin-nav">
        <div className="admin-brand">
          <p className="eyebrow">Moodly</p>
          <span>Back-office</span>
        </div>
        <nav aria-label="Back-office">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
              <Icon name={t.icon} size={18} />
              {t.label}
            </button>
          ))}
        </nav>
        <Logout />
      </aside>

      <main className="admin-main" key={tab}>
        {tab === "apercu" && <Overview data={data} onOpen={go} />}
        {tab === "equipes" && <Teams data={data} run={run} />}
        {tab === "comptes" && <Users data={data} run={run} />}
        {tab === "tags" && <Tags data={data} run={run} />}
      </main>

      <div className="toast-zone" aria-live="polite">
        {toast && (
          <div className={`toast${toast.error ? " error" : ""}`} role={toast.error ? "alert" : "status"}>
            <Icon name={toast.error ? "alert" : "check"} size={18} />
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}
