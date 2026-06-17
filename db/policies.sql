-- =====================================================================
-- ROW LEVEL SECURITY  --  the core of the demo
-- =====================================================================
-- The Next.js server connects as role `app_client` and, per request, runs:
--     SET LOCAL app.user_id    = '<id>';
--     SET LOCAL app.role       = '<teacher|minister|admin>';
--     SET LOCAL app.country_id = '<id>';
-- Policies below read those via current_setting(..., true) -- the `true`
-- makes a missing setting return NULL instead of erroring (e.g. unauth'd).
--
-- FORCE makes RLS apply even to the table owner; app_client is not the
-- owner anyway, but FORCE keeps the demo honest if you connect as owner.
-- =====================================================================

-- Helper expressions repeated below:
--   role        = current_setting('app.role', true)
--   uid         = nullif(current_setting('app.user_id', true), '')::int
--   country     = nullif(current_setting('app.country_id', true), '')::int

-- ---- STUDENTS ----
alter table students enable row level security;
alter table students force  row level security;

create policy students_access on students
for all
using (
       current_setting('app.role', true) = 'admin'
    or (current_setting('app.role', true) = 'minister'
        and country_id = nullif(current_setting('app.country_id', true), '')::int
        -- per-user drill-down: when app.can_drill = '0', this minister sees no
        -- individual students at all.
        and current_setting('app.can_drill', true) is distinct from '0'
        -- per-institution drill-down: admin can also switch off a single school
        -- (or a whole level) via schools.can_drill. Aggregate counts still come
        -- via school_stats_by_ids(), a SECURITY DEFINER function.
        and can_drill_school(school_id))
    or (current_setting('app.role', true) = 'teacher'
        and school_id in (
              select us.school_id from user_schools us
              where us.user_id = nullif(current_setting('app.user_id', true), '')::int)
        and can_drill_school(school_id))
);

-- ---- SCHOOLS ----
alter table schools enable row level security;
alter table schools force  row level security;

create policy schools_access on schools
for all
using (
       current_setting('app.role', true) = 'admin'
    or (current_setting('app.role', true) = 'minister'
        and country_id = nullif(current_setting('app.country_id', true), '')::int)
    or (current_setting('app.role', true) = 'teacher'
        and id in (
              select us.school_id from user_schools us
              where us.user_id = nullif(current_setting('app.user_id', true), '')::int))
);

-- ---- INSTITUTIONS  (ministry/territory level: minister + admin only) ----
alter table institutions enable row level security;
alter table institutions force  row level security;

create policy institutions_access on institutions
for all
using (
       current_setting('app.role', true) = 'admin'
    or (current_setting('app.role', true) = 'minister'
        and country_id = nullif(current_setting('app.country_id', true), '')::int)
);

-- ---- COUNTRIES  (everyone authenticated may read their own territory) ----
alter table countries enable row level security;
alter table countries force  row level security;

create policy countries_access on countries
for all
using (
       current_setting('app.role', true) = 'admin'
    or id = nullif(current_setting('app.country_id', true), '')::int
);

-- ---- APP_USERS  (admin manages everyone; others see only themselves) ----
alter table app_users enable row level security;
alter table app_users force  row level security;

create policy app_users_admin on app_users
for all
using (current_setting('app.role', true) = 'admin');

create policy app_users_self on app_users
for select
using (id = nullif(current_setting('app.user_id', true), '')::int);

-- ---- USER_SCHOOLS  (admin manages; teacher reads own mappings) ----
alter table user_schools enable row level security;
alter table user_schools force  row level security;

create policy user_schools_admin on user_schools
for all
using (current_setting('app.role', true) = 'admin');

create policy user_schools_self on user_schools
for select
using (user_id = nullif(current_setting('app.user_id', true), '')::int);
