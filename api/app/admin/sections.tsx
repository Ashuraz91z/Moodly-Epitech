"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Admin, type AdminTeam, type AdminUser } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { Icon } from "../icons";
import { fmt } from "../miroir/chart";
import { MatrixPlot, ZONES, type Zone } from "../matrix";

export type Run = (fn: () => Promise<unknown>, ok: string, inline?: boolean) => Promise<string | null>;
type Props = { data: Admin; run: Run };

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)} %`);
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "Jamais");
const health = (avg: number | null) => (avg == null ? "none" : avg >= 3.4 ? "good" : avg >= 2.6 ? "mid" : "low");
// À surveiller : moral bas, plaisir bas (zone Robot ou danger, risque d'épuisement) ou peu de réponses.
const watch = (t: AdminTeam) =>
  (t.avg != null && t.avg < 2.6) || (t.pleasure != null && t.pleasure < 2.5) || (t.participation != null && t.participation < 0.5);
const ROLE = { employee: "Collaborateur", manager: "Manager", admin: "Admin" };

function Header({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="admin-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </header>
  );
}

// <dialog> natif : piège le focus, Échap ferme, fond assombri.
function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="x" /></button>
      </div>
      {open && children}
    </dialog>
  );
}

function Spark({ trend }: { trend: AdminTeam["trend"] }) {
  if (!trend || trend.length < 2) return <span className="muted">—</span>;
  const pts = trend.map((w, i) => `${2 + (i / (trend.length - 1)) * 76},${3 + ((5 - w.avg) / 4) * 18}`).join(" ");
  const delta = trend.at(-1)!.avg - trend[0].avg;
  return (
    <svg className={`spark ${delta >= 0 ? "up" : "down"}`} width="80" height="24" role="img" aria-label={`${delta >= 0 ? "En hausse" : "En baisse"} de ${fmt(Math.abs(delta))} pt sur ${trend.length} semaines`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const Mood = ({ avg }: { avg: number | null }) => <span className={`pill ${health(avg)}`}>{avg == null ? "—" : `${fmt(avg)} / 5`}</span>;

// Vue d'ensemble ---------------------------------------------------------------

export function Overview({ data, onOpen }: { data: Admin; onOpen: (tab: string) => void }) {
  const count = (r: AdminUser["role"]) => data.users.filter((u) => u.role === r).length;
  const email = new Map(data.users.map((u) => [u.id, u.email]));
  const flagged = data.teams.filter(watch);
  const tags = [...data.tags].sort((a, b) => b.uses - a.uses);
  const max = Math.max(1, ...tags.map((t) => t.uses));
  const plotted = data.teams.filter((t) => t.impact != null && t.pleasure != null);
  const zones = data.stats.zones ?? {};
  const total = Object.values(zones).reduce((a, b) => a + b, 0);
  const share = (z: Zone) => Math.round(((zones[z] ?? 0) / total) * 100);

  // Résumé par équipe (tendance = moyenne de chaque semaine sur 30 jours), puis sujets.
  function exportCsv() {
    downloadCsv(`moodly-rapport-${new Date().toISOString().slice(0, 10)}`, [
      ["Équipe", "Manager", "Membres", "Participation 7 j (%)", "Moral 7 j", "Impact 7 j", "Plaisir 7 j", "Tendance 30 j"],
      ...data.teams.map((t) => [
        t.name, email.get(t.manager_id), t.size, t.participation == null ? null : Math.round(t.participation * 100),
        t.avg, t.impact, t.pleasure, (t.trend ?? []).map((w) => fmt(w.avg)).join(" → "),
      ]),
      [],
      ["Sujet", "Citations 30 j"],
      ...tags.map((t) => [t.label, t.uses]),
    ]);
  }

  return (
    <>
      <Header title="Vue d'ensemble" sub="7 derniers jours, aujourd'hui exclu. Moyennes sur les jours d'au moins 5 réponses, pour préserver l'anonymat.">
        <div className="top-actions no-print">
          <button className="ghost" onClick={exportCsv}><Icon name="download" size={16} />Exporter CSV</button>
          <button className="ghost" onClick={() => print()}><Icon name="printer" size={16} />Rapport PDF</button>
        </div>
      </Header>

      <div className="kpis">
        <div className="kpi">
          <span>Comptes</span>
          <strong>{data.users.length}</strong>
          <small>{count("employee")} collab. · {count("manager")} managers · {count("admin")} admin</small>
        </div>
        <div className={`kpi${flagged.length ? " warn" : ""}`}>
          <span>Équipes</span>
          <strong>{data.teams.length}</strong>
          <small>{flagged.length ? `${flagged.length} à surveiller` : "Aucune alerte"}</small>
        </div>
        <div className="kpi">
          <span>Participation</span>
          <strong>{pct(data.stats.participation)}</strong>
          <small>des collaborateurs répondent chaque jour</small>
        </div>
        <div className="kpi">
          <span>Moral moyen</span>
          <strong>{data.stats.avg == null ? "—" : fmt(data.stats.avg)}</strong>
          <small>sur 5, toutes équipes</small>
        </div>
      </div>

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Santé des équipes</h2>
            <button className="ghost" onClick={() => onOpen("equipes")}>Gérer</button>
          </div>
          {data.teams.length === 0 ? (
            <p className="muted">Aucune équipe pour l&apos;instant.</p>
          ) : (
            <div className="table-wrap">
              <table className="data cards">
                <thead><tr><th>Équipe</th><th>Membres</th><th>Participation</th><th>Moral 7 j</th><th>Tendance</th></tr></thead>
                <tbody>
                  {data.teams.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        {watch(t) && <span className="pill low small">À surveiller</span>}
                        <div className="muted small">{email.get(t.manager_id)}</div>
                      </td>
                      <td data-label="Membres">{t.size}</td>
                      <td data-label="Participation">
                        <div className="meter" aria-hidden><div style={{ width: `${Math.min(100, (t.participation ?? 0) * 100)}%` }} /></div>
                        <span className="small">{pct(t.participation)}</span>
                      </td>
                      <td data-label="Moral 7 j"><Mood avg={t.avg} /></td>
                      <td data-label="Tendance"><Spark trend={t.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Matrice de l&apos;entreprise</h2>
              <span className="muted small">7 jours</span>
            </div>
            {plotted.length === 0 ? (
              <p className="muted">Pas encore assez de réponses : une équipe apparaît à partir de 5 réponses par jour.</p>
            ) : (
              <>
                <MatrixPlot
                  marks={plotted.map((t) => ({ p: { impact: t.impact!, pleasure: t.pleasure! }, title: t.name, label: t.name, color: watch(t) ? "var(--rose-text)" : undefined }))}
                  label={`Position des équipes : ${plotted.map((t) => `${t.name}, impact ${fmt(t.impact!)}, plaisir ${fmt(t.pleasure!)}`).join(" ; ")}.`}
                  zones={total ? Object.fromEntries((["dreamer", "thriving", "danger", "robot"] as const).map((z) => [z, <><b>{share(z)} %</b>{ZONES[z].label}</>])) : undefined}
                />
                <p className="muted small">Chaque point est une équipe (en rouge : à surveiller). Pourcentages : toutes les réponses de l&apos;entreprise.</p>
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Sujets les plus cités</h2>
              <span className="muted small">30 jours</span>
            </div>
            <ol className="bars">
              {tags.map((t) => (
                <li key={t.id}>
                  <span>{t.label}</span>
                  <div className="meter" aria-hidden><div style={{ width: `${(t.uses / max) * 100}%` }} /></div>
                  <span className="small">{t.uses}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

// Équipes ----------------------------------------------------------------------

export function Teams({ data, run }: Props) {
  const [edit, setEdit] = useState<AdminTeam | "new" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const email = new Map(data.users.map((u) => [u.id, u.email]));
  const current = edit === "new" ? null : edit;
  const taken = new Set(data.teams.map((t) => t.manager_id));
  const candidates = data.users.filter((u) => u.role !== "admin" && (!taken.has(u.id) || u.id === current?.manager_id));

  function open(t: AdminTeam | "new") {
    setError("");
    setEdit(t);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const err = await run(() => api("/api/admin/teams", { id: current?.id, name: f.get("name"), managerId: f.get("manager") }), current ? "Équipe modifiée" : "Équipe créée", true);
    setBusy(false);
    if (err) setError(err);
    else setEdit(null);
  }

  function remove(t: AdminTeam) {
    if (confirm(`Supprimer l'équipe « ${t.name} » ?\n\nSon historique (réponses, pronostics) sera effacé. Ses membres gardent leur compte, sans équipe.`)) {
      run(() => api("/api/admin/teams", { id: t.id }, "DELETE"), "Équipe supprimée");
    }
  }

  return (
    <>
      <Header title="Équipes" sub={`${data.teams.length} équipe${data.teams.length > 1 ? "s" : ""}`}>
        <button className="btn small" onClick={() => open("new")}><Icon name="plus" size={18} />Nouvelle équipe</button>
      </Header>

      {data.teams.length === 0 ? (
        <div className="panel empty">
          <Icon name="users" size={32} />
          <p>Aucune équipe. Crée la première et nomme son manager.</p>
        </div>
      ) : (
        <div className="team-grid">
          {data.teams.map((t) => (
            <article className="panel team" key={t.id}>
              <div className="panel-head">
                <h2>{t.name}</h2>
                {watch(t) && <span className="pill low">À surveiller</span>}
              </div>
              <p className="muted small">Manager : {email.get(t.manager_id)}</p>
              <dl className="team-stats">
                <div><dt>Membres</dt><dd>{t.size}</dd></div>
                <div><dt>Participation</dt><dd>{pct(t.participation)}</dd></div>
                <div><dt>Moral 7 j</dt><dd><Mood avg={t.avg} /></dd></div>
              </dl>
              <div className="row-actions">
                <button className="ghost" onClick={() => open(t)}><Icon name="pencil" size={16} />Modifier</button>
                <button className="ghost danger" onClick={() => remove(t)}><Icon name="trash" size={16} />Supprimer</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal title={current ? "Modifier l'équipe" : "Nouvelle équipe"} open={edit != null} onClose={() => setEdit(null)}>
        <form className="form" onSubmit={save}>
          <label className="field">Nom de l&apos;équipe<input name="name" defaultValue={current?.name} required maxLength={60} autoFocus /></label>
          <label className="field">
            Manager
            <select name="manager" defaultValue={current?.manager_id ?? ""} required>
              <option value="" disabled>Choisir un compte</option>
              {candidates.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </label>
          <p className="muted small">
            {current ? "Si tu changes de manager, l'ancien redevient collaborateur de l'équipe." : "Le compte choisi devient manager et rejoint l'équipe."}
            {candidates.length === 0 && " Aucun compte disponible : crée d'abord un compte collaborateur."}
          </p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => setEdit(null)}>Annuler</button>
            <button className="btn small" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// Comptes ----------------------------------------------------------------------

export function Users({ data, run }: Props) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const managed = new Map(data.teams.map((t) => [t.manager_id, t.name]));
  const list = data.users.filter((u) => u.email.includes(query.trim().toLowerCase()) && (!roleFilter || u.role === roleFilter));

  function openCreate() {
    setError("");
    setRole("employee");
    setPassword("");
    setCreating(true);
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const err = await run(() => api("/api/admin/users", { email: f.get("email"), password, role, teamId: f.get("team") || null }), "Compte créé", true);
    setBusy(false);
    if (err) setError(err);
    else setCreating(false);
  }

  function update(u: AdminUser, role: string, teamId: string | null) {
    run(() => api("/api/admin/users", { id: u.id, role, teamId }, "PATCH"), "Compte mis à jour");
  }

  function remove(u: AdminUser) {
    if (confirm(`Supprimer le compte ${u.email} ?\n\nSes réponses passées restent dans les moyennes : elles sont anonymes et ne sont pas liées au compte.`)) {
      run(() => api("/api/admin/users", { id: u.id }, "DELETE"), "Compte supprimé");
    }
  }

  return (
    <>
      <Header title="Comptes" sub={`${data.users.length} compte${data.users.length > 1 ? "s" : ""}`}>
        <button className="btn small" onClick={openCreate}><Icon name="plus" size={18} />Nouveau compte</button>
      </Header>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Rechercher un e-mail" aria-label="Rechercher un e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select aria-label="Filtrer par rôle" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">Tous les rôles</option>
          <option value="employee">Collaborateurs</option>
          <option value="manager">Managers</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      <section className="panel flush">
        <div className="table-wrap">
          <table className="data cards">
            <thead><tr><th>E-mail</th><th>Rôle</th><th>Équipe</th><th>Dernière connexion</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map((u) => {
                const team = managed.get(u.id);
                return (
                  <tr key={u.id}>
                    <td><strong>{u.email}</strong><div className="muted small">Créé le {date(u.created_at)}</div></td>
                    <td data-label="Rôle">
                      {team ? (
                        <span className="pill role">Manager</span>
                      ) : (
                        <select aria-label={`Rôle de ${u.email}`} value={u.role === "admin" ? "admin" : "employee"} onChange={(e) => update(u, e.target.value, e.target.value === "employee" ? u.team_id : null)}>
                          <option value="employee">{ROLE.employee}</option>
                          <option value="admin">{ROLE.admin}</option>
                        </select>
                      )}
                    </td>
                    <td data-label="Équipe">
                      {team ? (
                        team
                      ) : u.role === "admin" ? (
                        <span className="muted">—</span>
                      ) : (
                        <select aria-label={`Équipe de ${u.email}`} value={u.team_id ?? ""} onChange={(e) => update(u, "employee", e.target.value || null)}>
                          <option value="">Sans équipe</option>
                          {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="muted" data-label="Dernière connexion">{date(u.last_sign_in_at)}</td>
                    <td className="actions">
                      <button
                        className="icon-btn danger"
                        aria-label={`Supprimer ${u.email}`}
                        title={team ? `Manager de ${team} : change d'abord le manager de l'équipe` : "Supprimer"}
                        disabled={!!team}
                        onClick={() => remove(u)}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <p className="muted empty-row">Aucun compte ne correspond à cette recherche.</p>}
      </section>

      <Modal title="Nouveau compte" open={creating} onClose={() => setCreating(false)}>
        <form className="form" onSubmit={create}>
          <label className="field">E-mail<input name="email" type="email" required autoComplete="off" autoFocus /></label>
          <label className="field">
            Mot de passe initial
            <span className="input-row">
              <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" spellCheck={false} />
              <button type="button" className="ghost" onClick={() => setPassword(crypto.randomUUID().replace(/-/g, "").slice(0, 12))}><Icon name="dice" size={16} />Générer</button>
            </span>
          </label>
          <p className="muted small">8 caractères minimum. Transmets-le à la personne : il n&apos;est plus affiché ensuite.</p>
          <fieldset className="segmented">
            <legend>Rôle</legend>
            {(["employee", "admin"] as const).map((r) => (
              <label key={r}><input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />{ROLE[r]}</label>
            ))}
          </fieldset>
          {role === "employee" && (
            <label className="field">
              Équipe
              <select name="team" defaultValue="">
                <option value="">Sans équipe</option>
                {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => setCreating(false)}>Annuler</button>
            <button className="btn small" disabled={busy}>{busy ? "Création…" : "Créer le compte"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// Tags -------------------------------------------------------------------------

export function Tags({ data, run }: Props) {
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const label = new FormData(form).get("label");
    if (!(await run(() => api("/api/admin/tags", { label }), "Tag ajouté"))) form.reset();
  }

  function rename(e: React.FormEvent<HTMLFormElement>, id: number) {
    e.preventDefault();
    run(() => api("/api/admin/tags", { id, label: new FormData(e.currentTarget).get("label") }), "Tag renommé");
  }

  return (
    <>
      <Header title="Tags" sub="Les sujets proposés aux collaborateurs (1 à 3 par réponse). Un tag ne se supprime pas : les réponses passées y font référence." />

      <form className="panel tag-add" onSubmit={add}>
        <label className="field">Nouveau tag<input name="label" required maxLength={40} placeholder="Ex. Formation" /></label>
        <button className="btn small"><Icon name="plus" size={18} />Ajouter</button>
      </form>

      <ul className="panel flush tag-list">
        {data.tags.map((t) => (
          <li key={t.id}>
            <form onSubmit={(e) => rename(e, t.id)}>
              <input name="label" defaultValue={t.label} key={t.label} required maxLength={40} aria-label={`Libellé du tag ${t.label}`} />
              <span className="muted small">{t.uses} citation{t.uses > 1 ? "s" : ""} / 30 j</span>
              <button className="icon-btn" aria-label={`Enregistrer le tag ${t.label}`} title="Enregistrer"><Icon name="check" size={18} /></button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
