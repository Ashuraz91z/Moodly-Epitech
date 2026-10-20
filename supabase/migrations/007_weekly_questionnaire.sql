-- Questionnaire hebdomadaire (voir « Moodly – Questionnaire de moral au travail ») et matrice à trois axes.
--
-- Une réponse par collaborateur et par semaine, ouverte le jeudi et le vendredi. Elle contient :
--   - le point où il se place lui-même : plaisir (Q1), énergie (Q2), impact (sentiment d'être utile) ;
--   - les 9 affirmations Q3 à Q11 (answers, de 1 à 5, Q6 inversée au calcul) ;
--   - la tendance Q12 (-1 moins bonne, 0 pareille, 1 meilleure) et 1 à 3 sujets Q13.
-- Moral du Miroir = moyenne des trois axes. Une semaine n'est publiée qu'une fois close
-- (le lundi) et à partir de 5 réponses : le manager ne voit jamais une moyenne bouger en direct.

create function moodly_week() returns date
language sql stable as $$ select date_trunc('week', moodly_today())::date $$;

-- ponytail: fenêtre fixe (jeudi, vendredi) ; une colonne par équipe si certaines travaillent le week-end.
create function private.window_open() returns boolean
language sql stable as $$ select extract(isodow from moodly_today()) in (4, 5) $$;

-- Les comptes de démo répondent n'importe quel jour, pour que la démo marche tous les jours.
create function private.is_demo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from private.demo_accounts where id = auth.uid())
$$;

create function private.energy_zone(energy int, pleasure int) returns text
language sql immutable as $$
  select case
    when energy > 3 and pleasure > 3 then 'enthusiasm'
    when energy < 3 and pleasure > 3 then 'serenity'
    when energy > 3 and pleasure < 3 then 'tension'
    when energy < 3 and pleasure < 3 then 'dejection'
    else 'middle'
  end
$$;

-- Réponses -------------------------------------------------------------------------

alter table moods add column energy smallint, add column answers smallint[], add column trend smallint;
-- Réponses existantes : l'énergie n'était pas demandée, reprise de l'impact.
update moods set energy = impact where true;
alter table moods
  drop column score,
  alter column energy set not null,
  add constraint moods_energy_check check (energy between 1 and 5),
  add constraint moods_answers_check check (answers is null or (cardinality(answers) = 9 and answers <@ '{1,2,3,4,5}'::smallint[])),
  add constraint moods_trend_check check (trend between -1 and 1);
alter table moods add column score numeric generated always as ((pleasure + energy + impact) / 3.0) stored;

insert into tags values (9, 'Autonomie') on conflict (id) do nothing;

drop function has_submitted_today();
drop function submit_mood(int, int, int[]);

create function week_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'submitted', exists (select 1 from moods where entry_key = private.entry_key(auth.uid(), moodly_week())),
    'open', private.window_open() or private.is_demo(),
    -- prochain jeudi d'ouverture (celui de la semaine, ou de la suivante une fois vendredi passé)
    'opens_on', case when extract(isodow from moodly_today()) > 5 then moodly_week() + 10 else moodly_week() + 3 end
  )
$$;

