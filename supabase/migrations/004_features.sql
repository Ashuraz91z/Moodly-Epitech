-- Trajectoire sur la matrice, sujets par zone, matrice de l'entreprise, plan d'action des managers.

-- Zone de la matrice d'une réponse (mêmes règles que l'app).
create function private.zone(impact int, pleasure int) returns text
language sql immutable as $$
  select case
    when impact > 3 and pleasure > 3 then 'thriving'
    when impact < 3 and pleasure > 3 then 'dreamer'
    when impact < 3 and pleasure < 3 then 'danger'
    when impact > 3 and pleasure < 3 then 'robot'
    else 'middle'
  end
$$;

-- Miroir : chaque semaine gagne son point (impact, plaisir), la matrice ses sujets par zone.
create or replace function get_mirror(days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid := (select id from teams where manager_id = auth.uid());
  today date := moodly_today();
begin
  if tid is null then
    raise exception 'Réservé aux managers' using errcode = '42501';
  end if;

  -- Pronostic d'abord, Miroir ensuite.
  if not exists (select 1 from predictions where team_id = tid and week_start = date_trunc('week', today)::date) then
    return jsonb_build_object('needs_prediction', true);
  end if;

  return (
    with daily as (
      select day, avg(score) as avg, avg(impact) as impact, avg(pleasure) as pleasure, count(*) as n
      from moods
      where team_id = tid and day > today - days
      group by day
      having count(*) >= 5  -- seuil d'anonymat
    ),
    -- Calculé uniquement sur les jours affichés : sinon, en comparant avec les
    -- moyennes quotidiennes, on retrouverait les réponses des jours sous le seuil.
    weekly as (
      select date_trunc('week', day)::date as week_start, sum(avg * n) / sum(n) as avg,
        sum(impact * n) / sum(n) as impact, sum(pleasure * n) / sum(n) as pleasure
      from daily
      group by 1
    ),
    tag_counts as (
      select date_trunc('week', m.day)::date as week_start, t as tag_id, count(*) as n
      from moods m
      join daily d on d.day = m.day
      cross join unnest(m.tag_ids) t
      where m.team_id = tid
      group by 1, 2
    ),
    dominant as (
      select distinct on (week_start) week_start, tag_id
      from tag_counts
      order by week_start, n desc, tag_id
    ),
    weeks as (
      select week_start, p.score as prediction, w.avg, w.impact, w.pleasure
      from (select week_start, score from predictions where team_id = tid and week_start > today - days - 7) p
      full join weekly w using (week_start)
    ),
    -- Sujets par zone (7 derniers jours affichés), seulement pour les zones d'au moins 5 réponses :
    -- sinon une zone presque vide trahirait les sujets d'une seule personne.
    zoned as (
      select m.tag_ids, private.zone(m.impact, m.pleasure) as zone
      from moods m
      join daily d on d.day = m.day
      where m.team_id = tid and m.day between today - 7 and today - 1
    ),
    zone_counts as (
      select z.zone, t.label, count(*) as n
      from zoned z
      cross join unnest(z.tag_ids) tg
      join tags t on t.id = tg
      where z.zone in (select zone from zoned group by zone having count(*) >= 5)
      group by 1, 2
    ),
    zone_ranked as (
      select zone, label, row_number() over (partition by zone order by n desc, label) as rk from zone_counts
    )
    select jsonb_build_object(
      'needs_prediction', false,
      'team_size', (select count(*) from profiles where team_id = tid and role = 'employee'),
      -- 7 derniers jours sans aujourd'hui : le manager ne voit pas le compteur bouger en direct.
      'avg_daily_responses', (select round(count(*) / 7.0, 1) from moods where team_id = tid and day between today - 7 and today - 1),
      -- Matrice de l'équipe : 7 derniers jours sans aujourd'hui, jours affichés seulement (seuil d'anonymat).
      'matrix', (
        select case when count(*) = 0 then null else jsonb_build_object(
          'responses', count(*),
          'impact', round(avg(m.impact), 2),
          'pleasure', round(avg(m.pleasure), 2),
          'zones', jsonb_build_object(
            'thriving', count(*) filter (where m.impact > 3 and m.pleasure > 3),
            'dreamer', count(*) filter (where m.impact < 3 and m.pleasure > 3),
            'danger', count(*) filter (where m.impact < 3 and m.pleasure < 3),
            'robot', count(*) filter (where m.impact > 3 and m.pleasure < 3),
            'middle', count(*) filter (where m.impact = 3 or m.pleasure = 3)
          ),
          'zone_tags', (
            select coalesce(jsonb_object_agg(x.zone, x.labels), '{}')
            from (select zone, jsonb_agg(label order by rk) as labels from zone_ranked where rk <= 2 group by zone) x
          )
        ) end
        from moods m
        join daily d on d.day = m.day
        where m.team_id = tid and m.day between today - 7 and today - 1
      ),
      'days', coalesce((
        select jsonb_agg(jsonb_build_object('day', day, 'team_avg', round(avg, 2), 'responses', n) order by day)
        from daily
      ), '[]'),
      'weeks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'week_start', wk.week_start,
          'prediction', wk.prediction,
          'team_avg', round(wk.avg, 2),
          'impact', round(wk.impact, 2),
          'pleasure', round(wk.pleasure, 2),
          'gap', round(wk.prediction - wk.avg, 2),
          'dominant_tag', case when abs(wk.prediction - wk.avg) > 1.5 then t.label end
        ) order by wk.week_start)
        from weeks wk
        left join dominant d using (week_start)
        left join tags t on t.id = d.tag_id
      ), '[]')
    )
  );
