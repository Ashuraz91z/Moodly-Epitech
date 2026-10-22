// Rejoue la migration + le seed sur un Postgres en mémoire (PGlite) avec un faux schéma auth Supabase,
// puis vérifie l'anonymat, le Miroir et le back-office.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("../..", import.meta.url).pathname;
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema extensions;
  create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
    email_change_token_new text, email_change text, last_sign_in_at timestamptz);
  create table auth.identities (id uuid, user_id uuid, provider_id text, identity_data jsonb, provider text,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select $1 $$;
  create function extensions.gen_salt(text) returns text language sql as $$ select $1 $$;
  grant usage on schema public, auth to anon, authenticated;
  -- comme Supabase : droits par défaut sur tout ce qui est créé dans public
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);
for (const f of readdirSync(`${root}/supabase/migrations`).sort()) {
  await db.exec(readFileSync(`${root}/supabase/migrations/${f}`, "utf8"));
}
await db.exec(readFileSync(`${root}/supabase/seed.sql`, "utf8"));

const THOMAS = "00000000-0000-0000-0000-000000000001";
const INES = "00000000-0000-0000-0000-000000000002";
const LEA = "00000000-0000-0000-0000-000000000003";
const ADMIN = "00000000-0000-0000-0000-000000000010";
const TEAM = "00000000-0000-0000-0000-0000000000aa";