create function submit_mood(pleasure int, energy int, impact int, answers int[], trend int, tag_ids int[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  tags_clean smallint[] := array(select distinct t from unnest(submit_mood.tag_ids) t);
begin
  select * into me from profiles p where p.id = auth.uid();
  if me.role is distinct from 'employee' or me.team_id is null then
    raise exception 'Réservé aux collaborateurs rattachés à une équipe' using errcode = '42501';
  end if;
  if not private.window_open() and not private.is_demo() then
    raise exception 'Le questionnaire de la semaine est ouvert le jeudi et le vendredi' using errcode = '22023';
  end if;
  if coalesce(submit_mood.pleasure, 0) not between 1 and 5 or coalesce(submit_mood.energy, 0) not between 1 and 5
     or coalesce(submit_mood.impact, 0) not between 1 and 5 then
    raise exception 'Plaisir, énergie et impact doivent être entre 1 et 5' using errcode = '22023';
  end if;
  if cardinality(submit_mood.answers) is distinct from 9
     or exists (select 1 from unnest(submit_mood.answers) a where a is null or a not between 1 and 5) then
    raise exception 'Répondre aux 9 affirmations, de 1 à 5' using errcode = '22023';
  end if;
  if coalesce(submit_mood.trend, 9) not between -1 and 1 then
    raise exception 'Tendance invalide' using errcode = '22023';
  end if;
  if cardinality(tags_clean) not between 1 and 3
     or exists (select 1 from unnest(tags_clean) t where t not in (select id from tags)) then
    raise exception 'Choisir entre 1 et 3 sujets valides' using errcode = '22023';
  end if;

  insert into moods (entry_key, team_id, day, pleasure, energy, impact, answers, trend, tag_ids)
  values (private.entry_key(auth.uid(), moodly_week()), me.team_id, moodly_today(),
    submit_mood.pleasure, submit_mood.energy, submit_mood.impact, submit_mood.answers, submit_mood.trend, tags_clean)
  on conflict (entry_key) do nothing;
  if not found then
    raise exception 'Déjà répondu cette semaine' using errcode = '23505';
  end if;
end $$;

revoke execute on function week_status, submit_mood from public, anon;
grant execute on function week_status, submit_mood to authenticated;

-- Miroir ---------------------------------------------------------------------------

-- Semaines closes uniquement. gap = pronostic - moyenne équipe (positif : le manager surestime).
drop function get_mirror(int);
create function get_mirror(weeks int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid := (select id from teams where manager_id = auth.uid());
  this_week date := moodly_week();
begin
  if tid is null then
    raise exception 'Réservé aux managers' using errcode = '42501';
  end if;

  -- Pronostic d'abord, Miroir ensuite.
  if not exists (select 1 from predictions where team_id = tid and week_start = this_week) then
    return jsonb_build_object('needs_prediction', true);
  end if;

  return (
    with closed as (
      select date_trunc('week', m.day)::date as week_start, m.*
      from moods m
      where m.team_id = tid and m.day < this_week and m.day >= this_week - 7 * get_mirror.weeks
    ),
    weekly as (
      select week_start, avg(score) as avg, avg(impact) as impact, avg(pleasure) as pleasure, avg(energy) as energy, count(*) as n
      from closed
      group by 1
      having count(*) >= 5  -- seuil d'anonymat
    ),
    shown as (select c.* from closed c join weekly w using (week_start)),
    tag_counts as (
      select week_start, t as tag_id, count(*) as n from shown cross join unnest(tag_ids) t group by 1, 2
    ),
    dominant as (
      select distinct on (week_start) week_start, tag_id from tag_counts order by week_start, n desc, tag_id
    ),
    last_week as (select * from weekly order by week_start desc limit 1),
    last_rows as (select s.* from shown s join last_week l using (week_start)),
    series as (
      select week_start, p.score as prediction, w.avg, w.impact, w.pleasure, w.energy, w.n
      from (select week_start, score from predictions where team_id = tid and week_start >= this_week - 7 * get_mirror.weeks) p
      full join weekly w using (week_start)
    )
    select jsonb_build_object(
      'needs_prediction', false,
      'team_size', (select count(*) from profiles where team_id = tid and role = 'employee'),
      -- Semaine en cours : seulement le nombre de réponses, jamais leur contenu.
      'current', jsonb_build_object('week_start', this_week, 'responses', (select count(*) from moods where team_id = tid and day >= this_week)),
      'last', (
        select jsonb_build_object(
          'week_start', l.week_start,
          'responses', l.n,
          'team_avg', round(l.avg, 2),
          'impact', round(l.impact, 2),
          'pleasure', round(l.pleasure, 2),
          'energy', round(l.energy, 2),
          'zones', (select jsonb_object_agg(x.z, x.n) from (select private.zone(r.impact, r.pleasure) as z, count(*) as n from last_rows r group by 1) x),
          'energy_zones', (select jsonb_object_agg(x.z, x.n) from (select private.energy_zone(r.energy, r.pleasure) as z, count(*) as n from last_rows r group by 1) x),
          'tags', (
            select coalesce(jsonb_agg(x.label order by x.n desc, x.label), '[]')
            from (select t.label, count(*) as n from last_rows r cross join unnest(r.tag_ids) tg join tags t on t.id = tg group by 1 order by 2 desc, 1 limit 2) x
          ),
          -- 6 facteurs de risques psychosociaux (Gollac), de 1 à 5 (5 = favorable).
          'factors', (
            select case when count(*) < 5 then null else jsonb_build_object(
              'intensite', round(avg((r.answers[1] + r.answers[2]) / 2.0), 2),
              'autonomie', round(avg(r.answers[3]), 2),
              'emotions', round(avg(6 - r.answers[4]), 2),
              'relations', round(avg((r.answers[5] + r.answers[6] + r.answers[7]) / 3.0), 2),
              'sens', round(avg(r.answers[8]), 2),
              'securite', round(avg(r.answers[9]), 2)
            ) end
            from last_rows r where r.answers is not null
          ),
          'trend', (
            select case when count(*) < 5 then null else jsonb_build_object(
              'better', count(*) filter (where r.trend = 1),
              'same', count(*) filter (where r.trend = 0),
              'worse', count(*) filter (where r.trend = -1)
            ) end
            from last_rows r where r.trend is not null
          )
        )
        from last_week l
      ),
      'weeks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'week_start', s.week_start,
          'prediction', s.prediction,
          'team_avg', round(s.avg, 2),
          'impact', round(s.impact, 2),
          'pleasure', round(s.pleasure, 2),
          'energy', round(s.energy, 2),
          'responses', s.n,
          'gap', round(s.prediction - s.avg, 2),
          'dominant_tag', t.label
        ) order by s.week_start)
        from series s
        left join dominant d using (week_start)
        left join tags t on t.id = d.tag_id
      ), '[]')
    )
  );
