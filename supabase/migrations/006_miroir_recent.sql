-- Miroir : l'écart du pronostic se mesure sur les 7 derniers jours (champ recent),
-- et non plus seulement sur la semaine calendaire, vide le lundi.

-- Le Miroir. gap = pronostic - moyenne équipe (positif : le manager surestime).
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
      -- Les 7 derniers jours (aujourd'hui exclu, jours affichés seulement) : base de la météo, de l'écart
      -- et de l'angle mort, disponibles même un lundi où la semaine en cours n'a encore aucun jour.
      'recent', (
        select case when count(*) = 0 then null else jsonb_build_object(
          'team_avg', round(avg(m.score), 2),
          'dominant_tag', (
            select t.label
            from moods m2
            join daily d2 on d2.day = m2.day
            cross join unnest(m2.tag_ids) tg
            join tags t on t.id = tg
            where m2.team_id = tid and m2.day between today - 7 and today - 1
            group by t.label
            order by count(*) desc, t.label
            limit 1
          )
        ) end
        from moods m
        join daily d on d.day = m.day
        where m.team_id = tid and m.day between today - 7 and today - 1
      ),
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
