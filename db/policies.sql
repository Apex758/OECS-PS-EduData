-- =====================================================================
-- ROW LEVEL SECURITY  --  the core of the demo (Supabase JWT model)
-- =====================================================================
-- End users reach Postgres through PostgREST as the `authenticated` role,
-- carrying a JWT (real users: Auth0 via Supabase third-party auth; demo
-- personas: a short-lived JWT the server mints, both with an `email` claim).
-- app_current_user() (functions.sql) resolves that email -> the app_users
-- row, so every policy below scopes by the caller's role / country / school.
--
-- `service_role` (server-trusted ingest/admin/cron) has BYPASSRLS and is not
-- subject to any of this. FORCE ROW LEVEL SECURITY keeps the demo honest even
-- if you connect as the table owner.
--
-- NOTE: app_current_user() is STABLE + SECURITY DEFINER, so referencing it
-- once per row is fine; Postgres caches it within a statement.
-- =====================================================================

-- ---- STUDENTS ----
alter table students enable row level security;
alter table students force  row level security;

drop policy if exists students_access on students;
create policy students_access on students
for all
to authenticated
using (
       (select role from app_current_user()) = 'admin'
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user())
       -- per-user drill-down: minister with can_drill_students = false sees
       -- no individual students at all (aggregate counts still come via the
       -- SECURITY DEFINER stat functions).
       and coalesce((select can_drill_students from app_current_user()), true)
       -- per-institution drill-down: admin can switch off a single school.
       and can_drill_school(school_id))
    or (   (select role from app_current_user()) = 'teacher'
       and school_id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user()))
       and can_drill_school(school_id))
);

-- ---- SCHOOLS ----
alter table schools enable row level security;
alter table schools force  row level security;

drop policy if exists schools_access on schools;
create policy schools_access on schools
for all
to authenticated
using (
       (select role from app_current_user()) = 'admin'
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user()))
    or (   (select role from app_current_user()) = 'teacher'
       and id in (
             select us.school_id from user_schools us
             where us.user_id = (select id from app_current_user())))
);

-- ---- INSTITUTIONS  (ministry/territory level: minister + admin only) ----
alter table institutions enable row level security;
alter table institutions force  row level security;

drop policy if exists institutions_access on institutions;
create policy institutions_access on institutions
for all
to authenticated
using (
       (select role from app_current_user()) = 'admin'
    or (   (select role from app_current_user()) = 'minister'
       and country_id = (select country_id from app_current_user()))
);

-- ---- COUNTRIES  (everyone authenticated may read their own territory) ----
alter table countries enable row level security;
alter table countries force  row level security;

drop policy if exists countries_access on countries;
create policy countries_access on countries
for all
to authenticated
using (
       (select role from app_current_user()) = 'admin'
    or id = (select country_id from app_current_user())
);

-- ---- APP_USERS  (others see only themselves; admin via service_role) ----
-- Admin user management runs server-side under service_role (BYPASSRLS), so
-- no admin policy is needed here. A signed-in user may read only their own row.
alter table app_users enable row level security;
alter table app_users force  row level security;

drop policy if exists app_users_admin on app_users;
drop policy if exists app_users_self  on app_users;
create policy app_users_self on app_users
for select
to authenticated
using (id = (select id from app_current_user()));

-- ---- USER_SCHOOLS  (teacher reads own mappings; admin via service_role) ----
alter table user_schools enable row level security;
alter table user_schools force  row level security;

drop policy if exists user_schools_admin on user_schools;
drop policy if exists user_schools_self  on user_schools;
create policy user_schools_self on user_schools
for select
to authenticated
using (user_id = (select id from app_current_user()));
