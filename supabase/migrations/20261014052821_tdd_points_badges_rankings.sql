-- Intentos puntuados: 1 por usuario por día, y cada término solo puntúa una vez por usuario
create table tdd.attempts (
  user_id uuid not null references tdd.users(id) on delete cascade,
  day date not null,
  term_id text not null,
  correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, day),
  unique (user_id, term_id)
);
create table tdd.points (
  id bigint generated always as identity primary key,
  user_id uuid not null references tdd.users(id) on delete cascade,
  day date not null,
  reason text not null,
  points int not null,
  created_at timestamptz not null default now(),
  unique (user_id, day, reason)
);
create index on tdd.points(day);
create table tdd.badges (code text primary key, name text not null, description text not null, icon text not null, sort int not null default 0);
create table tdd.user_badges (
  user_id uuid not null references tdd.users(id) on delete cascade,
  code text not null references tdd.badges(code),
  period text not null default '',
  earned_at timestamptz not null default now(),
  notified boolean not null default false,
  primary key (user_id, code, period)
);
create table tdd.champions (
  period_type text not null check (period_type in ('day','week','month')),
  period_start date not null,
  user_id uuid not null references tdd.users(id) on delete cascade,
  points int not null,
  primary key (period_type, period_start)
);
create table tdd.prizes (
  period_type text primary key check (period_type in ('day','week','month')),
  title text not null,
  updated_at timestamptz not null default now()
);
alter table tdd.attempts enable row level security;
alter table tdd.points enable row level security;
alter table tdd.badges enable row level security;
alter table tdd.user_badges enable row level security;
alter table tdd.champions enable row level security;
alter table tdd.prizes enable row level security;

insert into tdd.badges(code,name,description,icon,sort) values
 ('primer_acierto','Primer acierto','Tu primera respuesta correcta','🌱',1),
 ('racha_3','Racha de 3','3 días seguidos practicando','🔥',2),
 ('racha_7','Racha de 7','Una semana completa sin fallar un día','🔥',3),
 ('racha_30','Racha de 30','30 días seguidos','🌋',4),
 ('racha_100','Racha de 100','100 días seguidos. Leyenda.','💎',5),
 ('aprendidos_10','10 términos','10 términos aprendidos','📘',6),
 ('aprendidos_50','50 términos','50 términos aprendidos','📚',7),
 ('aprendidos_100','100 términos','100 términos aprendidos','🎓',8),
 ('madrugador','Madrugador','5 respuestas correctas antes de las 10:00 a.m.','🌅',9),
 ('campeon_dia','Campeón del día','Primer lugar del ranking de un día','🥇',10),
 ('campeon_semana','Campeón de la semana','Primer lugar de la semana','🏆',11),
 ('campeon_mes','Campeón del mes','Primer lugar del mes','👑',12),
 ('perfecto_semanal','Semana perfecta','7 de 7 respuestas correctas en una semana','⭐',13);

create or replace function tdd.level_for(p int) returns jsonb language sql immutable set search_path = '' as $$
  select case
    when p >= 1500 then jsonb_build_object('n',6,'name','Maestro','min',1500,'next',null)
    when p >= 800 then jsonb_build_object('n',5,'name','Experto','min',800,'next',1500)
    when p >= 400 then jsonb_build_object('n',4,'name','Avanzado','min',400,'next',800)
    when p >= 150 then jsonb_build_object('n',3,'name','Intermedio','min',150,'next',400)
    when p >= 50 then jsonb_build_object('n',2,'name','Aprendiz','min',50,'next',150)
    else jsonb_build_object('n',1,'name','Novato','min',0,'next',50) end $$;

create or replace function tdd.total_points(p_user uuid) returns int language sql stable set search_path = '' as $$
  select coalesce(sum(points),0)::int from tdd.points where user_id = p_user $$;

