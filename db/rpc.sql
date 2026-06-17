-- =====================================================================
-- RPC FUNCTIONS  (run AFTER schema.sql + functions.sql + ingest.sql + the
-- value-alias / pending-alias / sheets layers)
-- =====================================================================
-- PostgREST has no multi-statement transactions, so every server-trusted
-- write or aggregate that USED to be a pg transaction in lib/db.js now lives
-- here as ONE atomic function, called via supabase.rpc() with the service_role
-- key. All are SECURITY DEFINER (owned by the migration role) and granted
-- EXECUTE to service_role ONLY -- never to authenticated/anon -- so end users
-- cannot invoke admin/ingest logic through the public API.
-- =====================================================================

-- ---------------------------------------------------------------------
-- internal: insert pre-shaped ingest rows for one school. The caller (the
-- ingest functions below) has already authorized the school and resolved
-- country_id. p_rows is a JSON array of:
--   { ruli, class, gender, age, metadata, identity_hash, salt, sensitive }
-- (lib/db.js shapes these from the ingest pipeline's accepted items.)
-- Idempotent per school via the partial unique index on (school_id,
-- identity_hash); a row that already exists is skipped.
-- ---------------------------------------------------------------------
create or replace function _ingest_insert_rows(p_school_id int, p_country_id int, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r          jsonb;
  v_inserted int := 0;
  v_skipped  int := 0;
begin
  for r in select jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    insert into students (ruli, school_id, country_id, class, gender, age, metadata, identity_hash, is_demo)
    values (
      r->>'ruli', p_school_id, p_country_id,
      r->>'class',
      nullif(r->>'gender', ''),
      nullif(r->>'age', '')::int,
      coalesce(r->'metadata', '{}'::jsonb),
      r->>'identity_hash',
      false
    )
    on conflict (school_id, identity_hash) where identity_hash is not null do nothing;

    if found then
      insert into student_mapping (ruli, school_id, country_id, salt, sensitive)
      values (r->>'ruli', p_school_id, p_country_id, r->>'salt', coalesce(r->'sensitive', '{}'::jsonb));
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

-- ---------------------------------------------------------------------
-- ingest_students  --  authorize by API-key hash, then upsert in one txn.
-- Returns { unauthorized:true } | { ok, school:{id,code,name}, inserted, skipped }
-- ---------------------------------------------------------------------
create or replace function ingest_students(p_key_hash text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_key_id     int;
  v_school_id  int;
  v_country_id int;
  v_code       text;
  v_name       text;
  v_res        jsonb;
begin
  select k.id, s.id, s.country_id, s.code, s.name
    into v_key_id, v_school_id, v_country_id, v_code, v_name
    from school_api_keys k
    join schools s on s.id = k.school_id
   where k.key_hash = p_key_hash and k.revoked = false;

  if not found then
    return jsonb_build_object('unauthorized', true);
  end if;

  v_res := _ingest_insert_rows(v_school_id, v_country_id, p_rows);
  update school_api_keys set last_used_at = now() where id = v_key_id;

  return jsonb_build_object(
    'ok', true,
    'school', jsonb_build_object('id', v_school_id, 'code', v_code, 'name', v_name),
    'inserted', (v_res->>'inserted')::int,
    'skipped',  (v_res->>'skipped')::int
  );
end;
$$;

-- ---------------------------------------------------------------------
-- ingest_students_for_school  --  same upsert for a known school (Sheets cron).
-- Returns { notFound:true } | { ok, school:{...}, inserted, skipped }
-- ---------------------------------------------------------------------
create or replace function ingest_students_for_school(p_school_id int, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_country_id int;
  v_code       text;
  v_name       text;
  v_res        jsonb;
begin
  select country_id, code, name into v_country_id, v_code, v_name
    from schools where id = p_school_id;

  if not found then
    return jsonb_build_object('notFound', true);
  end if;

  v_res := _ingest_insert_rows(p_school_id, v_country_id, p_rows);

  return jsonb_build_object(
    'ok', true,
    'school', jsonb_build_object('id', p_school_id, 'code', v_code, 'name', v_name),
    'inserted', (v_res->>'inserted')::int,
    'skipped',  (v_res->>'skipped')::int
  );
end;
$$;

-- ---------------------------------------------------------------------
-- approve_pending_alias  --  copy a pending suggestion into value_aliases
-- (global/permanent) and mark it approved, atomically.
-- Returns { notFound:true } | { ok:true }
-- ---------------------------------------------------------------------
create or replace function approve_pending_alias(p_id int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_entity text; v_field text; v_variant text; v_canonical text;
begin
  select entity, field, variant, canonical
    into v_entity, v_field, v_variant, v_canonical
    from pending_aliases where id = p_id and status = 'pending';

  if not found then
    return jsonb_build_object('notFound', true);
  end if;

  insert into value_aliases (entity, field, variant, canonical)
  values (v_entity, v_field, v_variant, v_canonical)
  on conflict (entity, field, variant) do update set canonical = excluded.canonical;

  update pending_aliases set status = 'approved' where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- admin_overview  --  schools (+student counts), api keys, sheets. One call.
-- ---------------------------------------------------------------------
create or replace function admin_overview()
returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'schools', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select sc.id, sc.code, sc.name, co.iso_code as country,
               (select count(*) from students st where st.school_id = sc.id) as students
        from schools sc join countries co on co.id = sc.country_id
        order by sc.code) t),
    'keys', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select id, school_id, label, revoked, created_at, last_used_at
        from school_api_keys order by id) t),
    'sheets', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select id, school_id, spreadsheet_id, range_a1, entity, enabled,
               last_synced_at, last_status
        from school_sheets order by id) t)
  );
