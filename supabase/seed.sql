-- Données de démo : 1 admin, 1 manager, 8 collaborateurs, 30 jours de réponses.
-- Comptes : admin@moodly.test (back-office), thomas@moodly.test (manager), ines@moodly.test, lea@moodly.test… (collaborateurs)
-- Mot de passe de tous les comptes : moodly-demo
--
-- Scénario : l'équipe est à ~2/5 (charge de travail : impact moyen, plaisir au plus bas, entre
-- zone de danger et burnout) alors que Thomas pronostique 4/5, puis l'équipe remonte vers
-- l'épanouissement et l'écart se referme. Le pronostic de la semaine en cours
-- et les réponses du jour ne sont pas seedés, pour pouvoir les faire en démo.

create temp table demo_users (id uuid, email text, role text);
insert into demo_users values
  ('00000000-0000-0000-0000-000000000001', 'thomas@moodly.test', 'manager'),
  ('00000000-0000-0000-0000-000000000002', 'ines@moodly.test',   'employee'),
  ('00000000-0000-0000-0000-000000000003', 'lea@moodly.test',    'employee'),
  ('00000000-0000-0000-0000-000000000004', 'hugo@moodly.test',   'employee'),
  ('00000000-0000-0000-0000-000000000005', 'sarah@moodly.test',  'employee'),
  ('00000000-0000-0000-0000-000000000006', 'karim@moodly.test',  'employee'),
  ('00000000-0000-0000-0000-000000000007', 'julie@moodly.test',  'employee'),
  ('00000000-0000-0000-0000-000000000008', 'nathan@moodly.test', 'employee'),
  ('00000000-0000-0000-0000-000000000009', 'emma@moodly.test',   'employee'),
  ('00000000-0000-0000-0000-000000000010', 'admin@moodly.test',  'admin');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('moodly-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from demo_users;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from demo_users;

insert into teams (id, name, manager_id)
values ('00000000-0000-0000-0000-0000000000aa', 'Équipe Produit', '00000000-0000-0000-0000-000000000001');

insert into profiles (id, role, team_id)
select id, role, case when role <> 'admin' then '00000000-0000-0000-0000-0000000000aa'::uuid end from demo_users;

-- ~85 % de participation par jour, hier compris, aujourd'hui exclu.
insert into moods (entry_key, team_id, day, impact, pleasure, tag_ids)
select md5(random()::text || d || e),
  '00000000-0000-0000-0000-0000000000aa',
  moodly_today() - d,
  (case when d > 14 then 2 + floor(random() * 3) when d > 7 then 3 + floor(random() * 2) else 2 + floor(random() * 4) end)::smallint,
  (case when d > 14 then 1 + floor(random() * 2) when d > 7 then 2 + floor(random() * 3) else 3 + floor(random() * 3) end)::smallint,
  case when d > 14 and random() < 0.7 then array[1] else array[1 + floor(random() * 8)::int] end::smallint[]
from generate_series(1, 30) d, generate_series(1, 8) e
where random() < 0.85;

-- Thomas pronostique toujours 4/5 (semaines passées seulement).
insert into predictions (team_id, week_start, score)
select '00000000-0000-0000-0000-0000000000aa', w::date, 4
from generate_series(date_trunc('week', moodly_today() - 30), date_trunc('week', moodly_today()) - interval '1 week', interval '1 week') w;