end $$;

-- Back-office : point de chaque équipe et répartition par zone de toute l'entreprise.
create or replace function admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := moodly_today();
begin
  perform private.require_admin();
  return (
    with daily as (  -- 30 derniers jours, aujourd'hui exclu, seuil d'anonymat par équipe
      select m.team_id, m.day, avg(m.score) as avg, avg(m.impact) as impact, avg(m.pleasure) as pleasure, count(*) as n
      from moods m
      where m.day between today - 30 and today - 1
      group by 1, 2
      having count(*) >= 5
    ),
    week as (
      select m.team_id, count(*) as n from moods m where m.day between today - 7 and today - 1 group by 1
    ),
    sizes as (
      select p.team_id, count(*) as n from profiles p where p.role = 'employee' and p.team_id is not null group by 1
    ),
    tag_use as (
      select t, count(*) as n
      from moods m
      join daily d on d.team_id = m.team_id and d.day = m.day
      cross join unnest(m.tag_ids) t
      group by 1
    )
    select jsonb_build_object(
      'stats', jsonb_build_object(
        'avg', (select round(sum(d.avg * d.n) / sum(d.n), 2) from daily d where d.day >= today - 7),
        'participation', round((select coalesce(sum(w.n), 0) from week w) / nullif(7.0 * (select sum(s.n) from sizes s), 0), 2),
        -- Matrice de l'entreprise : 7 derniers jours affichés, toutes équipes.
        'zones', (
          select jsonb_object_agg(x.zone, x.n)
          from (
            select private.zone(m.impact, m.pleasure) as zone, count(*) as n
            from moods m
            join daily d on d.team_id = m.team_id and d.day = m.day
            where d.day >= today - 7
            group by 1
          ) x
        )
      ),
      'teams', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'manager_id', t.manager_id,
          'size', coalesce(s.n, 0),
          'participation', round(coalesce(w.n, 0) / nullif(7.0 * s.n, 0), 2),
          'avg', (select round(sum(d.avg * d.n) / sum(d.n), 2) from daily d where d.team_id = t.id and d.day >= today - 7),
          'impact', (select round(sum(d.impact * d.n) / sum(d.n), 2) from daily d where d.team_id = t.id and d.day >= today - 7),
          'pleasure', (select round(sum(d.pleasure * d.n) / sum(d.n), 2) from daily d where d.team_id = t.id and d.day >= today - 7),
          'trend', (
            select jsonb_agg(jsonb_build_object('week_start', x.week_start, 'avg', x.avg) order by x.week_start)
            from (
              select date_trunc('week', d.day)::date as week_start, round(sum(d.avg * d.n) / sum(d.n), 2) as avg
              from daily d where d.team_id = t.id group by 1
            ) x
          )
        ) order by t.name)
        from teams t
        left join sizes s on s.team_id = t.id
        left join week w on w.team_id = t.id
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

-- Plan d'action -------------------------------------------------------------------

-- Actions décidées par le manager pour son équipe, semaine par semaine. Rien d'individuel.
create table actions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  week_start date not null default date_trunc('week', moodly_today())::date,
  label text not null check (length(trim(label)) between 1 and 120),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index on actions (team_id, week_start);

alter table actions enable row level security;

create policy "le manager gère les actions de son équipe" on actions for all to authenticated
  using (team_id in (select id from teams where manager_id = auth.uid()))
  with check (team_id in (select id from teams where manager_id = auth.uid()));

grant select, insert, update, delete on actions to authenticated;
