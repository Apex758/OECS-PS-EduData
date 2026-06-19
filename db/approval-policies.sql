-- =====================================================================
-- APPROVAL RLS  (run AFTER approval.sql + approval-rpc.sql)
-- =====================================================================

-- Helper: submission visible to OECS (approved or legacy null submission_id).
create or replace function submission_oecs_visible(p_submission_id int)
returns boolean
language sql security definer set search_path = public stable as $$
  select p_submission_id is null
      or exists (
        select 1 from submissions s
        where s.id = p_submission_id and s.status = 'approved'
      );
$$;

-- ---- SUBMISSIONS ----
alter table submissions enable row level security;
alter table submissions force row level security;
drop policy if exists submissions_access on submissions;
create policy submissions_access on submissions
for all to authenticated
using (
       (   (select role from app_current_user()) = 'admin'
       and status = 'approved')
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user()))
    or (   (select role from app_current_user()) = 'teacher'
       and school_id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user())))
);

-- ---- AGGREGATIONS ----
alter table aggregations enable row level security;
alter table aggregations force row level security;
drop policy if exists aggregations_access on aggregations;
create policy aggregations_access on aggregations
for all to authenticated
using (
       (select role from app_current_user()) = 'admin'
       and exists (
         select 1 from submissions s
         where s.id = submission_id and s.status = 'approved'
       )
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user())
       and exists (select 1 from approvals a where a.aggregation_id = aggregations.id and a.l1 = true))
    or (   (select role from app_current_user()) = 'teacher'
       and school_id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user())))
);

-- ---- APPROVALS ----
alter table approvals enable row level security;
alter table approvals force row level security;
drop policy if exists approvals_access on approvals;
create policy approvals_access on approvals
for all to authenticated
using (
  exists (
    select 1 from aggregations g
    join submissions s on s.id = g.submission_id
    where g.id = aggregation_id
      and (
           (select role from app_current_user()) = 'admin'
        or (   (select role from app_current_user()) = 'minister'
           and g.country_id = (select country_id from app_current_user()))
        or (   (select role from app_current_user()) = 'teacher'
           and g.school_id in (
                 select us.school_id from user_schools us
                 where us.user_id = (select id from app_current_user())))
      )
  )
);

-- ---- APPROVAL CONFIG (admin read; service_role write via seed) ----
alter table approval_config enable row level security;
alter table approval_config force row level security;
drop policy if exists approval_config_read on approval_config;
create policy approval_config_read on approval_config
for select to authenticated
using (true);

-- ---- STAFF: teachers/ministers see own scope (any status); admin approved only ----
drop policy if exists staff_access on staff;
create policy staff_access on staff
for all to authenticated
using (
       (select role from app_current_user()) = 'teacher'
       and school_id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user()))
       and can_drill_school(school_id)
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user())
       and coalesce((select can_drill_students from app_current_user()), true)
       and can_drill_school(school_id))
    or (   (select role from app_current_user()) = 'admin'
       and submission_oecs_visible(submission_id))
);

drop policy if exists enrolment_access on enrolment;
create policy enrolment_access on enrolment
for all to authenticated
using (
       (select role from app_current_user()) = 'teacher'
       and school_id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user()))
       and can_drill_school(school_id)
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user())
       and can_drill_school(school_id))
    or (   (select role from app_current_user()) = 'admin'
       and submission_oecs_visible(submission_id))
);

revoke all on function submission_oecs_visible(int) from public;
grant execute on function submission_oecs_visible(int) to authenticated, service_role;

-- Update stat functions to count approved submissions only (legacy rows included).
drop function if exists staff_stats_by_ids(int[]);
create or replace function staff_stats_by_ids(p_ids int[])
returns table(school_id int, staff bigint, male bigint, female bigint,
              min_qualified bigint, with_cpd bigint, left_service bigint)
language sql security definer set search_path = public stable as $$
  select sc.id,
         count(s.id)                                                          as staff,
         count(*) filter (where s.sex = 'M')                                  as male,
         count(*) filter (where s.sex = 'F')                                  as female,
         count(*) filter (where s.highest_qualification in ('BACH','PGD','MAST','PHD')) as min_qualified,
         count(*) filter (where coalesce(s.cpd_hours,0) > 0)                  as with_cpd,
         count(*) filter (where s.left_service = 'Y')                         as left_service
    from schools sc
    left join staff s on s.school_id = sc.id
                     and submission_oecs_visible(s.submission_id)
   where sc.id = any(p_ids)
   group by sc.id;
$$;

drop function if exists school_stats_by_ids(int[]);
create or replace function school_stats_by_ids(p_ids int[])
returns table(school_id int, students bigint, male bigint, female bigint)
language sql security definer set search_path = public stable as $$
  select sc.id,
         count(st.id) as students,
         count(*) filter (where st.gender = 'M') as male,
         count(*) filter (where st.gender = 'F') as female
    from schools sc
    left join students st on st.school_id = sc.id
   where sc.id = any(p_ids)
   group by sc.id;
$$;

revoke all on function staff_stats_by_ids(int[]) from public;
revoke all on function school_stats_by_ids(int[]) from public;
grant execute on function staff_stats_by_ids(int[]) to authenticated, service_role;
grant execute on function school_stats_by_ids(int[]) to authenticated, service_role;
