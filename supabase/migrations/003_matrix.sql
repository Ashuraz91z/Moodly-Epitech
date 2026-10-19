-- Matrice du bonheur au travail : chaque réponse devient un point (impact, plaisir), de 1 à 5.
--
--   Plaisir ▲   Le Rêveur      │ Épanouissement
--           │   Zone de danger │ Le Robot (risque de burnout)
--           └──────────────────┴─────────────────► Impact
--
-- Une valeur de 3 est sur un axe : « entre deux ». Le moral du Miroir (score) devient
-- la moyenne des deux axes : pronostic, graphe et back-office restent inchangés.

alter table moods add column impact smallint, add column pleasure smallint;
-- Réponses existantes : un seul score connu, reporté sur les deux axes.
update moods set impact = score, pleasure = score;
alter table moods
  alter column impact set not null,
  alter column pleasure set not null,
  add constraint moods_impact_check check (impact between 1 and 5),
  add constraint moods_pleasure_check check (pleasure between 1 and 5),
  drop column score;
alter table moods add column score numeric generated always as ((impact + pleasure) / 2.0) stored;

drop function submit_mood(int, int[]);

create function submit_mood(impact int, pleasure int, tag_ids int[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  tags_clean smallint[] := array(select distinct t from unnest(submit_mood.tag_ids) t);
begin
  select * into me from profiles where id = auth.uid();
  if me.role is distinct from 'employee' or me.team_id is null then
    raise exception 'Réservé aux collaborateurs rattachés à une équipe' using errcode = '42501';
  end if;
  if submit_mood.impact is null or submit_mood.impact not between 1 and 5
     or submit_mood.pleasure is null or submit_mood.pleasure not between 1 and 5 then
    raise exception 'Impact et plaisir doivent être entre 1 et 5' using errcode = '22023';
  end if;
  if cardinality(tags_clean) not between 1 and 3
     or exists (select 1 from unnest(tags_clean) t where t not in (select id from tags)) then
    raise exception 'Choisir entre 1 et 3 tags valides' using errcode = '22023';
  end if;

  insert into moods (entry_key, team_id, day, impact, pleasure, tag_ids)
  values (private.entry_key(auth.uid(), moodly_today()), me.team_id, moodly_today(), submit_mood.impact, submit_mood.pleasure, tags_clean)
  on conflict (entry_key) do nothing;
  if not found then
    raise exception 'Déjà répondu aujourd''hui' using errcode = '23505';
  end if;
end $$;

revoke execute on function submit_mood from public, anon;
grant execute on function submit_mood to authenticated;

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
      select day, avg(score) as avg, count(*) as n
      from moods
      where team_id = tid and day > today - days
      group by day
      having count(*) >= 5  -- seuil d'anonymat
    ),
    -- Calculé uniquement sur les jours affichés : sinon, en comparant avec les
    -- moyennes quotidiennes, on retrouverait les réponses des jours sous le seuil.
    weekly as (
      select date_trunc('week', day)::date as week_start, sum(avg * n) / sum(n) as avg
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
      select week_start, p.score as prediction, w.avg
      from (select week_start, score from predictions where team_id = tid and week_start > today - days - 7) p
      full join weekly w using (week_start)
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
