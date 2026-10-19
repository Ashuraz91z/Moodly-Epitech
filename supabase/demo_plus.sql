-- Démo enrichie : compte admin + 2 équipes de plus, avec 30 jours de réponses.
-- Rejouable : ne crée que ce qui manque. À exécuter après les migrations et seed.sql.
--
-- Comptes (mot de passe moodly-demo) :
--   admin@moodly.test                 back-office
--   marc@moodly.test  (manager)       Support client : efficace mais épuisé (zone Robot), Marc surestime
--   lina@moodly.test  (manager)       Data & IA : apprécie ses journées mais manque d'impact (Rêveur), Lina sous-estime

drop table if exists demo_more;
create temp table demo_more (id uuid, email text, role text, team uuid);
insert into demo_more values
  ('00000000-0000-0000-0000-000000000010', 'admin@moodly.test', 'admin',    null),
  ('00000000-0000-0000-0000-000000000011', 'marc@moodly.test',  'manager',  '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000012', 'paul@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000013', 'yanis@moodly.test', 'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000014', 'nora@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000015', 'sofia@moodly.test', 'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000016', 'adam@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000017', 'lou@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000018', 'noah@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000019', 'lina@moodly.test',  'manager',  '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001a', 'lucas@moodly.test', 'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001b', 'maya@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001c', 'ilyes@moodly.test', 'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001d', 'jade@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001e', 'tom@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001f', 'rose@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-000000000020', 'eli@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000cc');

-- Comptes manquants seulement.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated', d.email,
  extensions.crypt('moodly-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from demo_more d
where not exists (select 1 from auth.users u where u.id = d.id or u.email = d.email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), d.id, d.id::text, jsonb_build_object('sub', d.id::text, 'email', d.email), 'email', null, now(), now()
from demo_more d
where exists (select 1 from auth.users u where u.id = d.id)
  and not exists (select 1 from auth.identities i where i.user_id = d.id);

insert into teams (id, name, manager_id) values
  ('00000000-0000-0000-0000-0000000000bb', 'Support client', '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-0000000000cc', 'Data & IA',      '00000000-0000-0000-0000-000000000019')
on conflict do nothing;

insert into profiles (id, role, team_id)
select d.id, d.role, d.team from demo_more d
where exists (select 1 from auth.users u where u.id = d.id)
on conflict (id) do nothing;

-- 30 jours de réponses (aujourd'hui exclu), ~90 % de participation, seulement pour une équipe encore vide.
insert into moods (entry_key, team_id, day, impact, pleasure, tag_ids)
select md5(random()::text || g.d || e.id),
  e.team,
  moodly_today() - g.d,
  case when e.team = '00000000-0000-0000-0000-0000000000bb'
    then 4 + floor(random() * 2)                       -- Support : beaucoup d'impact…
    else 1 + floor(random() * 3) end::smallint,         -- Data : peu d'impact…
  case when e.team = '00000000-0000-0000-0000-0000000000bb'
    then 1 + floor(random() * (case when g.d > 14 then 3 else 2 end))   -- …et un plaisir qui s'effondre
    else 4 + floor(random() * 2) end::smallint,                         -- …mais du plaisir
  array[case when e.team = '00000000-0000-0000-0000-0000000000bb'
    then (array[1, 5, 3])[1 + floor(random() * 3)::int]       -- charge, équilibre, management
    else (array[6, 4, 2])[1 + floor(random() * 3)::int] end]::smallint[]  -- sens, reconnaissance, ambiance
from demo_more e
cross join generate_series(1, 30) as g(d)
where e.role = 'employee'
  and random() < 0.9
  and exists (select 1 from profiles p where p.id = e.id)
  and not exists (select 1 from moods m where m.team_id = e.team);

-- Pronostics des semaines passées : Marc pense que tout va bien, Lina s'inquiète trop.
insert into predictions (team_id, week_start, score)
select t.team, w::date, t.score
from (values ('00000000-0000-0000-0000-0000000000bb'::uuid, 4.0), ('00000000-0000-0000-0000-0000000000cc'::uuid, 2.5)) t(team, score)
cross join generate_series(date_trunc('week', moodly_today() - 30), date_trunc('week', moodly_today()) - interval '1 week', interval '1 week') w
where exists (select 1 from teams where id = t.team)
on conflict do nothing;

-- Plan d'action déjà engagé par Thomas il y a deux semaines (historique visible dans le Miroir).
insert into actions (team_id, week_start, label, done_at)
select '00000000-0000-0000-0000-0000000000aa', date_trunc('week', moodly_today())::date - 14, a.label, a.done
from (values ('Point d''équipe sur la charge', now()), ('Revoir les priorités du sprint', now()), ('Entretiens individuels', null::timestamptz)) a(label, done)
where exists (select 1 from teams where id = '00000000-0000-0000-0000-0000000000aa')
  and not exists (select 1 from actions where team_id = '00000000-0000-0000-0000-0000000000aa');

drop table demo_more;
