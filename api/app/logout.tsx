"use client";

import { Icon } from "./icons";

export function Logout() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.replace("/login");
  }
  return <button className="link" onClick={logout}><Icon name="logout" size={16} />Se déconnecter</button>;
}
