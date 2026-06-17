// =====================================================================
// POSTGRES  --  pooled client for the serverless ingest path
// =====================================================================
// Reads DATABASE_URL (Neon / Vercel Postgres / Supabase connection
// string -- use the POOLED endpoint on serverless). A single Pool is
// cached on globalThis so Next.js hot-reload / lambda reuse doesn't open
// a new pool per invocation.
// =====================================================================

import crypto from "crypto";
import pg from "pg";

function makePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // Managed PG (Neon/Supabase) needs TLS. Disable strict CA check unless
  // PGSSL_STRICT is set, since these providers use their own chains.
  const ssl =
    process.env.PGSSL === "disable"
      ? false
      : { rejectUnauthorized: process.env.PGSSL_STRICT === "true" };
  return new pg.Pool({ connectionString, ssl, max: 3 });
}

function pool() {
  if (!globalThis.__pgPool) globalThis.__pgPool = makePool();
  return globalThis.__pgPool;
}

export function hashKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey)).digest("hex");
}

// ---------------------------------------------------------------------
// ingestStudents -- authorize by API key, then upsert students + mapping
// in a SINGLE server-trusted transaction.
//
//   keyHash : sha256(raw key) hex  (caller already hashed it)
//   items   : [{ record, mapping, identityHash }]  from processRows()
//
// Returns:
//   { unauthorized: true }                       -- bad/revoked key
//   { ok, school, inserted, skipped }            -- success
//
// app.role is set to 'admin' for the txn so RLS lets the server write to
// any school. This is safe: the role is internal, never caller-controlled;
// the API key alone decides WHICH school the rows belong to.
// ---------------------------------------------------------------------
// Per-item upsert loop, shared by every ingest path (API key + sheets).
// Caller owns the txn and has already set app.role='admin'.
async function insertItems(client, schoolId, countryId, items) {
  let inserted = 0;
  let skipped = 0;

  for (const { record, mapping, identityHash } of items) {
    const safe = record[record.metadata.entity] || record.student || {};
    const age = parseInt(safe.age, 10);
    const metadata = {
      ...record.metadata,
      safe,                 // non-sensitive fields not given their own column
      tables: record.tables,
    };

    const ins = await client.query(
      `insert into students (ruli, school_id, country_id, class, gender, age, metadata, identity_hash, is_demo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, false)
       on conflict (school_id, identity_hash) do nothing
       returning ruli`,
      [
        record.RULI,
        schoolId,
        countryId,
        safe.class ?? null,
        safe.gender ?? null,
        Number.isFinite(age) ? age : null,
        metadata,
        identityHash,
      ]
    );

    if (ins.rowCount === 0) {
      skipped++;            // same student already ingested for this school
      continue;
    }

    await client.query(
      `insert into student_mapping (ruli, school_id, country_id, salt, sensitive)
       values ($1, $2, $3, $4, $5)`,
      [record.RULI, schoolId, countryId, mapping.salt, JSON.stringify(mapping[record.metadata.entity] || {})]
    );
    inserted++;
  }

  return { inserted, skipped };
}

