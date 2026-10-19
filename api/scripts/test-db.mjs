// Rejoue la migration + le seed sur un Postgres en mémoire (PGlite) avec un faux schéma auth Supabase,
// puis vérifie l'anonymat et le Miroir.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("../..", import.meta.url).pathname;
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema extensions;
  create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
    email_change_token_new text, email_change text);
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
await db.exec(readFileSync(`${root}/supabase/migrations/001_init.sql`, "utf8"));
await db.exec(readFileSync(`${root}/supabase/seed.sql`, "utf8"));

const THOMAS = "00000000-0000-0000-0000-000000000001";
const INES = "00000000-0000-0000-0000-000000000002";
const LEA = "00000000-0000-0000-0000-000000000003";

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
await as("authenticated", INES, "select submit_mood(2, array[1, 3, 3])");
assert.equal((await as("authenticated", INES, "select has_submitted_today() v"))[0].v, true);
await fails("23505", "authenticated", INES, "select submit_mood(4, array[2])");
await fails("22023", "authenticated", LEA, "select submit_mood(6, array[1])");
await fails("22023", "authenticated", LEA, "select submit_mood(3, array[]::int[])");
await fails("22023", "authenticated", LEA, "select submit_mood(3, array[1, 2, 3, 4])");
await fails("22023", "authenticated", LEA, "select submit_mood(3, array[99])");
await fails("42501", "authenticated", THOMAS, "select submit_mood(3, array[1])");

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

console.log("OK", JSON.stringify({ ...m, days: `${m.days.length} jours` }, null, 1));
