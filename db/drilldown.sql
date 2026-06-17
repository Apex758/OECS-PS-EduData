-- =====================================================================
-- MIGRATION  --  per-institution / per-level drill-down toggle
-- =====================================================================
-- Adds schools.can_drill (admin switch: may minister/teacher see individual
-- students for this school?) and rewires the students RLS policy + helper
-- functions to honor it. Idempotent: safe to run on an existing student_demo.
--
--   psql "$DATABASE_URL" -f db/drilldown.sql
--
-- Fresh setups already include all of this via schema.sql / functions.sql /
-- policies.sql; this file is only for upgrading a DB seeded before the toggle.
-- =====================================================================

alter table schools add column if not exists can_drill boolean not null default true;

-- ---- helper: per-school drill flag (bypasses RLS so the policy can read it) ----
create or replace function can_drill_school(p_school_id int)
returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select can_drill from schools where id = p_school_id), true);
$$;

-- ---- helper: true per-school counts for an explicit id set (counts only) ----
drop function if exists school_stats_by_ids(int[]);
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

revoke all on function can_drill_school(int)      from public;
revoke all on function school_stats_by_ids(int[]) from public;
grant execute on function can_drill_school(int)      to authenticated, service_role;
grant execute on function school_stats_by_ids(int[]) to authenticated, service_role;

-- ---- rewrite the students policy to gate non-admins by the school flag ----
-- Supabase JWT model: scope comes from app_current_user() (see functions.sql),
-- not SET LOCAL app.* GUCs. Mirrors db/policies.sql.
drop policy if exists students_access on students;
create policy students_access on students
for all
to authenticated
using (
       (select role from app_current_user()) = 'admin'
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user())
       and coalesce((select can_drill_students from app_current_user()), true)
       and can_drill_school(school_id))
    or (   (select role from app_current_user()) = 'teacher'
       and school_id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user()))
       and can_drill_school(school_id))
);
