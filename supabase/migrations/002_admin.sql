-- Back-office : rôle admin, gestion des équipes, des comptes et des tags.
--
-- L'admin ne lit jamais de réponse individuelle : seulement des agrégats, sur les
-- jours passés ayant au moins 5 réponses (même seuil que le Miroir).
-- Un manager est le responsable d'une équipe (teams.manager_id) : on le nomme
-- depuis l'équipe, et son rôle dans profiles suit automatiquement.

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('employee', 'manager', 'admin'));

create function private.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Réservé aux administrateurs' using errcode = '42501';
  end if;
end $$;

create function admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := moodly_today();
begin
  perform private.require_admin();
  return (
    with daily as (  -- 30 derniers jours, aujourd'hui exclu, seuil d'anonymat par équipe
      select m.team_id, m.day, avg(m.score) as avg, count(*) as n
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
        'participation', round((select coalesce(sum(w.n), 0) from week w) / nullif(7.0 * (select sum(s.n) from sizes s), 0), 2)
      ),
      'teams', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'manager_id', t.manager_id,
          'size', coalesce(s.n, 0),
          'participation', round(coalesce(w.n, 0) / nullif(7.0 * s.n, 0), 2),
          'avg', (select round(sum(d.avg * d.n) / sum(d.n), 2) from daily d where d.team_id = t.id and d.day >= today - 7),
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

-- Comptes ----------------------------------------------------------------------

-- ponytail: mot de passe initial choisi par l'admin ; invitation par e-mail quand il y aura une clé service_role côté serveur.
create function admin_create_user(email text, password text, role text, team_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := gen_random_uuid();
  mail text := lower(trim(admin_create_user.email));
begin
  perform private.require_admin();
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail invalide' using errcode = '22023';
  end if;
  if length(coalesce(admin_create_user.password, '')) < 8 then
    raise exception 'Mot de passe : 8 caractères minimum' using errcode = '22023';
  end if;
  if admin_create_user.role is null or admin_create_user.role not in ('employee', 'admin') then
    raise exception 'Rôle invalide : un manager se nomme depuis son équipe' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where u.email = mail) then
    raise exception 'Un compte existe déjà avec cet e-mail' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
    extensions.crypt(admin_create_user.password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', mail), 'email', null, now(), now());
  insert into profiles (id, role, team_id)
  values (uid, admin_create_user.role, case when admin_create_user.role = 'employee' then admin_create_user.team_id end);
  return uid;
end $$;

create function admin_update_user(id uuid, role text, team_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  if admin_update_user.role is null or admin_update_user.role not in ('employee', 'admin') then
    raise exception 'Rôle invalide : un manager se nomme depuis son équipe' using errcode = '22023';
  end if;
  if admin_update_user.id = auth.uid() and admin_update_user.role <> 'admin' then
    raise exception 'Tu ne peux pas retirer ton propre accès admin' using errcode = '22023';
  end if;
  if exists (select 1 from teams t where t.manager_id = admin_update_user.id) then
    raise exception 'Ce compte manage une équipe : change d''abord le manager de l''équipe' using errcode = '22023';
  end if;
  update profiles p
  set role = admin_update_user.role,
      team_id = case when admin_update_user.role = 'employee' then admin_update_user.team_id end
  where p.id = admin_update_user.id;
  if not found then
    raise exception 'Compte introuvable' using errcode = '22023';
  end if;
end $$;

-- Les réponses passées restent dans les moyennes : elles ne sont pas liées au compte.
create function admin_delete_user(id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  if admin_delete_user.id = auth.uid() then
    raise exception 'Tu ne peux pas supprimer ton propre compte' using errcode = '22023';
  end if;
  if exists (select 1 from teams t where t.manager_id = admin_delete_user.id) then
    raise exception 'Ce compte manage une équipe : change d''abord le manager de l''équipe' using errcode = '22023';
  end if;
  delete from auth.users u where u.id = admin_delete_user.id;
end $$;

-- Équipes ----------------------------------------------------------------------

-- Crée (id null) ou modifie une équipe. L'ancien manager redevient collaborateur de l'équipe.
create function admin_save_team(id uuid, name text, manager_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tid uuid := admin_save_team.id;
  old_manager uuid;
begin
  perform private.require_admin();
  if coalesce(trim(admin_save_team.name), '') = '' then
    raise exception 'Le nom de l''équipe est obligatoire' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles p where p.id = admin_save_team.manager_id and p.role <> 'admin') then
    raise exception 'Manager invalide : choisir un compte non admin' using errcode = '22023';
  end if;
  if exists (select 1 from teams t where t.manager_id = admin_save_team.manager_id and t.id is distinct from tid) then
    raise exception 'Ce compte manage déjà une autre équipe' using errcode = '23505';
  end if;

  if tid is null then
    insert into teams (name, manager_id) values (trim(admin_save_team.name), admin_save_team.manager_id) returning teams.id into tid;
  else
    select t.manager_id into old_manager from teams t where t.id = tid;
    if not found then
      raise exception 'Équipe introuvable' using errcode = '22023';
    end if;
    update teams t set name = trim(admin_save_team.name), manager_id = admin_save_team.manager_id where t.id = tid;
    update profiles p set role = 'employee' where p.id = old_manager and old_manager <> admin_save_team.manager_id;
  end if;
  update profiles p set role = 'manager', team_id = tid where p.id = admin_save_team.manager_id;
  return tid;
end $$;

-- Supprime aussi l'historique de l'équipe (réponses, pronostics) ; ses membres restent, sans équipe.
create function admin_delete_team(id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  update profiles p set role = 'employee' where p.id = (select t.manager_id from teams t where t.id = admin_delete_team.id);
  delete from teams t where t.id = admin_delete_team.id;
end $$;

-- Tags -------------------------------------------------------------------------

-- Pas de suppression : les réponses passées gardent les ids de leurs tags.
create function admin_save_tag(id int, label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  clean text := trim(admin_save_tag.label);
begin
  perform private.require_admin();
  if coalesce(clean, '') = '' then
    raise exception 'Le libellé est obligatoire' using errcode = '22023';
  end if;
  if exists (select 1 from tags g where lower(g.label) = lower(clean) and g.id is distinct from admin_save_tag.id) then
    raise exception 'Ce tag existe déjà' using errcode = '23505';
  end if;
  if admin_save_tag.id is null then
    insert into tags (id, label) select coalesce(max(g.id), 0) + 1, clean from tags g;
  else
    update tags g set label = clean where g.id = admin_save_tag.id;
    if not found then
      raise exception 'Tag introuvable' using errcode = '22023';
    end if;
  end if;
end $$;

revoke execute on function admin_dashboard, admin_create_user, admin_update_user, admin_delete_user,
  admin_save_team, admin_delete_team, admin_save_tag from public, anon;
grant execute on function admin_dashboard, admin_create_user, admin_update_user, admin_delete_user,
  admin_save_team, admin_delete_team, admin_save_tag to authenticated;
