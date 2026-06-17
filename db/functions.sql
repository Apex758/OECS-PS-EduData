-- =====================================================================
-- IDENTITY FUNCTIONS  --  resolve "who is this" BEFORE setting RLS context
-- =====================================================================
-- These are SECURITY DEFINER: they run as the function OWNER (superuser),
-- so they can read app_users even though app_client's RLS would otherwise
-- block it (chicken/egg: you must know your user_id to set app.user_id).
-- They expose ONLY identity columns, nothing scoped. The app then calls
-- SET LOCAL app.user_id/role/country_id and every other query is RLS-bound.
-- =====================================================================

-- Drop first: create-or-replace cannot CHANGE a function's return type, and
-- these signatures grew a column (can_drill_students). Safe + idempotent.
drop function if exists resolve_user_by_email(text);
drop function if exists resolve_user_by_id(int);
drop function if exists list_demo_personas();
drop function if exists school_student_stats(int);
drop function if exists can_drill_school(int);
drop function if exists school_stats_by_ids(int[]);

-- Look up the logged-in identity by Google email (used after SSO).
create or replace function resolve_user_by_email(p_email text)
returns table(id int, email text, name text, role text, country_id int, can_drill_students boolean)
language sql security definer set search_path = public as $$
  select id, email, name, role, country_id, can_drill_students
  from app_users where lower(email) = lower(p_email);
$$;

-- Look up a persona by id (used by the DEMO "view as" toggle).
create or replace function resolve_user_by_id(p_id int)
returns table(id int, email text, name text, role text, country_id int, can_drill_students boolean)
language sql security definer set search_path = public as $$
  select id, email, name, role, country_id, can_drill_students from app_users where id = p_id;
$$;

-- List demo personas for the toggle dropdown (is_demo only).
create or replace function list_demo_personas()
returns table(id int, email text, name text, role text, country_id int, can_drill_students boolean)
language sql security definer set search_path = public as $$
  select id, email, name, role, country_id, can_drill_students
  from app_users where is_demo order by role, email;
$$;

-- Per-school student counts for a territory, IGNORING RLS. Lets a minister
-- whose drill-down is OFF still see aggregate counts (students hidden, totals
-- shown). SECURITY DEFINER so it bypasses the students RLS policy; exposes
-- only counts, never individual rows.
create or replace function school_student_stats(p_country_id int)
returns table(school_id int, code text, name text, level text,
              students bigint, male bigint, female bigint)
language sql security definer set search_path = public as $$
  select sc.id, sc.code, sc.name, sc.level,
         count(s.id) as students,
         count(*) filter (where s.gender = 'M') as male,
         count(*) filter (where s.gender = 'F') as female
    from schools sc
    left join students s on s.school_id = sc.id
   where sc.country_id = p_country_id
   group by sc.id, sc.code, sc.name, sc.level
   order by sc.code;
$$;

-- Per-school drill-down flag, IGNORING RLS. Used inside the students policy so
-- a minister/teacher only sees individual rows when the admin left can_drill on
-- for that school. SECURITY DEFINER so the policy can read schools.can_drill
-- without recursing through the schools RLS policy. Missing school -> allow.
create or replace function can_drill_school(p_school_id int)
returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select can_drill from schools where id = p_school_id), true);
$$;

-- True per-school student counts for an explicit set of school ids, IGNORING
-- RLS. Lets the hierarchy show aggregate totals for schools whose drill-down is
-- off (individual rows hidden by RLS, counts still shown). Returns ONLY counts,
-- never identifying columns. Callers pass ids the user can already see.
create or replace function school_stats_by_ids(p_ids int[])
returns table(school_id int, students bigint, male bigint, female bigint)
language sql security definer set search_path = public stable as $$
  select sc.id,
         count(s.id) as students,
         count(*) filter (where s.gender = 'M') as male,
         count(*) filter (where s.gender = 'F') as female
    from schools sc
    left join students s on s.school_id = sc.id
   where sc.id = any(p_ids)
   group by sc.id;
$$;

-- Lock down: not callable by the world, only by the app role.
revoke all on function resolve_user_by_email(text) from public;
revoke all on function resolve_user_by_id(int)      from public;
revoke all on function list_demo_personas()         from public;
revoke all on function school_student_stats(int)    from public;
revoke all on function can_drill_school(int)        from public;
revoke all on function school_stats_by_ids(int[])   from public;
grant execute on function resolve_user_by_email(text) to app_client;
grant execute on function resolve_user_by_id(int)      to app_client;
grant execute on function list_demo_personas()         to app_client;
grant execute on function school_student_stats(int)    to app_client;
grant execute on function can_drill_school(int)        to app_client;
grant execute on function school_stats_by_ids(int[])   to app_client;
