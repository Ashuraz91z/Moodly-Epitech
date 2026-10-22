"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Action, type LastWeek, type Week } from "@/lib/api";
import { FACTORS, type FactorKey } from "../questionnaire";
import { Icon } from "../icons";
import { fmt } from "./chart";

const MS = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const mondayOf = (d: string) => iso(utc(d) - ((new Date(utc(d)).getUTCDay() + 6) % 7) * MS);
const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const factorLabel = (k: FactorKey) => FACTORS.find((f) => f.key === k)!.label;

// Pistes d'action par facteur de risque psychosocial (le levier qu'elles visent).
const IDEAS: Record<FactorKey, string[]> = {
  intensite: ["Point d'équipe sur la charge", "Revoir les priorités du sprint", "Limiter réunions et messages hors horaires"],
  autonomie: ["Laisser l'équipe choisir comment s'organiser", "Réduire les validations superflues", "Déléguer une décision à l'équipe"],
  emotions: ["Débriefer les situations tendues à chaud", "Ne plus laisser une personne seule face aux interlocuteurs difficiles", "Rappeler les ressources d'aide (médecine du travail)"],
  relations: ["Entretiens individuels", "Valoriser les réussites en réunion", "Moment d'équipe informel"],
  sens: ["Rappeler l'impact du travail de l'équipe", "Partager les retours clients", "Associer l'équipe aux décisions"],
  securite: ["Donner de la visibilité sur les projets à venir", "Parler des perspectives d'évolution", "Expliquer les décisions de l'entreprise"],
};
const tone = (v: number) => (v < 2.6 ? "low" : v < 3.4 ? "mid" : "good");

// Effet d'une action : son facteur (ou le moral) de la semaine close avant son lancement à la dernière semaine close.
function effectOf(a: Action, weeks: Week[], last: LastWeek | null) {
  const before = weeks.filter((w) => w.week_start < a.week_start && w.team_avg != null).at(-1);
  if (!before || !last || last.week_start < a.week_start) return null;
  const from = a.factor ? before.factors?.[a.factor] : before.team_avg;
  const to = a.factor ? last.factors?.[a.factor] : last.team_avg;
  return from == null || to == null ? null : { name: a.factor ? factorLabel(a.factor) : "Moral", from, to, since: before.week_start };
}

function Effect({ e, bare = false }: { e: NonNullable<ReturnType<typeof effectOf>>; bare?: boolean }) {
  const d = e.to - e.from;
  const flat = Math.abs(d) < 0.2;
  return (
    <span className={`trend ${flat ? "flat" : d > 0 ? "good" : "bad"}`} title={`Semaine du ${shortDate(e.since)} → dernière semaine close`}>
      {!flat && <Icon name={d > 0 ? "up" : "down"} size={14} />}
      {!bare && `${e.name} `}{fmt(e.from)} → {fmt(e.to)}
    </span>
  );
}