end $$;

revoke execute on function get_mirror from public, anon;
grant execute on function get_mirror to authenticated;

-- Back-office ----------------------------------------------------------------------

-- Semaines closes, seuil de 5 réponses par équipe et par semaine. stats = dernière semaine close.
create or replace function admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  this_week date := moodly_week();
  last_week date := moodly_week() - 7;
begin
  perform private.require_admin();
  return (
    with weekly as (
      select m.team_id, date_trunc('week', m.day)::date as week_start, avg(m.score) as avg, avg(m.impact) as impact,
        avg(m.pleasure) as pleasure, avg(m.energy) as energy, count(*) as n
      from moods m
      where m.day < this_week and m.day >= this_week - 56
      group by 1, 2
      having count(*) >= 5
    ),
    shown as (
      select m.* from moods m join weekly w on w.team_id = m.team_id and w.week_start = date_trunc('week', m.day)::date
    ),
    sizes as (
      select p.team_id, count(*) as n from profiles p where p.role = 'employee' and p.team_id is not null group by 1
    ),
    answered as (
      select m.team_id, count(*) as n from moods m where m.day >= last_week and m.day < this_week group by 1
    ),
    tag_use as (
      select t, count(*) as n from shown s cross join unnest(s.tag_ids) t where s.day >= this_week - 28 group by 1
    )
    select jsonb_build_object(
      'stats', jsonb_build_object(
        'week_start', last_week,
        'avg', (select round(sum(w.avg * w.n) / sum(w.n), 2) from weekly w where w.week_start = last_week),
        'participation', round((select coalesce(sum(a.n), 0) from answered a) / nullif((select sum(s.n) from sizes s), 0), 2),
        'zones', (select jsonb_object_agg(x.z, x.n) from (select private.zone(s.impact, s.pleasure) as z, count(*) as n from shown s where s.day >= last_week group by 1) x),
        'energy_zones', (select jsonb_object_agg(x.z, x.n) from (select private.energy_zone(s.energy, s.pleasure) as z, count(*) as n from shown s where s.day >= last_week group by 1) x)
      ),
      'teams', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'manager_id', t.manager_id,
          'size', coalesce(s.n, 0),
          'participation', round(coalesce(a.n, 0)::numeric / nullif(s.n, 0), 2),
          'avg', round(lw.avg, 2),
          'impact', round(lw.impact, 2),
          'pleasure', round(lw.pleasure, 2),
          'energy', round(lw.energy, 2),
          'trend', (
            select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'avg', round(w.avg, 2)) order by w.week_start)
            from weekly w where w.team_id = t.id
          )
        ) order by t.name)
        from teams t
        left join sizes s on s.team_id = t.id
        left join answered a on a.team_id = t.id
        left join weekly lw on lw.team_id = t.id and lw.week_start = last_week
      ), '[]'),
      'users', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', u.id,
          'email', u.email,
          'role', p.role,
          'team_id', p.team_id,
          'created_at', u.created_at,
          'last_sign_in_at', u.last_sign_in_at
        ) order by u.email)
        from profiles p
        join auth.users u on u.id = p.id
      ), '[]'),
      'tags', coalesce((
        select jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label, 'uses', coalesce(tu.n, 0)) order by g.id)
        from tags g
        left join tag_use tu on tu.t = g.id
      ), '[]')
    )
  );
end $$;

-- Démo -----------------------------------------------------------------------------

create function private.demo_note(target numeric) returns smallint
language sql volatile as $$ select greatest(1, least(5, round(target + (random() - 0.5) * 1.8)))::smallint $$;

-- Une réponse plausible au questionnaire : scénario de l'équipe, k semaines avant la semaine en cours.
create function private.demo_answer(scenario text, k int, out pleasure smallint, out energy smallint, out impact smallint,
  out answers smallint[], out trend smallint, out tags smallint[])
