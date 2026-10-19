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

// Personne ne lit les réponses brutes.
await fails("42501", "authenticated", INES, "select * from moods");
await fails("42501", "authenticated", THOMAS, "select * from moods");
await fails("42501", "anon", null, "select get_mirror()");

// Saisie collaborateur.
assert.equal((await as("authenticated", INES, "select has_submitted_today() v"))[0].v, false);
await as("authenticated", INES, "select submit_mood(2, 4, array[1, 3, 3])");
assert.equal((await as("authenticated", INES, "select has_submitted_today() v"))[0].v, true);
await fails("23505", "authenticated", INES, "select submit_mood(4, 4, array[2])");
await fails("22023", "authenticated", LEA, "select submit_mood(6, 3, array[1])");
await fails("22023", "authenticated", LEA, "select submit_mood(3, 0, array[1])");
await fails("22023", "authenticated", LEA, "select submit_mood(3, 3, array[]::int[])");
await fails("22023", "authenticated", LEA, "select submit_mood(3, 3, array[1, 2, 3, 4])");
await fails("22023", "authenticated", LEA, "select submit_mood(3, 3, array[99])");
await fails("42501", "authenticated", THOMAS, "select submit_mood(3, 3, array[1])");

// Miroir : réservé au manager, pronostic d'abord, une seule fois par semaine.
await fails("42501", "authenticated", INES, "select get_mirror()");
await fails("42501", "authenticated", INES, "select submit_prediction(3)");
assert.deepEqual((await as("authenticated", THOMAS, "select get_mirror() m"))[0].m, { needs_prediction: true });
await as("authenticated", THOMAS, "select submit_prediction(3.5)");
await fails("23505", "authenticated", THOMAS, "select submit_prediction(4)");

const m = (await as("authenticated", THOMAS, "select get_mirror() m"))[0].m;
assert.equal(m.needs_prediction, false);
assert.equal(m.team_size, 8);
assert.ok(m.days.length > 15 && m.days.every((d) => d.responses >= 5), "seuil de 5 réponses");
assert.ok(!m.days.some((d) => "score" in d || "entry_key" in d));
const old = m.weeks.find((w) => w.gap > 1.5);
assert.equal(old?.dominant_tag, "Charge de travail", "angle mort détecté sur les premières semaines");
assert.equal(m.weeks.at(-1).prediction, 3.5);

// Matrice : agrégats des 7 derniers jours affichés, chaque réponse dans une seule zone.
const z = m.matrix.zones;
assert.equal(z.thriving + z.dreamer + z.danger + z.robot + z.middle, m.matrix.responses);
assert.ok(m.matrix.impact >= 1 && m.matrix.impact <= 5 && m.matrix.pleasure >= 1 && m.matrix.pleasure <= 5);
assert.ok(z.thriving > z.danger, "l'équipe est remontée vers l'épanouissement");

// Trajectoire : un point par semaine affichée ; sujets par zone seulement au-delà de 5 réponses.
assert.ok(m.weeks.filter((w) => w.team_avg != null).every((w) => w.impact >= 1 && w.pleasure >= 1));
assert.ok(Object.keys(m.matrix.zone_tags).length > 0);
for (const [zone, labels] of Object.entries(m.matrix.zone_tags)) {
  assert.ok(m.matrix.zones[zone] >= 5, `zone ${zone} sous le seuil d'anonymat`);
  assert.ok(labels.length >= 1 && labels.length <= 2);
}

// Plan d'action : réservé au manager de l'équipe.
const act = (await as("authenticated", THOMAS, "insert into actions (team_id, label) values ($1, 'Point charge') returning week_start, label", [TEAM]))[0];
assert.equal(act.label, "Point charge");
assert.equal((await as("authenticated", INES, "select * from actions")).length, 0);
await fails("42501", "authenticated", INES, "insert into actions (team_id, label) values ($1, 'x')", [TEAM]);
await fails("23514", "authenticated", THOMAS, "insert into actions (team_id, label) values ($1, '  ')", [TEAM]);
await as("authenticated", THOMAS, "update actions set done_at = now()");
assert.ok((await as("authenticated", THOMAS, "select done_at from actions"))[0].done_at);

// Semaines = moyenne pondérée des seuls jours affichés (pas de fuite des jours sous le seuil).
for (const w of m.weeks.filter((w) => w.team_avg != null)) {
  const days = m.days.filter((d) => {
    const dt = new Date(d.day), ws = new Date(w.week_start);
    return dt >= ws && dt < new Date(ws.getTime() + 7 * 864e5);
  });
  const n = days.reduce((s, d) => s + d.responses, 0);
  const avg = days.reduce((s, d) => s + d.team_avg * d.responses, 0) / n;
  assert.ok(Math.abs(avg - w.team_avg) < 0.02, `semaine ${w.week_start}`);
}

// Back-office : réservé à l'admin, agrégats seulement.
await fails("42501", "authenticated", THOMAS, "select admin_dashboard()");
await fails("42501", "authenticated", INES, "select admin_create_user('x@y.fr', 'motdepasse', 'employee')");
const dash = (await as("authenticated", ADMIN, "select admin_dashboard() d"))[0].d;
assert.equal(dash.users.length, 10);
assert.equal(dash.teams[0].size, 8);
assert.ok(dash.teams[0].avg > 0 && dash.teams[0].participation > 0.5);
assert.ok(dash.tags.some((t) => t.uses > 0));
assert.ok(!JSON.stringify(dash).includes("entry_key") && !JSON.stringify(dash).includes("score"), "aucune réponse brute");
assert.ok(dash.teams[0].impact > 0 && dash.teams[0].pleasure > 0);
assert.ok(Object.values(dash.stats.zones).reduce((x, y) => x + y, 0) > 0);

// Comptes.
const NEW = (await as("authenticated", ADMIN, "select admin_create_user(' Zoe@Moodly.test ', 'motdepasse', 'employee', $1) id", [TEAM]))[0].id;
assert.equal((await as("authenticated", NEW, "select role, team_id from profiles"))[0].team_id, TEAM);
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
assert.equal((await as("authenticated", ADMIN, "select admin_dashboard() d"))[0].d.users.length, 10);

// Tags.
await as("authenticated", ADMIN, "select admin_save_tag(null, 'Formation')");
await as("authenticated", ADMIN, "select admin_save_tag(2, 'Ambiance d''équipe')");
await fails("23505", "authenticated", ADMIN, "select admin_save_tag(null, 'formation')");
const tags = (await as("authenticated", INES, "select id, label from tags order by id")).map((t) => t.label);
assert.equal(tags[1], "Ambiance d'équipe");
assert.equal(tags.at(-1), "Formation");

console.log("OK", JSON.stringify({ ...m, days: `${m.days.length} jours` }, null, 1));
