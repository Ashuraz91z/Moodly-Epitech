-- Moodly : schéma, règles d'accès (RLS) et fonctions.
--
-- Anonymat : la table moods n'a aucune colonne utilisateur et aucune policy.
-- On y écrit uniquement via submit_mood, et on n'en lit que des moyennes
-- via get_mirror, pour les jours ayant au moins 5 réponses.

-- Schéma non exposé par l'API Supabase.
create schema if not exists private;

create table private.settings (salt text not null);
insert into private.settings values (gen_random_uuid()::text);

-- Jour courant en heure française (la base tourne en UTC).
create function moodly_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;

-- Empreinte d'une saisie : bloque les doublons du jour sans stocker l'utilisateur.
-- ponytail: qui a accès au sel (admin de la base) peut recalculer l'empreinte ; sel par jour jeté à minuit si besoin.
create function private.entry_key(uid uuid, day date) returns text
language sql stable as $$
  select encode(sha256(convert_to(uid::text || day::text || (select salt from private.settings), 'UTF8')), 'hex')
$$;

-- Tables ---------------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid not null unique references auth.users on delete cascade
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('employee', 'manager')),
  team_id uuid references teams on delete set null
);

create table tags (
  id smallint primary key,
  label text not null unique
);

insert into tags values
  (1, 'Charge de travail'),
  (2, 'Ambiance'),
  (3, 'Management'),
  (4, 'Reconnaissance'),
  (5, 'Équilibre vie pro / perso'),
  (6, 'Sens du travail'),
  (7, 'Conditions matérielles'),
  (8, 'Personnel');

create table moods (
  entry_key text primary key,
  team_id uuid not null references teams on delete cascade,
  day date not null,
  score smallint not null check (score between 1 and 5),
  tag_ids smallint[] not null check (cardinality(tag_ids) between 1 and 3)
);
create index on moods (team_id, day);

create table predictions (
  team_id uuid references teams on delete cascade,
  week_start date,
  score numeric(2, 1) not null check (score between 1 and 5),
  primary key (team_id, week_start)
);

-- Règles d'accès ---------------------------------------------------------------

alter table profiles enable row level security;
alter table teams enable row level security;
alter table tags enable row level security;
alter table moods enable row level security;
alter table predictions enable row level security;

create policy "lire son profil" on profiles for select to authenticated
  using (id = auth.uid());

create policy "lire son équipe" on teams for select to authenticated
  using (manager_id = auth.uid() or id = (select team_id from profiles where id = auth.uid()));

create policy "lire les tags" on tags for select to authenticated
  using (true);

create policy "lire ses pronostics" on predictions for select to authenticated
  using (team_id in (select id from teams where manager_id = auth.uid()));

-- moods : aucune policy, et aucun droit de table non plus.
revoke all on moods from anon, authenticated;

-- Fonctions ------------------------------------------------------------------

create function submit_mood(score int, tag_ids int[])
returns void language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  tags_clean smallint[] := array(select distinct t from unnest(submit_mood.tag_ids) t);
begin
  select * into me from profiles where id = auth.uid();
  if me.role is distinct from 'employee' or me.team_id is null then
    raise exception 'Réservé aux collaborateurs rattachés à une équipe' using errcode = '42501';
  end if;
  if submit_mood.score is null or submit_mood.score not between 1 and 5 then
    raise exception 'Le score doit être entre 1 et 5' using errcode = '22023';
  end if;
  if cardinality(tags_clean) not between 1 and 3
     or exists (select 1 from unnest(tags_clean) t where t not in (select id from tags)) then
    raise exception 'Choisir entre 1 et 3 tags valides' using errcode = '22023';
  end if;

  insert into moods (entry_key, team_id, day, score, tag_ids)
  values (private.entry_key(auth.uid(), moodly_today()), me.team_id, moodly_today(), submit_mood.score, tags_clean)
  on conflict (entry_key) do nothing;
  if not found then
    raise exception 'Déjà répondu aujourd''hui' using errcode = '23505';
  end if;
end $$;

create function has_submitted_today()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from moods where entry_key = private.entry_key(auth.uid(), moodly_today()))
$$;

-- Un seul pronostic par semaine, non modifiable : sinon le manager pourrait
-- regarder le Miroir puis corriger son pronostic.
create function submit_prediction(score numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  tid uuid := (select id from teams where manager_id = auth.uid());
begin
  if tid is null then
    raise exception 'Réservé aux managers' using errcode = '42501';
  end if;
  insert into predictions (team_id, week_start, score)
  values (tid, date_trunc('week', moodly_today())::date, submit_prediction.score)
  on conflict do nothing;
  if not found then
    raise exception 'Pronostic déjà fait cette semaine' using errcode = '23505';
  end if;
end $$;

-- Le Miroir. gap = pronostic - moyenne équipe (positif : le manager surestime).
create function get_mirror(days int default 30)
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

revoke execute on function submit_mood, has_submitted_today, submit_prediction, get_mirror from public, anon;
grant execute on function submit_mood, has_submitted_today, submit_prediction, get_mirror to authenticated;
