"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Action, type Week } from "@/lib/api";
import { Icon } from "../icons";
import { fmt } from "./chart";

const MS = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const mondayOf = (d: string) => iso(utc(d) - ((new Date(utc(d)).getUTCDay() + 6) % 7) * MS);
const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

// Plan d'action de la semaine, enregistré en base, avec l'historique et l'évolution du moral qui a suivi.
export function ActionPlan({ suggestions, weeks, today }: { suggestions: string[]; weeks: Week[]; today: string }) {
  const [actions, setActions] = useState<Action[] | null>(null);
  const [label, setLabel] = useState("");
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

  const add = (l: string) => mutate(() => api("/api/actions", { label: l }));
  const remove = (a: Action) => mutate(() => api("/api/actions", { id: a.id }, "DELETE"));
  function toggle(a: Action) {
    // Coché tout de suite, rechargé ensuite (et rétabli si la requête échoue).
    setActions((list) => list?.map((x) => (x.id === a.id ? { ...x, done_at: x.done_at ? null : new Date().toISOString() } : x)) ?? null);
    mutate(() => api("/api/actions", { id: a.id, done: !a.done_at }, "PATCH"));
  }

  const monday = mondayOf(today);
  const current = actions?.filter((a) => a.week_start === monday) ?? [];
  const done = current.filter((a) => a.done_at).length;
  const ideas = suggestions.filter((s) => !current.some((a) => a.label === s));
  const avgOf = new Map(weeks.map((w) => [w.week_start, w.team_avg]));
  const past = [...new Set((actions ?? []).filter((a) => a.week_start < monday).map((a) => a.week_start))].map(
    (ws) => [ws, actions!.filter((a) => a.week_start === ws)] as const,
  );

  return (
    <div className="plan">
      <h2>Plan d&apos;action <small>{current.length ? `${done}/${current.length} faites cette semaine` : "cette semaine"}</small></h2>

      {actions == null ? (
        error ? <p className="error" role="alert">{error}</p> : <p className="muted small">Chargement…</p>
      ) : (
        <>
          {current.length > 0 && (
            <>
              <ul className="checklist">
                {current.map((a) => (
                  <li key={a.id} className="plan-row">
                    <button aria-pressed={!!a.done_at} onClick={() => toggle(a)}>
                      <span className="box" aria-hidden>{a.done_at && <Icon name="check" size={14} />}</span>
                      {a.label}
                    </button>
                    <button className="icon-btn danger" aria-label={`Retirer « ${a.label} »`} title="Retirer" onClick={() => remove(a)}>
                      <Icon name="trash" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="progress" aria-hidden><div style={{ width: `${(done / current.length) * 100}%` }} /></div>
            </>
          )}

          <form
            className="plan-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!label.trim()) return;
              add(label);
              setLabel("");
            }}
          >
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ajouter une action…" aria-label="Nouvelle action" maxLength={120} />
            <button className="btn small" disabled={!label.trim()}><Icon name="plus" size={18} />Ajouter</button>
          </form>

          {ideas.length > 0 && (
            <div>
              <p className="muted small">Suggestions d&apos;après le Miroir :</p>
              <div className="chips">
                {ideas.map((i) => (
                  <button key={i} className="chip idea" onClick={() => add(i)}><Icon name="plus" size={14} />{i}</button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          {past.length > 0 && (
            <details className="plan-history">
              <summary>Historique · {past.length} semaine{past.length > 1 ? "s" : ""}</summary>
              <ul>
                {past.map(([ws, list]) => {
                  const before = avgOf.get(ws);
                  const after = avgOf.get(iso(utc(ws) + 7 * MS));
                  const delta = before != null && after != null ? after - before : null;
                  return (
                    <li key={ws}>
                      <strong>Semaine du {shortDate(ws)}</strong>{" "}
                      <span className="muted small">{list.filter((a) => a.done_at).length}/{list.length} faites</span>
                      <ul>
                        {list.map((a) => <li key={a.id} className={a.done_at ? "done" : undefined}>{a.label}</li>)}
                      </ul>
                      {delta != null && (
                        <span className={`trend ${delta >= 0 ? "good" : "bad"}`}>
                          <Icon name={delta >= 0 ? "up" : "down"} size={16} />
                          Moral {fmt(before!)} → {fmt(after!)} la semaine suivante
                        </span>
                      )}
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
