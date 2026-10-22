-- L'équipe vote : en fin de questionnaire, chaque collaborateur dit ce qui l'aiderait le plus
-- (un des 6 facteurs, ou « rien de particulier »). Anonyme, publié par semaine close à partir de 5 votes.

alter table moods add column wish text
  check (wish in ('intensite', 'autonomie', 'emotions', 'relations', 'sens', 'securite', 'rien'));

drop function submit_mood(int, int, int, int[], int, int[]);
create function submit_mood(pleasure int, energy int, impact int, answers int[], trend int, tag_ids int[], wish text default null)
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
  if submit_mood.wish is not null
     and submit_mood.wish not in ('intensite', 'autonomie', 'emotions', 'relations', 'sens', 'securite', 'rien') then
    raise exception 'Choix invalide' using errcode = '22023';
  end if;

  insert into moods (entry_key, team_id, day, pleasure, energy, impact, answers, trend, tag_ids, wish)
  values (private.entry_key(auth.uid(), moodly_week()), me.team_id, moodly_today(),
    submit_mood.pleasure, submit_mood.energy, submit_mood.impact, submit_mood.answers, submit_mood.trend, tags_clean, submit_mood.wish)
  on conflict (entry_key) do nothing;
  if not found then
    raise exception 'Déjà répondu cette semaine' using errcode = '23505';
  end if;
end $$;

revoke execute on function submit_mood from public, anon;
grant execute on function submit_mood to authenticated;

-- Votes de l'équipe du manager, par semaine close, seulement à partir de 5 votes (seuil d'anonymat).
create function get_wishes(weeks int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid := (select id from teams where manager_id = auth.uid());
  this_week date := moodly_week();
begin
  if tid is null then
    raise exception 'Réservé aux managers' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'votes', w.votes, 'wishes', w.wishes) order by w.week_start)
    from (
      select v.week_start, sum(v.n) as votes, jsonb_object_agg(v.wish, v.n) as wishes
      from (
        select date_trunc('week', m.day)::date as week_start, m.wish, count(*) as n
        from moods m
        where m.team_id = tid and m.wish is not null and m.day < this_week and m.day >= this_week - 7 * get_wishes.weeks
        group by 1, 2
      ) v
      group by 1
      having sum(v.n) >= 5
    ) w
  ), '[]');
end $$;

revoke execute on function get_wishes from public, anon;
grant execute on function get_wishes to authenticated;

-- Démo : chacun vote pour son facteur le plus bas, ou « rien » si tout va bien.
create function private.demo_wish(answers smallint[]) returns text
language sql immutable as $$
  select case when min(v) >= 4 then 'rien' else (array_agg(k order by v, k))[1] end
  from (values
    ('intensite', (answers[1] + answers[2]) / 2.0), ('autonomie', answers[3]::numeric), ('emotions', 6 - answers[4]::numeric),
    ('relations', (answers[5] + answers[6] + answers[7]) / 3.0), ('sens', answers[8]::numeric), ('securite', answers[9]::numeric)
  ) f(k, v)
$$;

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
  --    rempli le jeudi ou le vendredi, avec un vote. Semaine en cours : quelques réponses une fois
  --    la fenêtre ouverte, jamais celle d'Inès (le collaborateur du parcours répond lui-même).
  insert into moods (entry_key, team_id, day, pleasure, energy, impact, answers, trend, tag_ids, wish)
  select private.entry_key(a.id, w.week_start), a.team, least(w.week_start + 3 + floor(random() * 2)::int, moodly_today()),
    q.pleasure, q.energy, q.impact, q.answers, q.trend, q.tags, private.demo_wish(q.answers)
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

  -- 6. Engagements de Thomas : la charge il y a 4 semaines, quand l'équipe la demandait (fait),
  --    les relations la semaine dernière (en cours). Partagés avec l'équipe.
  insert into actions (team_id, week_start, label, factor, shared, done_at)
  select '00000000-0000-0000-0000-0000000000aa', moodly_week() - 7 * a.k, a.label, a.factor, true, a.done
  from (values
    (4, 'Revoir les priorités du sprint avec l''équipe', 'intensite', now() - interval '16 days'),
    (1, 'Entretiens individuels', 'relations', null::timestamptz)
  ) a(k, label, factor, done);
end $$;
