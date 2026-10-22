-- Pronostic du manager sur la matrice (plaisir, énergie, utilité) au lieu d'une note,
-- plan d'action relié aux 6 facteurs, partageable avec l'équipe, et facteurs semaine par semaine.

-- Pronostic ---------------------------------------------------------------------------

-- score (moyenne des 3 axes) reste pour l'écart et la courbe ; nul pour les anciens pronostics.
alter table predictions
  add column pleasure smallint check (pleasure between 1 and 5),
  add column energy smallint check (energy between 1 and 5),
  add column impact smallint check (impact between 1 and 5);

drop function submit_prediction(numeric);
create function submit_prediction(pleasure int, energy int, impact int)
returns void language plpgsql security definer set search_path = public as $$
declare
  tid uuid := (select id from teams where manager_id = auth.uid());
begin
  if tid is null then
    raise exception 'Réservé aux managers' using errcode = '42501';
  end if;
  if submit_prediction.pleasure not between 1 and 5 or submit_prediction.energy not between 1 and 5
    or submit_prediction.impact not between 1 and 5 then
    raise exception 'Plaisir, énergie et utilité : de 1 à 5' using errcode = '22023';
  end if;
  insert into predictions (team_id, week_start, score, pleasure, energy, impact)
  values (tid, moodly_week(), round((submit_prediction.pleasure + submit_prediction.energy + submit_prediction.impact) / 3.0, 1),
    submit_prediction.pleasure, submit_prediction.energy, submit_prediction.impact)
  on conflict do nothing;
  if not found then
    raise exception 'Pronostic déjà fait cette semaine' using errcode = '23505';
  end if;
end $$;

revoke execute on function submit_prediction from public, anon;
grant execute on function submit_prediction to authenticated;

-- Plan d'action ------------------------------------------------------------------------

-- factor : le levier visé (un des 6 facteurs), pour mesurer l'effet ; shared : visible par l'équipe.
alter table actions
  add column factor text check (factor in ('intensite', 'autonomie', 'emotions', 'relations', 'sens', 'securite')),
  add column shared boolean not null default false;

-- L'équipe voit les actions que son manager a choisi de partager (lecture seule).
create policy "l'équipe voit les actions partagées" on actions for select to authenticated
  using (shared and team_id = (select team_id from profiles where id = auth.uid()));

-- Miroir -------------------------------------------------------------------------------

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
      select week_start, avg(score) as avg, avg(impact) as impact, avg(pleasure) as pleasure, avg(energy) as energy, count(*) as n,
        -- 6 facteurs de risques psychosociaux (Gollac), de 1 à 5 (5 = favorable), à partir de 5 questionnaires complets.
        case when count(answers) >= 5 then jsonb_build_object(
          'intensite', round(avg((answers[1] + answers[2]) / 2.0), 2),
          'autonomie', round(avg(answers[3]), 2),
          'emotions', round(avg(6 - answers[4]), 2),
          'relations', round(avg((answers[5] + answers[6] + answers[7]) / 3.0), 2),
          'sens', round(avg(answers[8]), 2),
          'securite', round(avg(answers[9]), 2)
        ) end as factors
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
      select week_start, p.score as prediction, p.pleasure as p_pleasure, p.energy as p_energy, p.impact as p_impact,
        w.avg, w.impact, w.pleasure, w.energy, w.n, w.factors
      from (select * from predictions where team_id = tid and week_start >= this_week - 7 * get_mirror.weeks) p
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
          'factors', l.factors,
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
          'forecast', case when s.p_pleasure is not null then
            jsonb_build_object('pleasure', s.p_pleasure, 'energy', s.p_energy, 'impact', s.p_impact) end,
          'team_avg', round(s.avg, 2),
          'impact', round(s.impact, 2),
          'pleasure', round(s.pleasure, 2),
          'energy', round(s.energy, 2),
          'responses', s.n,
          'gap', round(s.prediction - s.avg, 2),
          'dominant_tag', t.label,
          'factors', s.factors
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

-- Démo ---------------------------------------------------------------------------------

-- Pronostic de chaque manager sur la matrice : Thomas et Marc voient leur équipe en forme,
-- Lina la sous-estime.
alter table private.demo_teams add column forecast smallint[];
update private.demo_teams set forecast = case scenario
  when 'recovery' then array[4, 4, 4]
  when 'robot' then array[4, 4, 4]
  else array[2, 3, 3] end;

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

  -- 5. Pronostics des semaines passées, sur la matrice (celui de la semaine en cours reste à faire).
  insert into predictions (team_id, week_start, score, pleasure, energy, impact)
  select t.id, moodly_week() - 7 * g.k, round((t.forecast[1] + t.forecast[2] + t.forecast[3]) / 3.0, 1),
    t.forecast[1], t.forecast[2], t.forecast[3]
  from private.demo_teams t
  cross join generate_series(1, 8) as g(k);

  -- 6. Plan d'action de Thomas : deux actions sur la charge il y a 4 semaines (faites, partagées avec l'équipe),
  --    une sur les relations engagée la semaine dernière, encore en cours.
  insert into actions (team_id, week_start, label, factor, shared, done_at)
  select '00000000-0000-0000-0000-0000000000aa', moodly_week() - 7 * a.k, a.label, a.factor, a.shared, a.done
  from (values
    (4, 'Point d''équipe sur la charge', 'intensite', true, now() - interval '20 days'),
    (4, 'Revoir les priorités du sprint', 'intensite', true, now() - interval '16 days'),
    (1, 'Entretiens individuels', 'relations', false, null::timestamptz)
  ) a(k, label, factor, shared, done);
end $$;
