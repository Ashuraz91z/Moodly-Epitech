-- Mon équipe face à l'entreprise : moyennes de toute l'entreprise sur la dernière semaine close,
-- pour comparer. Seules comptent les équipes avec au moins 5 réponses cette semaine-là (seuil d'anonymat).
create function get_benchmark()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid := (select id from teams where manager_id = auth.uid());
  wk date := moodly_week() - 7;
begin
  if tid is null then
    raise exception 'Réservé aux managers' using errcode = '42501';
  end if;
  return (
    with shown as (
      select m.* from moods m
      where m.day >= wk and m.day < wk + 7
        and m.team_id in (select team_id from moods where day >= wk and day < wk + 7 group by 1 having count(*) >= 5)
    )
    select jsonb_build_object(
      'week_start', wk,
      'teams', count(distinct team_id),
      'responses', count(*),
      'participation', round((select count(*) from moods where day >= wk and day < wk + 7)::numeric
        / nullif((select count(*) from profiles where role = 'employee' and team_id is not null), 0), 2),
      'team_avg', round(avg(score), 2),
      'pleasure', round(avg(pleasure), 2),
      'energy', round(avg(energy), 2),
      'impact', round(avg(impact), 2),
      'factors', case when count(answers) >= 5 then jsonb_build_object(
        'intensite', round(avg((answers[1] + answers[2]) / 2.0), 2),
        'autonomie', round(avg(answers[3]), 2),
        'emotions', round(avg(6 - answers[4]), 2),
        'relations', round(avg((answers[5] + answers[6] + answers[7]) / 3.0), 2),
        'sens', round(avg(answers[8]), 2),
        'securite', round(avg(answers[9]), 2)
      ) end,
      'energy_zones', (select jsonb_object_agg(x.z, x.n) from (select private.energy_zone(s.energy, s.pleasure) as z, count(*) as n from shown s group by 1) x)
    )
    from shown
    having count(*) >= 5
  );
end $$;

revoke execute on function get_benchmark from public, anon;
grant execute on function get_benchmark to authenticated;
