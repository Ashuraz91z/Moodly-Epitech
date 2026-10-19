-- Démo : comptes, équipes, tags et 30 jours d'historique, régénérés à la demande.
--
-- private.demo_reset() remet la base dans l'état de démo, calé sur aujourd'hui :
-- aucune réponse du jour, aucun pronostic pour la semaine en cours (le parcours les fait).
-- demo_reset() la rend appelable par un compte de démo connecté (« Lancer la démo »).
--
-- ATTENTION : base dédiée à la démo. Tout ce qui n'en fait pas partie (équipes, comptes,
-- tags ajoutés) est supprimé à chaque réinitialisation.

create table private.demo_teams (id uuid primary key, name text not null, scenario text not null, prediction numeric not null);
insert into private.demo_teams values
  ('00000000-0000-0000-0000-0000000000aa', 'Équipe Produit', 'recovery', 4),   -- charge de travail, puis remontée
  ('00000000-0000-0000-0000-0000000000bb', 'Support client', 'robot',    4),   -- efficace mais épuisé ; Marc surestime
  ('00000000-0000-0000-0000-0000000000cc', 'Data & IA',      'dreamer',  2.5); -- plaisir sans impact ; Lina sous-estime

create table private.demo_accounts (id uuid primary key, email text not null unique, role text not null, team uuid);
insert into private.demo_accounts values
  ('00000000-0000-0000-0000-000000000001', 'thomas@moodly.test', 'manager',  '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000002', 'ines@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000003', 'lea@moodly.test',    'employee', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000004', 'hugo@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000005', 'sarah@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000006', 'karim@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000007', 'julie@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000008', 'nathan@moodly.test', 'employee', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000009', 'emma@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-000000000010', 'admin@moodly.test',  'admin',    null),
  ('00000000-0000-0000-0000-000000000011', 'marc@moodly.test',   'manager',  '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000012', 'paul@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000013', 'yanis@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000014', 'nora@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000015', 'sofia@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000016', 'adam@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000017', 'lou@moodly.test',    'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000018', 'noah@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000bb'),
  ('00000000-0000-0000-0000-000000000019', 'lina@moodly.test',   'manager',  '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001a', 'lucas@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001b', 'maya@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001c', 'ilyes@moodly.test',  'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001d', 'jade@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001e', 'tom@moodly.test',    'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-00000000001f', 'rose@moodly.test',   'employee', '00000000-0000-0000-0000-0000000000cc'),
  ('00000000-0000-0000-0000-000000000020', 'eli@moodly.test',    'employee', '00000000-0000-0000-0000-0000000000cc');

create function private.demo_reset() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- 1. On repart de zéro : toutes les équipes (réponses, pronostics, actions en cascade)
  --    et les comptes qui ne sont pas ceux de la démo.
  delete from teams where true;  -- Supabase (safeupdate) refuse un DELETE sans WHERE via l'API
  delete from auth.users u where u.id not in (select id from private.demo_accounts);

  -- 2. Comptes de démo manquants (mot de passe moodly-demo).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated', d.email,
    extensions.crypt('moodly-demo', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from private.demo_accounts d
  where not exists (select 1 from auth.users u where u.id = d.id);

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), d.id, d.id::text, jsonb_build_object('sub', d.id::text, 'email', d.email), 'email', null, now(), now()
  from private.demo_accounts d
  where not exists (select 1 from auth.identities i where i.user_id = d.id);

  -- 3. Équipes, profils et tags d'origine.
  insert into teams (id, name, manager_id)
  select t.id, t.name, a.id
  from private.demo_teams t
  join private.demo_accounts a on a.team = t.id and a.role = 'manager';

  insert into profiles (id, role, team_id)
  select id, role, team from private.demo_accounts
  on conflict (id) do update set role = excluded.role, team_id = excluded.team_id;

  delete from tags where id > 8;
  insert into tags values
    (1, 'Charge de travail'), (2, 'Ambiance'), (3, 'Management'), (4, 'Reconnaissance'),
    (5, 'Équilibre vie pro / perso'), (6, 'Sens du travail'), (7, 'Conditions matérielles'), (8, 'Personnel')
  on conflict (id) do update set label = excluded.label;

  -- 4. 30 jours de réponses, aujourd'hui exclu (le collaborateur du parcours répond lui-même).
  insert into moods (entry_key, team_id, day, impact, pleasure, tag_ids)
  select md5(random()::text || g.d || a.id), a.team, moodly_today() - g.d,
    (case t.scenario
      when 'recovery' then case when g.d > 14 then 2 + floor(random() * 3) when g.d > 7 then 3 + floor(random() * 2) else 2 + floor(random() * 4) end
      when 'robot' then 4 + floor(random() * 2)
      else 1 + floor(random() * 3) end)::smallint,
    (case t.scenario
      when 'recovery' then case when g.d > 14 then 1 + floor(random() * 2) when g.d > 7 then 2 + floor(random() * 3) else 3 + floor(random() * 3) end
      when 'robot' then 1 + floor(random() * (case when g.d > 14 then 3 else 2 end))
      else 4 + floor(random() * 2) end)::smallint,
    array[case t.scenario
      when 'recovery' then case when g.d > 14 and random() < 0.7 then 1 else 1 + floor(random() * 8)::int end
      when 'robot' then (array[1, 5, 3])[1 + floor(random() * 3)::int]   -- charge, équilibre, management
      else (array[6, 4, 2])[1 + floor(random() * 3)::int] end]::smallint[] -- sens, reconnaissance, ambiance
  from private.demo_accounts a
  join private.demo_teams t on t.id = a.team
  cross join generate_series(1, 30) as g(d)
  where a.role = 'employee' and random() < 0.88;

  -- 5. Pronostics des semaines passées (celui de la semaine en cours reste à faire).
  insert into predictions (team_id, week_start, score)
  select t.id, w::date, t.prediction
  from private.demo_teams t
  cross join generate_series(date_trunc('week', moodly_today() - 30), date_trunc('week', moodly_today()) - interval '1 week', interval '1 week') w;

  -- 6. Plan d'action engagé par Thomas il y a deux semaines.
  insert into actions (team_id, week_start, label, done_at)
  select '00000000-0000-0000-0000-0000000000aa', date_trunc('week', moodly_today())::date - 14, a.label, a.done
  from (values ('Point d''équipe sur la charge', now()), ('Revoir les priorités du sprint', now()), ('Entretiens individuels', null::timestamptz)) a(label, done);
end $$;

-- Appelable par un compte de démo connecté uniquement.
create function demo_reset() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() not in (select id from private.demo_accounts) then
    raise exception 'Réservé aux comptes de démo' using errcode = '42501';
  end if;
  perform private.demo_reset();
end $$;

revoke execute on function demo_reset from public, anon;
grant execute on function demo_reset to authenticated;
