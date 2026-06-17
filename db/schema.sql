-- =====================================================================
-- SCHEMA  --  territory -> schools -> students  +  users / access
-- =====================================================================
-- Hierarchy:
--   countries (territory)
--      institutions   (one ministry per territory -- minister anchors here)
--      schools        (belong to a territory; minister sees ALL in territory)
--         students    (belong to a school; teacher sees only their school's)
--
-- Access:
--   app_users     -- one row per real login (matched by Google email)
--   user_schools  -- teacher <-> many schools
--
-- RLS is defined separately in policies.sql and enforced via per-request
-- session vars (app.user_id / app.role / app.country_id).
-- =====================================================================

drop table if exists user_schools cascade;
drop table if exists app_users   cascade;
drop table if exists students    cascade;
drop table if exists schools     cascade;
drop table if exists institutions cascade;
drop table if exists countries   cascade;

create table countries (
  id        serial primary key,
  iso_code  text unique not null,
  name      text not null
);

create table institutions (
  id          serial primary key,
  country_id  int not null references countries(id),
  name        text not null,
  type        text not null default 'ministry'
);

create table schools (
  id              serial primary key,
  country_id      int not null references countries(id),
  institution_id  int references institutions(id),
  code            text unique not null,
  name            text not null,
  level           text,                      -- primary | secondary | tertiary
  can_drill       boolean not null default true  -- admin toggle: may minister/teacher see individual students here? false = aggregate counts only
);

create table students (
  id          serial primary key,
  ruli        text unique not null,          -- CSPRNG code (from lib/ruli.js)
  school_id   int not null references schools(id),
  country_id  int not null references countries(id),
  class       text,                           -- section within a school (e.g. 'Grade 4', 'Form 5')
  gender      text,
  age         int,
  metadata    jsonb,                          -- salt/hash/createdAt etc.
  is_demo     boolean not null default true,  -- UI labels demo rows
  created_at  timestamptz not null default now()
);

create table app_users (
  id          serial primary key,
  email       text unique not null,           -- matched against Google identity
  name        text,
  role        text not null check (role in ('teacher','minister','admin')),
  country_id  int references countries(id),    -- minister/teacher territory
  can_drill_students boolean not null default true,  -- minister: drill to individual students? (false = aggregate counts only)
  is_demo     boolean not null default false,  -- demo "view as" personas
  created_at  timestamptz not null default now()
);

create table user_schools (
  user_id    int not null references app_users(id) on delete cascade,
  school_id  int not null references schools(id)   on delete cascade,
  primary key (user_id, school_id)
);

-- Indexes for the RLS filter columns.
create index on students(school_id);
create index on students(school_id, class);
create index on students(country_id);
create index on schools(country_id);
create index on user_schools(user_id);

-- ---------------------------------------------------------------------
-- Grants for the app role used by the Next.js server. The role itself
-- (app_client) is created by db/setup.ps1 with the password from
-- .env.local BEFORE this file runs -- it is NOT a superuser and NOT the
-- table owner, so FORCE ROW LEVEL SECURITY in policies.sql applies to it.
-- ---------------------------------------------------------------------
grant usage on schema public to app_client;
grant select, insert, update, delete on all tables in schema public to app_client;
grant usage, select on all sequences in schema public to app_client;