$$;

-- ---------------------------------------------------------------------
-- list_schools_drill  --  every school with its drill flag + student count.
-- ---------------------------------------------------------------------
create or replace function list_schools_drill()
returns jsonb
language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select sc.id, sc.code, sc.name, sc.level, sc.can_drill,
           co.iso_code as country,
           (select count(*) from students st where st.school_id = sc.id)::int as students
    from schools sc join countries co on co.id = sc.country_id
    order by sc.level nulls last, sc.code) t;
$$;

-- ---------------------------------------------------------------------
-- admin_list_users  --  app_users with country code + assigned school codes.
-- ---------------------------------------------------------------------
create or replace function admin_list_users()
returns jsonb
language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select u.id, u.email, u.name, u.role, u.country_id, u.is_demo,
           u.can_drill_students,
           co.iso_code as country_iso,
           coalesce(
             array_agg(sc.code order by sc.code) filter (where sc.code is not null),
             '{}'
           ) as schools
    from app_users u
    left join countries co on co.id = u.country_id
    left join user_schools us on us.user_id = u.id
    left join schools sc on sc.id = us.school_id
    group by u.id, co.iso_code
    order by u.role, u.email) t;
$$;

-- ---------------------------------------------------------------------
-- admin_upsert_user  --  create/update one user by email and REPLACE their
-- school assignments, atomically. Raises on unknown country_iso/school_code.
-- Returns { id, email }.
-- ---------------------------------------------------------------------
create or replace function admin_upsert_user(
  p_email text, p_name text, p_role text, p_country_iso text,
  p_schools text[], p_can_drill boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cid  int;
  v_uid  int;
  v_code text;
  v_sid  int;
begin
  if p_country_iso is not null and p_country_iso <> '' then
    select id into v_cid from countries where iso_code = upper(p_country_iso);
    if not found then raise exception 'unknown country_iso: %', p_country_iso; end if;
  end if;

  insert into app_users (email, name, role, country_id, can_drill_students, is_demo)
  values (lower(p_email), p_name, lower(p_role), v_cid, coalesce(p_can_drill, true), false)
  on conflict (email) do update
    set name = excluded.name, role = excluded.role,
        country_id = excluded.country_id,
        can_drill_students = excluded.can_drill_students
  returning id into v_uid;

  delete from user_schools where user_id = v_uid;

  if p_schools is not null then
    foreach v_code in array p_schools loop
      if v_code is null or btrim(v_code) = '' then continue; end if;
      select id into v_sid from schools where code = btrim(v_code);
      if not found then raise exception 'unknown school_code: %', v_code; end if;
      insert into user_schools (user_id, school_id) values (v_uid, v_sid)
        on conflict do nothing;
    end loop;
  end if;

  return jsonb_build_object('id', v_uid, 'email', lower(p_email));
end;
$$;

-- ---------------------------------------------------------------------
-- submit_pending_alias  --  uploader submits an alias suggestion. If the
-- mapping is already globally approved it short-circuits; otherwise it upserts
-- the pending row (re-submissions reset it to pending, keeping a prior
-- institution if the new submit omits one).
-- Returns { alreadyApproved:true, status:'approved' } | { id, status }
-- ---------------------------------------------------------------------
create or replace function submit_pending_alias(
  p_entity text, p_field text, p_variant text, p_canonical text,
  p_submitted_by text, p_institution text, p_scope text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id     int;
  v_status text;
begin
  perform 1 from value_aliases
    where entity = p_entity and field = p_field and variant = p_variant limit 1;
  if found then
    return jsonb_build_object('alreadyApproved', true, 'status', 'approved');
  end if;

  insert into pending_aliases (entity, field, variant, canonical, submitted_by, institution, scope)
  values (p_entity, p_field, p_variant, p_canonical, p_submitted_by, p_institution,
          coalesce(p_scope, 'institution'))
  on conflict (entity, field, variant, submitted_by) do update
    set canonical    = excluded.canonical,
        institution  = coalesce(excluded.institution, pending_aliases.institution),
        scope        = excluded.scope,
        status       = 'pending',
        submitted_at = now()
  returning id, status into v_id, v_status;

  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------------
-- Lock down: server-trusted only.
-- ---------------------------------------------------------------------
revoke all on function _ingest_insert_rows(int, int, jsonb)              from public;
revoke all on function ingest_students(text, jsonb)                      from public;
revoke all on function ingest_students_for_school(int, jsonb)            from public;
revoke all on function approve_pending_alias(int)                        from public;
revoke all on function admin_overview()                                  from public;
revoke all on function list_schools_drill()                              from public;
revoke all on function admin_list_users()                                from public;
revoke all on function admin_upsert_user(text, text, text, text, text[], boolean) from public;
revoke all on function submit_pending_alias(text, text, text, text, text, text, text) from public;

grant execute on function ingest_students(text, jsonb)                   to service_role;
grant execute on function ingest_students_for_school(int, jsonb)         to service_role;
grant execute on function approve_pending_alias(int)                     to service_role;
grant execute on function admin_overview()                               to service_role;
grant execute on function list_schools_drill()                           to service_role;
grant execute on function admin_list_users()                             to service_role;
grant execute on function admin_upsert_user(text, text, text, text, text[], boolean) to service_role;
grant execute on function submit_pending_alias(text, text, text, text, text, text, text) to service_role;