async function as(role, uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role};`);
  return (await db.query(sql, params)).rows;
}
async function fails(code, ...args) {
  await assert.rejects(as(...args), (e) => e.code === code || assert.fail(`${e.code} ${e.message}`));
}

// Questionnaire hebdomadaire : point perçu (plaisir, énergie, impact) + Q3 à Q11 + tendance + sujets.
const Q = (p = 4, e = 4, i = 4, answers = "array[4,4,4,2,4,4,4,4,4]", trend = 1, tags = "array[1, 3, 3]") =>
  `select submit_mood(${p}, ${e}, ${i}, ${answers}, ${trend}, ${tags})`;
const isodow = ((new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })).getUTCDay() + 6) % 7) + 1;
const windowOpen = isodow === 4 || isodow === 5;

// Personne ne lit les réponses brutes.
await fails("42501", "authenticated", INES, "select * from moods");
await fails("42501", "authenticated", THOMAS, "select * from moods");
await fails("42501", "anon", null, "select get_mirror()");

// Saisie collaborateur (comptes de démo : fenêtre jeudi-vendredi levée).
assert.equal((await as("authenticated", INES, "select week_status() s"))[0].s.submitted, false);
assert.equal((await as("authenticated", INES, "select week_status() s"))[0].s.open, true, "démo ouverte tous les jours");
await as("authenticated", INES, Q());
assert.equal((await as("authenticated", INES, "select week_status() s"))[0].s.submitted, true);
await fails("23505", "authenticated", INES, Q()); // une seule réponse par semaine
await fails("22023", "authenticated", LEA, Q(6));
await fails("22023", "authenticated", LEA, Q(3, 0));
await fails("22023", "authenticated", LEA, Q(3, 3, 3, "array[4,4,4,4,4,4,4,4]"));
await fails("22023", "authenticated", LEA, Q(3, 3, 3, "array[4,4,4,4,4,4,4,4,0]"));
await fails("22023", "authenticated", LEA, Q(3, 3, 3, undefined, 2));
await fails("22023", "authenticated", LEA, Q(3, 3, 3, undefined, 0, "array[]::int[]"));
await fails("22023", "authenticated", LEA, Q(3, 3, 3, undefined, 0, "array[1, 2, 3, 4]"));
await fails("22023", "authenticated", LEA, Q(3, 3, 3, undefined, 0, "array[99]"));
await fails("42501", "authenticated", THOMAS, Q());

// Miroir : réservé au manager, pronostic d'abord, une seule fois par semaine.
await fails("42501", "authenticated", INES, "select get_mirror()");
await fails("42501", "authenticated", INES, "select submit_prediction(3, 3, 3)");
assert.deepEqual((await as("authenticated", THOMAS, "select get_mirror() m"))[0].m, { needs_prediction: true });
await fails("22023", "authenticated", THOMAS, "select submit_prediction(6, 3, 3)");
await as("authenticated", THOMAS, "select submit_prediction(4, 3, 4)"); // pronostic sur la matrice
await fails("23505", "authenticated", THOMAS, "select submit_prediction(4, 4, 4)");

const m = (await as("authenticated", THOMAS, "select get_mirror() m"))[0].m;
assert.equal(m.needs_prediction, false);
assert.equal(m.team_size, 8);
const closedWeeks = m.weeks.filter((w) => w.team_avg != null);
assert.ok(closedWeeks.length >= 6 && closedWeeks.every((w) => w.responses >= 5), "semaines closes, seuil de 5 réponses");
assert.ok(!JSON.stringify(m).includes("entry_key") && !JSON.stringify(m).includes("answers"), "aucune réponse brute");
const old = m.weeks.find((w) => w.gap > 1.5);
assert.equal(old?.dominant_tag, "Charge de travail", "angle mort détecté sur les premières semaines");
assert.equal(m.weeks.at(-1).prediction, 3.7, "score = moyenne des 3 axes");
assert.deepEqual(m.weeks.at(-1).forecast, { pleasure: 4, energy: 3, impact: 4 });
assert.ok(closedWeeks.every((w) => w.forecast && w.factors?.intensite), "pronostic et facteurs semaine par semaine");
assert.equal(m.weeks.at(-1).team_avg, null, "semaine en cours jamais publiée");
assert.ok(m.current.responses >= 1, "seul le nombre de réponses de la semaine en cours est visible");

// Dernière semaine close : point sur les 3 axes, 2 matrices, 6 facteurs, tendance, 2 sujets.
const L = m.last;
assert.equal(L.week_start, closedWeeks.at(-1).week_start);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
assert.equal(sum(L.zones), L.responses);
assert.equal(sum(L.energy_zones), L.responses);
assert.deepEqual(Object.keys(L.factors).sort(), ["autonomie", "emotions", "intensite", "relations", "securite", "sens"]);
assert.ok(Object.values(L.factors).every((v) => v >= 1 && v <= 5));
assert.equal(L.trend.better + L.trend.same + L.trend.worse, L.responses);
assert.ok(L.tags.length >= 1 && L.tags.length <= 2);
assert.ok(Math.abs(L.team_avg - (L.impact + L.pleasure + L.energy) / 3) < 0.02, "moral = moyenne des 3 axes");
assert.ok((L.zones.thriving ?? 0) > (L.zones.danger ?? 0), "l'équipe est remontée vers l'épanouissement");

// Plan d'action : réservé au manager de l'équipe.
const act = (await as("authenticated", THOMAS, "insert into actions (team_id, label) values ($1, 'Point charge') returning week_start, label", [TEAM]))[0];
assert.equal(act.label, "Point charge");
assert.equal((await as("authenticated", INES, "select * from actions")).length, 2, "l'équipe ne voit que les actions partagées");
await as("authenticated", THOMAS, "update actions set shared = true where label = 'Point charge'");
assert.equal((await as("authenticated", INES, "select * from actions")).length, 3);
assert.equal((await as("authenticated", "00000000-0000-0000-0000-000000000012", "select * from actions")).length, 0, "pas celles des autres équipes");
await fails("23514", "authenticated", THOMAS, "insert into actions (team_id, label, factor) values ($1, 'x', 'inconnu')", [TEAM]);
await fails("42501", "authenticated", INES, "insert into actions (team_id, label) values ($1, 'x')", [TEAM]);
await fails("23514", "authenticated", THOMAS, "insert into actions (team_id, label) values ($1, '  ')", [TEAM]);
await as("authenticated", INES, "update actions set done_at = null");
assert.equal((await as("authenticated", THOMAS, "select count(*)::int n from actions where done_at is not null"))[0].n, 2, "l'équipe ne modifie rien");
await as("authenticated", THOMAS, "update actions set done_at = now()");
assert.ok((await as("authenticated", THOMAS, "select done_at from actions"))[0].done_at);

// Back-office : réservé à l'admin, agrégats seulement.
await fails("42501", "authenticated", THOMAS, "select admin_dashboard()");
await fails("42501", "authenticated", INES, "select admin_create_user('x@y.fr', 'motdepasse', 'employee')");
const dash = (await as("authenticated", ADMIN, "select admin_dashboard() d"))[0].d;
assert.equal(dash.users.length, 26, "comptes de démo");
assert.equal(dash.teams.length, 3);
const produit = dash.teams.find((t) => t.id === TEAM);
assert.equal(produit.size, 8);
assert.ok(produit.avg > 0 && produit.participation > 0.5 && produit.energy > 0);
assert.equal(dash.stats.week_start, L.week_start, "dernière semaine close");
const support = dash.teams.find((t) => t.name === "Support client");
assert.ok(support.impact > 3.5 && support.pleasure < 2.6, "Support : zone Robot");
assert.ok(dash.teams.find((t) => t.name === "Data & IA").pleasure > 3.5);
assert.ok(dash.tags.some((t) => t.uses > 0));
assert.ok(!JSON.stringify(dash).includes("entry_key") && !JSON.stringify(dash).includes("score"), "aucune réponse brute");
assert.ok(produit.impact > 0 && produit.pleasure > 0);
assert.ok(sum(dash.stats.zones) > 0 && sum(dash.stats.zones) === sum(dash.stats.energy_zones));

// Comptes.
const NEW = (await as("authenticated", ADMIN, "select admin_create_user(' Zoe@Moodly.test ', 'motdepasse', 'employee', $1) id", [TEAM]))[0].id;
assert.equal((await as("authenticated", NEW, "select role, team_id from profiles"))[0].team_id, TEAM);
// Hors démo, le questionnaire n'est ouvert que le jeudi et le vendredi.
if (windowOpen) await as("authenticated", NEW, Q());
else await fails("22023", "authenticated", NEW, Q());
assert.equal((await as("authenticated", NEW, "select week_status() s"))[0].s.open, windowOpen);
await fails("23505", "authenticated", ADMIN, "select admin_create_user('zoe@moodly.test', 'motdepasse', 'employee')");
await fails("22023", "authenticated", ADMIN, "select admin_create_user('pas-un-mail', 'motdepasse', 'employee')");
await fails("22023", "authenticated", ADMIN, "select admin_create_user('a@b.fr', 'court', 'employee')");
await fails("22023", "authenticated", ADMIN, "select admin_create_user('a@b.fr', 'motdepasse', 'manager')");
await fails("22023", "authenticated", ADMIN, "select admin_update_user($1, 'employee')", [THOMAS]);
await fails("22023", "authenticated", ADMIN, "select admin_update_user($1, 'employee')", [ADMIN]);
await fails("22023", "authenticated", ADMIN, "select admin_delete_user($1)", [THOMAS]);

// Équipes : changer de manager rétrograde l'ancien, supprimer l'équipe garde les comptes.
await as("authenticated", ADMIN, "select admin_save_team($1, 'Produit', $2)", [TEAM, NEW]);
assert.equal((await as("authenticated", THOMAS, "select role from profiles"))[0].role, "employee");
assert.equal((await as("authenticated", NEW, "select role from profiles"))[0].role, "manager");
const OPS = (await as("authenticated", ADMIN, "select admin_save_team(null, 'Ops', $1) id", [THOMAS]))[0].id;
await fails("23505", "authenticated", ADMIN, "select admin_save_team(null, 'Doublon', $1)", [THOMAS]);
await fails("22023", "authenticated", ADMIN, "select admin_save_team(null, 'Admin', $1)", [ADMIN]);
await as("authenticated", ADMIN, "select admin_delete_team($1)", [OPS]);
assert.deepEqual((await as("authenticated", THOMAS, "select role, team_id from profiles"))[0], { role: "employee", team_id: null });
await as("authenticated", ADMIN, "select admin_delete_user($1)", [THOMAS]);
assert.equal((await as("authenticated", ADMIN, "select admin_dashboard() d"))[0].d.users.length, 26);

// Tags.
await as("authenticated", ADMIN, "select admin_save_tag(null, 'Formation')");
await as("authenticated", ADMIN, "select admin_save_tag(2, 'Ambiance d''équipe')");
await fails("23505", "authenticated", ADMIN, "select admin_save_tag(null, 'formation')");
const tags = (await as("authenticated", INES, "select id, label from tags order by id")).map((t) => t.label);
assert.equal(tags[1], "Ambiance d'équipe");
assert.equal(tags.at(-1), "Formation");

// Réinitialisation de la démo : réservée aux comptes de démo, rejouable, remet tout d'aplomb.
await fails("42501", "authenticated", NEW, "select demo_reset()");
await fails("42501", "anon", null, "select demo_reset()");
await as("authenticated", INES, "select demo_reset()");
await as("authenticated", LEA, "select demo_reset()");
const reset = (await as("authenticated", ADMIN, "select admin_dashboard() d"))[0].d;
assert.equal(reset.users.length, 26, "comptes ajoutés pendant la démo supprimés, comptes supprimés recréés");
assert.deepEqual(reset.teams.map((t) => t.size).sort(), [7, 7, 8]);
assert.equal(reset.tags.length, 9);
assert.equal(reset.tags[8].label, "Autonomie");
assert.equal(reset.tags[1].label, "Ambiance", "libellés d'origine");
assert.equal((await as("authenticated", INES, "select week_status() s"))[0].s.submitted, false, "Inès répond elle-même");
assert.deepEqual((await as("authenticated", THOMAS, "select get_mirror() m"))[0].m, { needs_prediction: true }, "pronostic à refaire");
assert.equal((await as("authenticated", THOMAS, "select count(*)::int n from actions"))[0].n, 3);

console.log("OK", JSON.stringify(m, null, 1));
