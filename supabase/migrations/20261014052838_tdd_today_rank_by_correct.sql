do $$ declare src text;
begin
  src := pg_get_functiondef('public.tdd_team(text,text)'::regprocedure);
  src := replace(src, 'else rank() over (order by s.pts desc, s.ok desc, s.first_at asc nulls last) end', 'when p_scope = ''hoy'' then rank() over (order by s.ok desc, s.pts desc, s.first_at asc nulls last) else rank() over (order by s.pts desc, s.ok desc, s.first_at asc nulls last) end');
  if src not like '%when p_scope = ''hoy''%' then raise exception 'patch tdd_team failed'; end if;
  execute src;
  src := pg_get_functiondef('tdd.finalize()'::regprocedure);
  src := replace(src, 'select p.user_id, sum(p.points)::int pts,', 'select p.user_id, sum(p.points)::int pts, (select count(*) from tdd.attempts a where a.user_id=p.user_id and a.day=r.day and a.correct) ok,');
  src := replace(src, 'where s.pts > 0 order by s.pts desc, s.first_at', 'where s.pts > 0 order by s.ok desc, s.pts desc, s.first_at');
  if src not like '%s.ok desc, s.pts desc%' then raise exception 'patch finalize failed'; end if;
  execute src;
end $$;;
