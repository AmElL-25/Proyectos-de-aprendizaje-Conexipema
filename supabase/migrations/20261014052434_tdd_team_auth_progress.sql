create schema if not exists tdd;
revoke all on schema tdd from public, anon, authenticated;

create table tdd.users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  pass_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index users_username_ci on tdd.users (lower(username));

create table tdd.sessions (
  token_hash text primary key,
  user_id uuid not null references tdd.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index on tdd.sessions(user_id);

create table tdd.term_progress (
  user_id uuid not null references tdd.users(id) on delete cascade,
  term_id text not null,
  seen_at timestamptz,
  learned_at timestamptz,
  answered int not null default 0,
  correct int not null default 0,
  primary key (user_id, term_id)
);

create table tdd.practice_days (
  user_id uuid not null references tdd.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

alter table tdd.users enable row level security;
alter table tdd.sessions enable row level security;
alter table tdd.term_progress enable row level security;
alter table tdd.practice_days enable row level security;

-- Día de juego (Lima, cambia a las 7:55 a.m.)
create or replace function tdd.game_day(ts timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select ((ts at time zone 'America/Lima') - interval '7 hours 55 minutes')::date $$;

create or replace function tdd.streak(p_user uuid) returns int
language plpgsql stable set search_path = '' as $$
declare d date := tdd.game_day(); n int := 0;
begin
  if not exists (select 1 from tdd.practice_days where user_id = p_user and day = d) then d := d - 1; end if;
  while exists (select 1 from tdd.practice_days where user_id = p_user and day = d) loop n := n + 1; d := d - 1; end loop;
  return n;
end $$;

create or replace function tdd.new_session(p_user uuid) returns text
language plpgsql set search_path = '' as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from tdd.sessions where expires_at < now();
  insert into tdd.sessions(token_hash, user_id) values (encode(extensions.digest(t, 'sha256'), 'hex'), p_user);
  return t;
end $$;

create or replace function tdd.auth(p_token text) returns uuid
language plpgsql stable set search_path = '' as $$
declare u uuid;
begin
  select user_id into u from tdd.sessions where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') and expires_at > now();
  if u is null then raise exception 'Sesión inválida o vencida' using errcode = '28000'; end if;
  return u;
end $$;

create or replace function tdd.progress_json(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'username', u.username, 'is_admin', u.is_admin,
    'seen', coalesce((select jsonb_agg(term_id) from tdd.term_progress where user_id = u.id and seen_at is not null), '[]'),
    'correct', coalesce((select jsonb_agg(term_id) from tdd.term_progress where user_id = u.id and learned_at is not null), '[]'),
    'answered', coalesce((select jsonb_object_agg(term_id, answered) from tdd.term_progress where user_id = u.id and answered > 0), '{}'),
    'days', coalesce((select jsonb_agg(to_char(day,'YYYY-MM-DD') order by day) from tdd.practice_days where user_id = u.id), '[]'),
    'streak', tdd.streak(u.id),
    'today', to_char(tdd.game_day(),'YYYY-MM-DD'))
  from tdd.users u where u.id = p_user $$;

-- ===== API pública (RPC) =====
create or replace function public.tdd_register(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; uname text := btrim(p_username);
begin
  if uname !~ '^[A-Za-z0-9._-]{3,30}$' then raise exception 'Usuario inválido: 3 a 30 caracteres (letras, números, punto, guion o guion bajo)' using errcode='22023'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres' using errcode='22023'; end if;
  if exists (select 1 from tdd.users where lower(username) = lower(uname)) then raise exception 'Ese usuario ya existe' using errcode='23505'; end if;
  insert into tdd.users(username, pass_hash) values (uname, extensions.crypt(p_password, extensions.gen_salt('bf', 10))) returning id into u;
  return jsonb_build_object('token', tdd.new_session(u)) || tdd.progress_json(u);
end $$;

create or replace function public.tdd_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select id, pass_hash into r from tdd.users where lower(username) = lower(btrim(p_username));
  if r.id is null or r.pass_hash <> extensions.crypt(coalesce(p_password,''), r.pass_hash) then
    perform pg_sleep(0.5);
    raise exception 'Usuario o contraseña incorrectos' using errcode='28P01';
  end if;
  return jsonb_build_object('token', tdd.new_session(r.id)) || tdd.progress_json(r.id);
end $$;

create or replace function public.tdd_logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from tdd.sessions where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex') $$;

create or replace function public.tdd_get_progress(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin return tdd.progress_json(tdd.auth(p_token)); end $$;

-- p_event: 'seen' | 'mc' (opción múltiple, p_correct) | 'reveal' (vio respuesta modelo) | 'self' (autoevaluación, p_correct)
create or replace function public.tdd_record(p_token text, p_term_id text, p_event text, p_correct boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := tdd.auth(p_token);
begin
  if p_term_id !~ '^[a-z]{2,5}[0-9]{1,4}$' then raise exception 'Término inválido' using errcode='22023'; end if;
  if p_event not in ('seen','mc','reveal','self') then raise exception 'Evento inválido' using errcode='22023'; end if;
  insert into tdd.term_progress(user_id, term_id, seen_at) values (u, p_term_id, now())
    on conflict (user_id, term_id) do update set seen_at = coalesce(tdd.term_progress.seen_at, now());
  if p_event = 'mc' then
    update tdd.term_progress set answered = answered + 1,
      correct = correct + case when p_correct then 1 else 0 end,
      learned_at = case when p_correct then coalesce(learned_at, now()) else learned_at end
      where user_id = u and term_id = p_term_id;
  elsif p_event = 'self' and p_correct then
    update tdd.term_progress set learned_at = coalesce(learned_at, now()) where user_id = u and term_id = p_term_id;
  end if;
  if p_event in ('mc','reveal') then
    insert into tdd.practice_days(user_id, day) values (u, tdd.game_day()) on conflict do nothing;
  end if;
  return tdd.progress_json(u);
end $$;

create or replace function public.tdd_leaderboard(p_token text)
returns table(rank int, username text, current_streak int, terms_learned int, correct_answers int, terms_seen int, is_me boolean)
language plpgsql security definer set search_path = '' as $$
declare me uuid := tdd.auth(p_token);
begin
  return query
  with s as (
    select u.id, u.username, tdd.streak(u.id) as st,
      (select count(*) from tdd.term_progress p where p.user_id = u.id and p.learned_at is not null)::int as learned,
      (select coalesce(sum(p.correct),0) from tdd.term_progress p where p.user_id = u.id)::int as ok,
      (select count(*) from tdd.term_progress p where p.user_id = u.id and p.seen_at is not null)::int as seen
    from tdd.users u)
  select (rank() over (order by s.st desc, s.learned desc, s.ok desc))::int, s.username, s.st, s.learned, s.ok, s.seen, s.id = me
  from s order by 1, lower(s.username);
end $$;

create or replace function public.tdd_change_password(p_token text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := tdd.auth(p_token); h text;
begin
  select pass_hash into h from tdd.users where id = u;
  if h <> extensions.crypt(coalesce(p_old,''), h) then raise exception 'La contraseña actual no es correcta' using errcode='28P01'; end if;
  if length(coalesce(p_new,'')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres' using errcode='22023'; end if;
  update tdd.users set pass_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = u;
  delete from tdd.sessions where user_id = u and token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
end $$;

create or replace function public.tdd_admin_reset_password(p_token text, p_username text, p_new_password text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := tdd.auth(p_token); target uuid;
begin
  if not exists (select 1 from tdd.users where id = me and is_admin) then raise exception 'Solo un administrador puede hacer esto' using errcode='42501'; end if;
  if length(coalesce(p_new_password,'')) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres' using errcode='22023'; end if;
  select id into target from tdd.users where lower(username) = lower(btrim(p_username));
  if target is null then raise exception 'Usuario no encontrado' using errcode='P0002'; end if;
  update tdd.users set pass_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)) where id = target;
  delete from tdd.sessions where user_id = target;
end $$;

do $$ declare f text; begin
  foreach f in array array['tdd_register(text,text)','tdd_login(text,text)','tdd_logout(text)','tdd_get_progress(text)','tdd_record(text,text,text,boolean)','tdd_leaderboard(text)','tdd_change_password(text,text,text)','tdd_admin_reset_password(text,text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
revoke all on all functions in schema tdd from public;;