language plpgsql volatile as $$
declare
  p numeric; e numeric; i numeric;
begin
  if scenario = 'recovery' then            -- charge de travail, puis remontée
    if k >= 5 then p := 1.8; e := 2.0; i := 3.2;
    elsif k >= 3 then p := 3.0; e := 3.0; i := 3.6;
    else p := 4.2; e := 3.9; i := 4.0; end if;
  elsif scenario = 'robot' then            -- efficace mais sans plaisir : tension, puis épuisement
    p := 1.8; i := 4.3; e := case when k >= 4 then 3.9 else 2.0 end;
  else                                     -- plaisir sans impact (rêveur), énergie basse (sérénité)
    p := 4.3; e := 2.4; i := 1.8;
  end if;
  pleasure := private.demo_note(p);
  energy := private.demo_note(e);
  impact := private.demo_note(i);
  -- Q3 Q4 → énergie, Q5 Q9 Q10 → impact, Q6 (inversée) Q7 Q8 Q11 → plaisir
  answers := array[private.demo_note(e), private.demo_note(e), private.demo_note(i), private.demo_note(6 - p),
    private.demo_note(p), private.demo_note(p), private.demo_note(i), private.demo_note(i), private.demo_note(p)];
  trend := case
    when random() < 0.5 then 0
    when scenario = 'recovery' and k <= 4 then 1
    when scenario = 'robot' and k < 4 then -1
    else floor(random() * 3)::int - 1 end;
  tags := array[case scenario
    when 'recovery' then case when k >= 5 and random() < 0.7 then 1 else 1 + floor(random() * 9)::int end
    when 'robot' then (array[1, 5, 3])[1 + floor(random() * 3)::int]     -- charge, équilibre, management
    else (array[6, 4, 9, 2])[1 + floor(random() * 4)::int] end];         -- sens, reconnaissance, autonomie, ambiance
end $$;

create or replace function private.demo_reset() returns void
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

  -- 3. Équipes, profils et sujets d'origine.
  insert into teams (id, name, manager_id)
  select t.id, t.name, a.id
  from private.demo_teams t
  join private.demo_accounts a on a.team = t.id and a.role = 'manager';

  insert into profiles (id, role, team_id)
  select id, role, team from private.demo_accounts
  on conflict (id) do update set role = excluded.role, team_id = excluded.team_id;

  delete from tags where id > 9;
  insert into tags values
    (1, 'Charge de travail'), (2, 'Ambiance'), (3, 'Management'), (4, 'Reconnaissance'),
    (5, 'Équilibre vie pro / perso'), (6, 'Sens du travail'), (7, 'Conditions matérielles'), (8, 'Personnel'),
    (9, 'Autonomie')
  on conflict (id) do update set label = excluded.label;

  -- 4. Un questionnaire par collaborateur et par semaine sur 8 semaines closes (~90 % de réponses),
  --    rempli le jeudi ou le vendredi. Semaine en cours : quelques réponses une fois la fenêtre ouverte,
  --    jamais celle d'Inès (le collaborateur du parcours répond lui-même).
  insert into moods (entry_key, team_id, day, pleasure, energy, impact, answers, trend, tag_ids)
  select private.entry_key(a.id, w.week_start), a.team, least(w.week_start + 3 + floor(random() * 2)::int, moodly_today()),
    q.pleasure, q.energy, q.impact, q.answers, q.trend, q.tags
  from private.demo_accounts a
  join private.demo_teams t on t.id = a.team
  cross join generate_series(0, 8) as g(k)
  cross join lateral (select moodly_week() - 7 * g.k as week_start) w
  cross join lateral private.demo_answer(t.scenario, g.k) q
  where a.role = 'employee' and random() < 0.9
    and (g.k > 0 or (private.window_open() and a.id <> '00000000-0000-0000-0000-000000000002' and random() < 0.6));

  -- 5. Pronostics des semaines passées (celui de la semaine en cours reste à faire).
  insert into predictions (team_id, week_start, score)
  select t.id, moodly_week() - 7 * g.k, t.prediction
  from private.demo_teams t
  cross join generate_series(1, 8) as g(k);

  -- 6. Plan d'action engagé par Thomas il y a deux semaines.
  insert into actions (team_id, week_start, label, done_at)
  select '00000000-0000-0000-0000-0000000000aa', moodly_week() - 14, a.label, a.done
  from (values ('Point d''équipe sur la charge', now()), ('Revoir les priorités du sprint', now()), ('Entretiens individuels', null::timestamptz)) a(label, done);
end $$;