// Plan d'action : leviers tirés des facteurs, actions suivies jusqu'à ce qu'elles soient faites,
// effet mesuré sur le facteur visé, partage possible avec l'équipe.
export function ActionPlan({ last, weeks, today }: { last: LastWeek | null; weeks: Week[]; today: string }) {
  const [actions, setActions] = useState<Action[] | null>(null);
  const [label, setLabel] = useState("");
  const [factor, setFactor] = useState<FactorKey | "">("");
  const [error, setError] = useState("");

  const load = useCallback(() => api<Action[]>("/api/actions").then(setActions), []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function mutate(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    await load().catch(() => {});
  }

  const add = (l: string, f: FactorKey | null) => mutate(() => api("/api/actions", { label: l, factor: f }));
  const remove = (a: Action) => mutate(() => api("/api/actions", { id: a.id }, "DELETE"));
  // Mis à jour tout de suite, rechargé ensuite (et rétabli si la requête échoue).
  function patch(a: Action, change: Partial<Action>, body: object) {
    setActions((list) => list?.map((x) => (x.id === a.id ? { ...x, ...change } : x)) ?? null);
    mutate(() => api("/api/actions", { id: a.id, ...body }, "PATCH"));
  }
  const toggle = (a: Action) => patch(a, { done_at: a.done_at ? null : new Date().toISOString() }, { done: !a.done_at });
  const share = (a: Action) => patch(a, { shared: !a.shared }, { shared: !a.shared });

  const monday = mondayOf(today);
  const list = actions ?? [];
  // En cours : tout ce qui n'est pas fait, quelle que soit la semaine, et ce qui a été fait cette semaine.
  const current = list.filter((a) => !a.done_at || a.done_at.slice(0, 10) >= monday);
  const finished = list.filter((a) => a.done_at && a.done_at.slice(0, 10) < monday);
  // Leviers : les 2 facteurs les plus bas de la dernière semaine close.
  const levers = last?.factors ? [...FACTORS].sort((a, b) => last.factors![a.key] - last.factors![b.key]).slice(0, 2) : [];
  const working = finished.map((a) => effectOf(a, weeks, last)).filter((e) => e && e.to - e.from >= 0.2).length;

  return (
    <div className="plan">
      <h2>Plan d&apos;action <small>{current.length ? `${current.filter((a) => !a.done_at).length} en cours` : "aucune action en cours"}</small></h2>

      {last?.factors && (
        <div className="levers">
          <h3>Tes leviers <small>les 2 facteurs les plus bas, semaine du {shortDate(last.week_start)}</small></h3>
          {levers.map((f) => {
              const v = last.factors![f.key];
              const ideas = IDEAS[f.key].filter((i) => !current.some((a) => a.label === i));
              return (
                <div key={f.key} className="lever">
                  <div className="lever-head"><strong>{f.label}</strong><span className={`pill ${tone(v)}`}>{fmt(v)} / 5</span></div>
                  {ideas.length > 0 && (
                    <div className="chips">
                      {ideas.map((i) => <button key={i} className="chip idea" onClick={() => add(i, f.key)}><Icon name="plus" size={14} />{i}</button>)}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {actions == null ? (
        error ? <p className="error" role="alert">{error}</p> : <p className="muted small">Chargement…</p>
      ) : (
        <>
          {current.length > 0 && (
            <ul className="checklist">
              {current.map((a) => {
                const e = effectOf(a, weeks, last);
                return (
                  <li key={a.id} className="action">
                    <div className="plan-row">
                      <button aria-pressed={!!a.done_at} onClick={() => toggle(a)}>
                        <span className="box" aria-hidden>{a.done_at && <Icon name="check" size={14} />}</span>
                        {a.label}
                      </button>
                      <button
                        className={`share${a.shared ? " on" : ""}`}
                        aria-pressed={a.shared}
                        title={a.shared ? "Visible par l'équipe : cliquer pour la garder pour toi" : "Visible par toi seul·e : cliquer pour la partager avec l'équipe"}
                        onClick={() => share(a)}
                      >
                        <Icon name="users" size={16} />{a.shared ? "Partagée" : "Partager"}
                      </button>
                      <button className="icon-btn danger" aria-label={`Retirer « ${a.label} »`} title="Retirer" onClick={() => remove(a)}>
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                    <div className="action-meta">
                      {a.factor && <span className="pill">{factorLabel(a.factor)}</span>}
                      <span>{a.week_start === monday ? "lancée cette semaine" : `lancée le ${shortDate(a.week_start)}`}</span>
                      {e && <Effect e={e} bare={!!a.factor} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="plan-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!label.trim()) return;
              add(label, factor || null);
              setLabel("");
            }}
          >
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ajouter une action…" aria-label="Nouvelle action" maxLength={120} />
            <select value={factor} onChange={(e) => setFactor(e.target.value as FactorKey | "")} aria-label="Levier visé">
              <option value="">Levier…</option>
              {FACTORS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <button className="btn small" disabled={!label.trim()}><Icon name="plus" size={18} />Ajouter</button>
          </form>
          <p className="muted small">Une action partagée apparaît chez tes collaborateurs, après leur questionnaire : ils voient que leurs réponses servent.</p>

          {error && <p className="error" role="alert">{error}</p>}

          {finished.length > 0 && (
            <details className="plan-history">
              <summary>Actions menées · {finished.length}{working > 0 && ` · ${working} avec un effet positif`}</summary>
              <ul>
                {finished.map((a) => {
                  const e = effectOf(a, weeks, last);
                  return (
                    <li key={a.id}>
                      <strong>{a.label}</strong>{" "}
                      <span className="muted small">lancée le {shortDate(a.week_start)}, faite le {shortDate(a.done_at!.slice(0, 10))}</span>
                      {e && <div><Effect e={e} /></div>}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