create or replace function tdd.give(p_user uuid, p_day date, p_reason text, p_pts int) returns int
language plpgsql set search_path = '' as $$
declare n int;
begin
  insert into tdd.points(user_id, day, reason, points) values (p_user, p_day, p_reason, p_pts) on conflict do nothing;
  get diagnostics n = row_count; return case when n > 0 then p_pts else 0 end;
end $$;

create or replace function tdd.badge(p_user uuid, p_code text, p_period text default '') returns void
language sql set search_path = '' as $$
  insert into tdd.user_badges(user_id, code, period) values (p_user, p_code, coalesce(p_period,'')) on conflict do nothing $$;

create or replace function tdd.check_badges(p_user uuid) returns void
language plpgsql set search_path = '' as $$
declare st int := tdd.streak(p_user); learned int; early int;
begin
  select count(*) into learned from tdd.term_progress where user_id = p_user and learned_at is not null;
  select count(*) into early from tdd.points where user_id = p_user and reason = 'temprano';
  if exists (select 1 from tdd.attempts where user_id = p_user and correct) then perform tdd.badge(p_user,'primer_acierto'); end if;
  if st >= 3 then perform tdd.badge(p_user,'racha_3'); end if;
  if st >= 7 then perform tdd.badge(p_user,'racha_7'); end if;
  if st >= 30 then perform tdd.badge(p_user,'racha_30'); end if;
  if st >= 100 then perform tdd.badge(p_user,'racha_100'); end if;
  if learned >= 10 then perform tdd.badge(p_user,'aprendidos_10'); end if;
  if learned >= 50 then perform tdd.badge(p_user,'aprendidos_50'); end if;
  if learned >= 100 then perform tdd.badge(p_user,'aprendidos_100'); end if;
  if early >= 5 then perform tdd.badge(p_user,'madrugador'); end if;
end $$;

-- Cierra períodos terminados: campeones del día/semana/mes y semana perfecta (perezoso, idempotente)
create or replace function tdd.finalize() returns void
language plpgsql set search_path = '' as $$
declare today date := tdd.game_day(); r record;
begin
  -- días
  for r in select distinct p.day from tdd.points p where p.day < today and not exists (select 1 from tdd.champions c where c.period_type='day' and c.period_start=p.day) loop
    insert into tdd.champions(period_type, period_start, user_id, points)
    select 'day', r.day, s.user_id, s.pts from (
      select p.user_id, sum(p.points)::int pts,
        (select a.answered_at from tdd.attempts a where a.user_id=p.user_id and a.day=r.day) first_at
      from tdd.points p where p.day = r.day group by p.user_id) s
    where s.pts > 0 order by s.pts desc, s.first_at asc nulls last limit 1
    on conflict do nothing;
    insert into tdd.user_badges(user_id, code, period) select user_id, 'campeon_dia', r.day::text from tdd.champions where period_type='day' and period_start=r.day on conflict do nothing;
  end loop;
  -- semanas (lunes a domingo)
  for r in select distinct date_trunc('week', p.day)::date ws from tdd.points p where date_trunc('week', p.day)::date + 7 <= today
      and not exists (select 1 from tdd.champions c where c.period_type='week' and c.period_start=date_trunc('week', p.day)::date) loop
    insert into tdd.champions(period_type, period_start, user_id, points)
    select 'week', r.ws, p.user_id, sum(p.points)::int from tdd.points p where p.day >= r.ws and p.day < r.ws + 7
    group by p.user_id having sum(p.points) > 0
    order by sum(p.points) desc, min(p.created_at) asc limit 1 on conflict do nothing;
    insert into tdd.user_badges(user_id, code, period) select user_id, 'campeon_semana', r.ws::text from tdd.champions where period_type='week' and period_start=r.ws on conflict do nothing;
    insert into tdd.user_badges(user_id, code, period)
    select a.user_id, 'perfecto_semanal', r.ws::text from tdd.attempts a where a.day >= r.ws and a.day < r.ws + 7 and a.correct
    group by a.user_id having count(*) = 7 on conflict do nothing;
  end loop;
  -- meses
  for r in select distinct date_trunc('month', p.day)::date ms from tdd.points p where (date_trunc('month', p.day) + interval '1 month')::date <= today
      and not exists (select 1 from tdd.champions c where c.period_type='month' and c.period_start=date_trunc('month', p.day)::date) loop
    insert into tdd.champions(period_type, period_start, user_id, points)
    select 'month', r.ms, p.user_id, sum(p.points)::int from tdd.points p where p.day >= r.ms and p.day < (r.ms + interval '1 month')::date
    group by p.user_id having sum(p.points) > 0
    order by sum(p.points) desc, min(p.created_at) asc limit 1 on conflict do nothing;
    insert into tdd.user_badges(user_id, code, period) select user_id, 'campeon_mes', r.ms::text from tdd.champions where period_type='month' and period_start=r.ms on conflict do nothing;
  end loop;