export async function ingestStudents({ keyHash, items }) {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("set local app.role = 'admin'");

    const keyRes = await client.query(
      `select k.id as key_id, s.id as school_id, s.country_id, s.code, s.name
         from school_api_keys k
         join schools s on s.id = k.school_id
        where k.key_hash = $1 and k.revoked = false`,
      [keyHash]
    );
    if (keyRes.rowCount === 0) {
      await client.query("rollback");
      return { unauthorized: true };
    }
    const { key_id, school_id, country_id, code, name } = keyRes.rows[0];

    const { inserted, skipped } = await insertItems(client, school_id, country_id, items);

    await client.query("update school_api_keys set last_used_at = now() where id = $1", [key_id]);
    await client.query("commit");

    return { ok: true, school: { id: school_id, code, name }, inserted, skipped };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Ingest already-authorized rows for a known school (used by the Sheets
// cron, where the school comes from school_sheets, not an API key).
export async function ingestStudentsForSchool({ schoolId, items }) {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("set local app.role = 'admin'");

    const s = await client.query(
      "select id, country_id, code, name from schools where id = $1",
      [schoolId]
    );
    if (s.rowCount === 0) {
      await client.query("rollback");
      return { notFound: true };
    }
    const { country_id, code, name } = s.rows[0];

    const { inserted, skipped } = await insertItems(client, schoolId, country_id, items);
    await client.query("commit");
    return { ok: true, school: { id: schoolId, code, name }, inserted, skipped };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---- Google Sheets registry (used by /api/cron/sync-sheets) ----
export async function listEnabledSheets() {
  return withAdmin(async (c) => {
    const { rows } = await c.query(
      `select id, school_id, spreadsheet_id, range_a1, entity
         from school_sheets where enabled = true order by id`
    );
    return rows;
  });
}

export async function markSheetSynced(id, status) {
  return withAdmin(async (c) => {
    await c.query(
      "update school_sheets set last_synced_at = now(), last_status = $2 where id = $1",
      [id, String(status).slice(0, 300)]
    );
  });
}

// Run fn in a txn with admin role (for admin-RLS tables outside ingest).
async function withAdmin(fn) {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("set local app.role = 'admin'");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// =====================================================================
// ADMIN PORTAL  --  manage ingest credentials + sheet registrations
// =====================================================================
// Powers /api/admin/* (gated by ADMIN_SECRET). Key HASHES are never
// returned; the raw key is shown once at creation.

export async function adminOverview() {
  return withAdmin(async (c) => {
    const schools = (await c.query(
      `select sc.id, sc.code, sc.name, co.iso_code as country,
              (select count(*) from students st where st.school_id = sc.id) as students
         from schools sc join countries co on co.id = sc.country_id
        order by sc.code`
    )).rows;
    const keys = (await c.query(
      `select id, school_id, label, revoked, created_at, last_used_at
         from school_api_keys order by id`
    )).rows;
    const sheets = (await c.query(
      `select id, school_id, spreadsheet_id, range_a1, entity, enabled,
              last_synced_at, last_status
         from school_sheets order by id`
    )).rows;
    return { schools, keys, sheets };
  });
}

export async function createApiKey({ schoolCode, label }) {
  return withAdmin(async (c) => {
    const s = await c.query("select id, name from schools where code = $1", [schoolCode]);
    if (s.rowCount === 0) return { notFound: true };
    const rawKey = "sk_" + crypto.randomBytes(24).toString("hex");
    const keyHash = hashKey(rawKey);
    const r = await c.query(
      `insert into school_api_keys (school_id, key_hash, label)
       values ($1, $2, $3) returning id, created_at`,
      [s.rows[0].id, keyHash, label || null]
    );
    // raw key returned ONCE; only the hash is stored.
    return { ok: true, id: r.rows[0].id, school: s.rows[0].name, rawKey };
  });
}

export async function revokeApiKey(keyId) {
  return withAdmin(async (c) => {
    const r = await c.query(
      "update school_api_keys set revoked = true where id = $1 returning id",
      [keyId]
    );
    return { ok: r.rowCount > 0 };
  });
}

export async function addSheet({ schoolCode, spreadsheetId, range }) {
  return withAdmin(async (c) => {
    const s = await c.query("select id, name from schools where code = $1", [schoolCode]);
    if (s.rowCount === 0) return { notFound: true };
    const r = await c.query(
      `insert into school_sheets (school_id, spreadsheet_id, range_a1)
       values ($1, $2, $3)
       on conflict (school_id, spreadsheet_id, range_a1) do update set enabled = true
       returning id`,
      [s.rows[0].id, spreadsheetId, range || "A:Z"]
    );
    return { ok: true, id: r.rows[0].id, school: s.rows[0].name };
  });
}

export async function toggleSheet(sheetId, enabled) {
  return withAdmin(async (c) => {
    const r = await c.query(
      "update school_sheets set enabled = $2 where id = $1 returning id",
      [sheetId, !!enabled]
    );
    return { ok: r.rowCount > 0 };
  });
}

// ---- per-institution drill-down (schools.can_drill) -----------------
// Admin reads/writes whether each school exposes individual students to a
// minister/teacher (false = aggregate counts only, enforced by RLS).
export async function listSchoolsDrill() {
  return withAdmin(async (c) => {
    const { rows } = await c.query(
      `select sc.id, sc.code, sc.name, sc.level, sc.can_drill,
              co.iso_code as country,
              (select count(*) from students st where st.school_id = sc.id)::int as students
         from schools sc join countries co on co.id = sc.country_id
        order by sc.level nulls last, sc.code`
    );
    return rows;
  });
}

// Set can_drill for ONE school (schoolId), every school of a LEVEL (bulk),
// or every school in a TERRITORY (country_iso, bulk).
// Returns { ok, updated } with the number of rows changed.
export async function setSchoolDrill({ schoolId, level, country_iso, canDrill }) {
  const flag = !!canDrill;
  return withAdmin(async (c) => {
    let r;
    if (schoolId != null) {
      r = await c.query("update schools set can_drill = $2 where id = $1 returning id", [schoolId, flag]);
    } else if (level) {
      r = await c.query("update schools set can_drill = $2 where level = $1 returning id", [level, flag]);
    } else if (country_iso) {
      r = await c.query(
        `update schools sc set can_drill = $2
           from countries co
          where sc.country_id = co.id and upper(co.iso_code) = upper($1)
         returning sc.id`,
        [country_iso, flag]
      );
    } else {
      throw new Error("schoolId, level, or country_iso required");
    }
    return { ok: true, updated: r.rowCount };
  });
}

// =====================================================================
// RLS-SCOPED READ PATH  --  dashboards + SSO role-based access
// =====================================================================
// Identity is resolved first (SECURITY DEFINER functions in db/functions.sql,
// which bypass RLS just to answer "who is this"). Then withRls() opens a txn,
// SET LOCALs app.user_id/role/country_id, and every read is filtered by the
// policies in db/policies.sql. SET LOCAL is txn-scoped -> never leaks across
// pooled requests.
// =====================================================================

// ---- identity (no RLS context needed; functions run as definer) ----
export async function listPersonas() {
  const { rows } = await pool().query("select * from list_demo_personas()");
  return rows;
}
export async function resolvePersonaById(id) {
  const { rows } = await pool().query("select * from resolve_user_by_id($1)", [id]);
  return rows[0] ?? null;
}
export async function resolveUserByEmail(email) {
  const { rows } = await pool().query("select * from resolve_user_by_email($1)", [email]);
  return rows[0] ?? null;
}

// ---- run fn with RLS context for {userId, role, countryId, canDrill} ----
// canDrill === false hides individual students from a minister (set app.can_drill
// = '0'); anything else (incl. undefined) allows drill-down ('1').
export async function withRls({ userId, role, countryId, canDrill }, fn) {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.role', $1, true)", [role ?? ""]);
    await client.query("select set_config('app.user_id', $1, true)", [userId != null ? String(userId) : ""]);
    await client.query("select set_config('app.country_id', $1, true)", [countryId != null ? String(countryId) : ""]);
    await client.query("select set_config('app.can_drill', $1, true)", [canDrill === false ? "0" : "1"]);
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---- scoped reads (RLS filters every query to the context) ----
export async function fetchScoped(ctx) {
  return withRls(ctx, async (c) => {
    const students = (await c.query(
      `select s.ruli, s.class, s.gender, s.age, s.is_demo,
              sc.code as school_code, sc.name as school_name,
              co.iso_code as country, co.name as country_name
         from students s
         join schools sc on sc.id = s.school_id
         join countries co on co.id = s.country_id
        order by sc.code, s.class, s.ruli`
    )).rows;
    const schools = (await c.query(
      `select sc.code, sc.name, sc.level, co.iso_code as country
         from schools sc join countries co on co.id = sc.country_id
        order by sc.code`
    )).rows;
    const institutions = (await c.query(
      `select i.name, i.type, co.iso_code as country, co.name as country_name
         from institutions i join countries co on co.id = i.country_id
        order by i.name`
    )).rows;
    return { students, schools, institutions };
  });
}

// ---------------------------------------------------------------------
// fetchHierarchy -- RLS-scoped, but shaped for the two demo views:
//   Institution (teacher) : one/few schools -> classes -> students
//   Ministry    (minister): all country schools -> per-school stats,
//                           each school drillable to classes -> students
// RLS still filters which rows are visible; we just nest them in JS.
// Returns { scope, schools:[{ code,name,level,country,stats, classes:[
//   { name, students:[{ ruli, gender, age }] } ] }] }
// ---------------------------------------------------------------------
// Order classes naturally: Grade K, Grade 1..6 (primary) then Form 1..5
// (secondary) then Year 1.. (tertiary). Sorts top-down in a mixed list.
function classRank(name) {
  const n = String(name);
  if (/^grade\s+k$/i.test(n)) return 0;
  const g = n.match(/^grade\s+(\d+)$/i);
  if (g) return Number(g[1]);
  const f = n.match(/^form\s+(\d+)$/i);
  if (f) return 100 + Number(f[1]);
  const y = n.match(/^year\s+(\d+)$/i);
  if (y) return 200 + Number(y[1]);
  return 999;   // 'Unassigned' / unknown last
}

export async function fetchHierarchy(ctx) {
  return withRls(ctx, async (c) => {
    // Every school visible to this scope, with its admin drill-down flag.
    const schoolRows = (await c.query(
      `select sc.id, sc.code, sc.name, sc.level, sc.can_drill, co.iso_code as country
         from schools sc join countries co on co.id = sc.country_id
        order by sc.code`
    )).rows;

    // Individual students visible to this scope. RLS already withholds rows for
    // any school whose drill-down is off (per-institution OR per-user), so this
    // only contains drillable schools' students.
    const studentRows = (await c.query(
      `select s.ruli, s.class, s.gender, s.age, s.school_id
         from students s
        order by s.class, s.ruli`
    )).rows;

    // TRUE per-school counts (SECURITY DEFINER, bypasses RLS) so a school whose
    // rows are hidden still shows its aggregate totals.
    const ids = schoolRows.map((s) => s.id);
    const statsRows = ids.length
      ? (await c.query("select * from school_stats_by_ids($1::int[])", [ids])).rows
      : [];
    const statsById = new Map(statsRows.map((r) => [r.school_id, r]));

    // Group the visible (drillable) students by school -> class.
    const bySchool = new Map();   // school_id -> Map(className -> students[])
    for (const st of studentRows) {
      if (!bySchool.has(st.school_id)) bySchool.set(st.school_id, new Map());
      const classes = bySchool.get(st.school_id);
      const cls = st.class || "Unassigned";
      if (!classes.has(cls)) classes.set(cls, []);
      classes.get(cls).push({ ruli: st.ruli, gender: st.gender, age: st.age });
    }

    // Can THIS user drill into the school? Admin always; minister needs both the
    // school flag and their own can_drill; teacher needs the school flag.
    const canDrill = (flag) => {
      if (ctx.role === "admin") return true;
      if (ctx.role === "minister") return flag && ctx.canDrill !== false;
      return flag;   // teacher
    };

    const schools = schoolRows.map((sc) => {
      const agg = statsById.get(sc.id);
      const drillable = canDrill(sc.can_drill);
      const classMap = bySchool.get(sc.id) || new Map();
      const classes = drillable
        ? [...classMap.entries()]
            .map(([name, students]) => ({ name, students }))
            .sort((a, b) => classRank(a.name) - classRank(b.name))
        : [];
      const stats = {
        students: agg ? Number(agg.students) : classes.flatMap((cl) => cl.students).length,
        classes: drillable ? classes.length : null,
        male: agg ? Number(agg.male) : 0,
        female: agg ? Number(agg.female) : 0,
      };
      return { code: sc.code, name: sc.name, level: sc.level, country: sc.country,
               drillable, stats, classes };
    });

    const scope = ctx.role === "minister" ? "ministry"
      : ctx.role === "teacher" ? "institution"
      : "all";
    const aggregateOnly = schools.some((s) => !s.drillable);
    return { scope, schools, aggregateOnly };
  });
}

// =====================================================================
// VALUE ALIASES  --  admin-approved enum normalizations (self-learning)
// =====================================================================
// Reference data in value_aliases (no RLS). The ingest pipeline reads these
// and merges them with the static aliases in lib/valueAliases.js, so an
// approved "Male"->"M" mapping auto-normalizes on the next upload. Writes are
// gated at the API layer (isAdmin).
export async function listValueAliases(entity) {
  const { rows } = await pool().query(
    `select id, entity, field, variant, canonical
       from value_aliases ${entity ? "where entity = $1" : ""}
      order by field, variant`,
    entity ? [entity] : []
  );
  return rows;
}

export async function addValueAlias({ entity, field, variant, canonical }) {
  if (!entity || !field || !variant || !canonical) {
    throw new Error("entity, field, variant, canonical are all required");
  }
  const { rows } = await pool().query(
    `insert into value_aliases (entity, field, variant, canonical)
     values ($1, $2, $3, $4)
     on conflict (entity, field, variant) do update set canonical = excluded.canonical
     returning id`,
    [entity, String(field).toLowerCase(), variant, canonical]
  );
  return { id: rows[0].id };
}

export async function removeValueAlias(id) {
  await pool().query("delete from value_aliases where id = $1", [id]);
  return { ok: true };
}

// Fetch all aliases then delete them all in one shot. Returns the snapshot
// so the caller can write a backup file before the rows are gone.
export async function clearValueAliases() {
  const { rows } = await pool().query(
    "select id, entity, field, variant, canonical from value_aliases order by id"
  );
  await pool().query("delete from value_aliases");
  return rows;
}

// =====================================================================
// PENDING ALIAS SUGGESTIONS  --  uploader-submitted, admin-approved
// =====================================================================

// Uploader submits a suggestion. Upserts so re-submissions (after rejection
// or a change of mind) reset the row to pending with the new canonical.
export async function createPendingAlias({ entity, field, variant, canonical, submittedBy, institution, scope }) {
  const f = String(field).toLowerCase();
  // If this mapping is already globally approved (lives in value_aliases), the
  // upload pipeline normalizes it silently — re-queuing it as pending would
  // re-notify the admin on every upload. Short-circuit: it already "just goes
  // through".
  const approved = await pool().query(
    "select 1 from value_aliases where entity = $1 and field = $2 and variant = $3 limit 1",
    [entity, f, variant]
  );
  if (approved.rowCount) return { alreadyApproved: true, status: "approved" };

  const { rows } = await pool().query(
    `insert into pending_aliases (entity, field, variant, canonical, submitted_by, institution, scope)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (entity, field, variant, submitted_by) do update
       set canonical = excluded.canonical,
           institution = coalesce(excluded.institution, pending_aliases.institution),
           scope = excluded.scope,
           status = 'pending',
           submitted_at = now()
     returning id, status`,
    [entity, f, variant, canonical, submittedBy, institution || null, scope || "institution"]
  );
  return { id: rows[0].id, status: rows[0].status };
}

// Snapshot then wipe every pending suggestion. Returned rows are written to a
// backup file by /api/clear before deletion. Clearing these alongside
// value_aliases keeps the two tables consistent: otherwise a leftover pending
// row (or a now-orphaned 'approved' one) would re-apply or re-notify after a
// "fresh start".
export async function clearPendingAliases() {
  const { rows } = await pool().query(
    `select id, entity, field, variant, canonical, submitted_by, institution, scope,
            status, review_note, acknowledged, submitted_at
       from pending_aliases order by id`
  );
  await pool().query("delete from pending_aliases");
  return rows;
}

// All pending suggestions visible in the admin queue.
export async function listPendingAliases() {
  const { rows } = await pool().query(
    `select id, entity, field, variant, canonical, submitted_by, institution, submitted_at
       from pending_aliases
      where status = 'pending'
      order by submitted_at desc`
  );
  return rows;
}

// Count pending suggestions (for the admin badge).
export async function countPendingAliases() {
  const { rows } = await pool().query(
    "select count(*)::int as count from pending_aliases where status = 'pending'"
  );
  return rows[0].count;
}

// All pending suggestions for ONE submitter fingerprint — used by the process
// route so re-uploads from the same person get their own suggestions applied.
export async function getPendingAliasesForSubmitter(submittedBy) {
  const { rows } = await pool().query(
    `select entity, field, variant, canonical
       from pending_aliases
      where submitted_by = $1 and status = 'pending'`,
    [submittedBy]
  );
  return rows;
}

// Admin approves: copy into value_aliases (permanent, global), mark approved.
export async function approvePendingAlias(id) {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select entity, field, variant, canonical from pending_aliases where id = $1 and status = 'pending'",
      [id]
    );
    if (!rows.length) { await client.query("rollback"); return { notFound: true }; }
    const { entity, field, variant, canonical } = rows[0];
    await client.query(
      `insert into value_aliases (entity, field, variant, canonical)
       values ($1, $2, $3, $4)
       on conflict (entity, field, variant) do update set canonical = excluded.canonical`,
      [entity, field, variant, canonical]
    );
    await client.query(
      "update pending_aliases set status = 'approved' where id = $1",
      [id]
    );
    await client.query("commit");
    return { ok: true };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Admin rejects: mark rejected + store an optional reason. Empty note falls
// back to a generic "declined" message in the UI. Resets acknowledged so the
// uploader is re-notified of the decision.
export async function rejectPendingAlias(id, note) {
  const { rowCount } = await pool().query(
    `update pending_aliases
        set status = 'rejected', review_note = $2, acknowledged = false
      where id = $1 and status = 'pending'`,
    [id, note ? String(note).slice(0, 500) : null]
  );
  return { ok: rowCount > 0 };
}

// Reviewed (approved | rejected) suggestions for ONE room/scope that haven't
// been dismissed — powers the uploader's Dashboard notification. Gated by
// scope (institution | ministry | admin) so each role sees only its own.
export async function listRoomNotifications(scope) {
  const { rows } = await pool().query(
    `select id, entity, field, variant, canonical, status, review_note, submitted_at
       from pending_aliases
      where scope = $1
        and status in ('approved', 'rejected')
        and acknowledged = false
      order by submitted_at desc`,
    [scope]
  );
  return rows;
}

// Dismiss notifications for a room. Empty ids = dismiss all of that room's.
export async function acknowledgeNotifications(scope, ids) {
  if (Array.isArray(ids) && ids.length) {
    await pool().query(
      `update pending_aliases set acknowledged = true
        where scope = $1 and id = any($2::int[])`,
      [scope, ids]
    );
  } else {
    await pool().query(
      `update pending_aliases set acknowledged = true
        where scope = $1 and status in ('approved','rejected')`,
      [scope]
    );
  }
  return { ok: true };
}
