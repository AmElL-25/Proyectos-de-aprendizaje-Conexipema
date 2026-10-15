-- Avatar elegido por el usuario. Evoluciona en el cliente según el nivel (puntos).
alter table tdd.users add column if not exists avatar text not null default 'spark';
alter table tdd.users drop constraint if exists users_avatar_chk;
alter table tdd.users add constraint users_avatar_chk
  check (avatar in ('spark','byte','luna','nimbus','pico','oro','kiwi','nova'));

create or replace function tdd.avatar_ok(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := lower(btrim(coalesce(p, '')));
begin
  if v = '' then return 'spark'; end if;
  if v not in ('spark','byte','luna','nimbus','pico','oro','kiwi','nova') then
    raise exception 'Avatar inválido' using errcode = '22023';
  end if;
  return v;
end $$;

create or replace function tdd.progress_json(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'username', u.username, 'is_admin', u.is_admin,
    'avatar', coalesce(u.avatar, 'spark'),
    'seen', coalesce((select jsonb_agg(term_id) from tdd.term_progress where user_id = u.id and seen_at is not null), '[]'),
    'correct', coalesce((select jsonb_agg(term_id) from tdd.term_progress where user_id = u.id and learned_at is not null), '[]'),
    'answered', coalesce((select jsonb_object_agg(term_id, answered) from tdd.term_progress where user_id = u.id and answered > 0), '{}'),
    'days', coalesce((select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) from tdd.practice_days where user_id = u.id), '[]'),
    'streak', tdd.streak(u.id),
    'today', to_char(tdd.game_day(),'YYYY-MM-DD'),
    'points', tdd.total_points(u.id),
    'points_today', (select coalesce(sum(points),0) from tdd.points where user_id = u.id and day = tdd.game_day()),
    'level', tdd.level_for(tdd.total_points(u.id)),
    'scored_today', (select jsonb_build_object('term_id', term_id, 'correct', correct) from tdd.attempts where user_id = u.id and day = tdd.game_day()),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name, 'description', b.description, 'icon', b.icon,
        'period', ub.period, 'earned_at', ub.earned_at, 'new', not ub.notified) order by ub.earned_at desc)
      from tdd.user_badges ub join tdd.badges b using (code) where ub.user_id = u.id), '[]'))
  from tdd.users u where u.id = p_user $$;

drop function if exists public.tdd_register(text, text);

create or replace function public.tdd_register(p_username text, p_password text, p_avatar text default 'spark') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; uname text := btrim(p_username); av text;
begin
  if uname !~ '^[A-Za-z0-9._-]{3,30}$' then raise exception 'Usuario inválido: 3 a 30 caracteres (letras, números, punto, guion o guion bajo)' using errcode='22023'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres' using errcode='22023'; end if;
  if exists (select 1 from tdd.users where lower(username) = lower(uname)) then raise exception 'Ese usuario ya existe' using errcode='23505'; end if;
  av := tdd.avatar_ok(p_avatar);
  insert into tdd.users(username, pass_hash, avatar) values (uname, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), av) returning id into u;
  return jsonb_build_object('token', tdd.new_session(u)) || tdd.progress_json(u);
end $$;

create or replace function public.tdd_set_avatar(p_token text, p_avatar text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := tdd.auth(p_token); av text := tdd.avatar_ok(p_avatar);
begin
  update tdd.users set avatar = av where id = u;
  return tdd.progress_json(u);
end $$;

create or replace function public.tdd_team(p_token text, p_scope text default 'hoy') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := tdd.auth(p_token); d date := tdd.game_day(); f date; t date; res jsonb;
begin
  if p_scope not in ('hoy','semana','mes','racha') then raise exception 'Alcance inválido' using errcode='22023'; end if;
  perform tdd.finalize();
  f := case p_scope when 'hoy' then d when 'semana' then date_trunc('week', d)::date when 'mes' then date_trunc('month', d)::date else date '2000-01-01' end;
  t := d;
  with s as (
    select u.id, u.username, coalesce(u.avatar, 'spark') avatar,
      (select coalesce(sum(p.points),0) from tdd.points p where p.user_id=u.id and p.day between f and t)::int pts,
      (select count(*) from tdd.attempts a where a.user_id=u.id and a.correct and a.day between f and t)::int ok,
      (select min(a.answered_at) from tdd.attempts a where a.user_id=u.id and a.correct and a.day between f and t) first_at,
      tdd.streak(u.id) st, tdd.total_points(u.id) total
    from tdd.users u),
  o as (
    select s.*, case
      when p_scope = 'racha' then rank() over (order by s.st desc, s.total desc)
      when p_scope = 'hoy' then rank() over (order by s.ok desc, s.pts desc, s.first_at asc nulls last)
      else rank() over (order by s.pts desc, s.ok desc, s.first_at asc nulls last) end rk from s)
  select coalesce(jsonb_agg(jsonb_build_object('rank', rk, 'username', username, 'avatar', avatar, 'points', pts, 'correct', ok, 'streak', st,
      'first_at', first_at, 'total_points', total, 'level', tdd.level_for(total)->>'name', 'is_me', id = me) order by rk, lower(username)), '[]')
    into res from o
  where p_scope = 'racha' or pts > 0 or id = me;
  return jsonb_build_object('scope', p_scope, 'from', f, 'ranking', res,
    'prizes', coalesce((select jsonb_object_agg(period_type, title) from tdd.prizes), '{}'),
    'champions', coalesce((select jsonb_agg(jsonb_build_object('type', c.period_type, 'start', c.period_start, 'username', u.username, 'avatar', coalesce(u.avatar,'spark'), 'points', c.points)
        order by c.period_start desc, c.period_type) from (select * from tdd.champions order by period_start desc limit 30) c join tdd.users u on u.id=c.user_id), '[]'));
end $$;

do $$ declare f text; begin
  foreach f in array array['tdd_register(text,text,text)','tdd_set_avatar(text,text)','tdd_team(text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
revoke all on all functions in schema tdd from public;