end $$;

-- Progreso ampliado: puntos, nivel, insignias
create or replace function tdd.progress_json(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'username', u.username, 'is_admin', u.is_admin,
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

-- record con puntuación en servidor
create or replace function public.tdd_record(p_token text, p_term_id text, p_event text, p_correct boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := tdd.auth(p_token); d date := tdd.game_day(); lima time := (now() at time zone 'America/Lima')::time;
  gained int := 0; reasons jsonb := '[]'; scored boolean := false; st int; n int; ms int;
begin
  if p_term_id !~ '^[a-z]{2,5}[0-9]{1,4}$' then raise exception 'Término inválido' using errcode='22023'; end if;
  if p_event not in ('seen','mc','reveal','self') then raise exception 'Evento inválido' using errcode='22023'; end if;
  perform tdd.finalize();
  insert into tdd.term_progress(user_id, term_id, seen_at) values (u, p_term_id, now())
    on conflict (user_id, term_id) do update set seen_at = coalesce(tdd.term_progress.seen_at, now());
  if p_event = 'mc' then
    update tdd.term_progress set answered = answered + 1,
      correct = correct + case when p_correct then 1 else 0 end,
      learned_at = case when p_correct then coalesce(learned_at, now()) else learned_at end
      where user_id = u and term_id = p_term_id;
    -- Único intento puntuado del día (y cada término solo una vez en la vida)
    insert into tdd.attempts(user_id, day, term_id, correct) values (u, d, p_term_id, coalesce(p_correct,false)) on conflict do nothing;
    get diagnostics n = row_count; scored := n > 0;
    if scored and p_correct then
      n := tdd.give(u, d, 'correcta', 10); gained := gained + n; if n > 0 then reasons := reasons || jsonb_build_object('label','Respuesta correcta','points',n); end if;
      if lima >= time '07:55' and lima < time '10:00' then
        n := tdd.give(u, d, 'temprano', 5); gained := gained + n; if n > 0 then reasons := reasons || jsonb_build_object('label','Bono madrugador (antes de 10:00)','points',n); end if;
      end if;
      if not exists (select 1 from tdd.attempts a where a.day = d and a.correct and a.user_id <> u and a.answered_at <= (select answered_at from tdd.attempts where user_id=u and day=d)) then
        n := tdd.give(u, d, 'primero_equipo', 3); gained := gained + n; if n > 0 then reasons := reasons || jsonb_build_object('label','Primero del equipo en acertar hoy','points',n); end if;
      end if;
    end if;
  elsif p_event = 'self' and p_correct then
    update tdd.term_progress set learned_at = coalesce(learned_at, now()) where user_id = u and term_id = p_term_id;
  end if;
  if p_event in ('mc','reveal') then
    insert into tdd.practice_days(user_id, day) values (u, d) on conflict do nothing;
    n := tdd.give(u, d, 'practica', 5); gained := gained + n; if n > 0 then reasons := reasons || jsonb_build_object('label','Práctica del día','points',n); end if;
    st := tdd.streak(u);
    ms := case st when 3 then 10 when 7 then 25 when 14 then 50 when 30 then 100 when 60 then 200 when 100 then 300 else 0 end;
    if ms > 0 then n := tdd.give(u, d, 'racha_' || st, ms); gained := gained + n; if n > 0 then reasons := reasons || jsonb_build_object('label','Bono racha de ' || st || ' días','points',n); end if; end if;
  end if;
  perform tdd.check_badges(u);
  return tdd.progress_json(u) || jsonb_build_object('award', jsonb_build_object('points', gained, 'reasons', reasons, 'scored', scored));
end $$;

create or replace function public.tdd_get_progress(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := tdd.auth(p_token);
begin perform tdd.finalize(); perform tdd.check_badges(u); return tdd.progress_json(u); end $$;

create or replace function public.tdd_ack_badges(p_token text) returns void
language sql security definer set search_path = '' as $$
  update tdd.user_badges set notified = true where user_id = tdd.auth(p_token) and not notified $$;

-- Equipo: ranking por alcance + podio, premios y campeones
create or replace function public.tdd_team(p_token text, p_scope text default 'hoy') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := tdd.auth(p_token); d date := tdd.game_day(); f date; t date; res jsonb;
begin
  if p_scope not in ('hoy','semana','mes','racha') then raise exception 'Alcance inválido' using errcode='22023'; end if;
  perform tdd.finalize();
  f := case p_scope when 'hoy' then d when 'semana' then date_trunc('week', d)::date when 'mes' then date_trunc('month', d)::date else date '2000-01-01' end;
  t := d;
  with s as (
    select u.id, u.username,
      (select coalesce(sum(p.points),0) from tdd.points p where p.user_id=u.id and p.day between f and t)::int pts,
      (select count(*) from tdd.attempts a where a.user_id=u.id and a.correct and a.day between f and t)::int ok,
      (select min(a.answered_at) from tdd.attempts a where a.user_id=u.id and a.correct and a.day between f and t) first_at,
      tdd.streak(u.id) st, tdd.total_points(u.id) total
    from tdd.users u),
  o as (
    select s.*, case when p_scope = 'racha' then rank() over (order by s.st desc, s.total desc)
      else rank() over (order by s.pts desc, s.ok desc, s.first_at asc nulls last) end rk from s)
  select coalesce(jsonb_agg(jsonb_build_object('rank', rk, 'username', username, 'points', pts, 'correct', ok, 'streak', st,
      'first_at', first_at, 'total_points', total, 'level', tdd.level_for(total)->>'name', 'is_me', id = me) order by rk, lower(username)), '[]')
    into res from o
  where p_scope = 'racha' or pts > 0 or id = me;
  return jsonb_build_object('scope', p_scope, 'from', f, 'ranking', res,
    'prizes', coalesce((select jsonb_object_agg(period_type, title) from tdd.prizes), '{}'),
    'champions', coalesce((select jsonb_agg(jsonb_build_object('type', c.period_type, 'start', c.period_start, 'username', u.username, 'points', c.points)
        order by c.period_start desc, c.period_type) from (select * from tdd.champions order by period_start desc limit 30) c join tdd.users u on u.id=c.user_id), '[]'));
end $$;

create or replace function public.tdd_admin_set_prize(p_token text, p_period text, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := tdd.auth(p_token);
begin
  if not exists (select 1 from tdd.users where id = me and is_admin) then raise exception 'Solo un administrador puede hacer esto' using errcode='42501'; end if;
  if p_period not in ('day','week','month') then raise exception 'Período inválido' using errcode='22023'; end if;
  if coalesce(btrim(p_title),'') = '' then delete from tdd.prizes where period_type = p_period;
  else insert into tdd.prizes(period_type, title) values (p_period, left(btrim(p_title),120))
    on conflict (period_type) do update set title = excluded.title, updated_at = now(); end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['tdd_ack_badges(text)','tdd_team(text,text)','tdd_admin_set_prize(text,text,text)','tdd_record(text,text,text,boolean)','tdd_get_progress(text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
revoke all on all functions in schema tdd from public;;
