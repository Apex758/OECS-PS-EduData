// =====================================================================
// DATA LAYER  --  Supabase (PostgREST), no raw pg pool
// =====================================================================
// Two trust levels (see lib/supabase.js):
//   svc()           -- service_role, BYPASSRLS. All server-trusted paths
//                      (ingest, admin, cron, pipeline reads of reference data).
//   userClient(jwt) -- the `authenticated` role with a caller JWT. RLS in
//                      db/policies.sql filters every row. Only the two scoped
//                      read paths use this (fetchScoped / fetchHierarchy).
//
// Multi-statement / aggregate work that needs atomicity or a single round-trip
// lives in db/rpc.sql and is called via svc().rpc(...).
// =====================================================================

import crypto from "crypto";
import { svc, userClient } from "@/lib/supabase";

// Throw on a Supabase error, else return the data payload.
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

export function hashKey(rawKey) {
  return crypto.createHash("sha256").update(String(rawKey)).digest("hex");
}

// ---------------------------------------------------------------------
// INGEST  --  shape the pipeline's accepted items into flat rows, then push
// them through an atomic RPC (auth + upsert students + mapping in one txn).
// Mirrors the old insertItems() field extraction exactly.
// ---------------------------------------------------------------------
function shapeItems(items) {
  return items.map(({ record, mapping, identityHash }) => {
    const entity = record.metadata.entity;
    const safe = record[entity] || record.student || {};
    const age = parseInt(safe.age, 10);
    return {
      ruli: record.RULI,
      class: safe.class ?? null,
      gender: safe.gender ?? null,
      age: Number.isFinite(age) ? age : null,
      metadata: { ...record.metadata, safe, tables: record.tables },
      identity_hash: identityHash,
      salt: mapping.salt,
      sensitive: mapping[entity] || {},
    };
  });
}

// Authorize by API key, then upsert. Returns:
//   { unauthorized: true } | { ok, school:{id,code,name}, inserted, skipped }
export async function ingestStudents({ keyHash, items }) {
  return unwrap(
    await svc().rpc("ingest_students", { p_key_hash: keyHash, p_rows: shapeItems(items) })
  );
}

// Ingest for a known school (Sheets cron). Returns:
//   { notFound: true } | { ok, school:{...}, inserted, skipped }
export async function ingestStudentsForSchool({ schoolId, items }) {
  return unwrap(
    await svc().rpc("ingest_students_for_school", { p_school_id: schoolId, p_rows: shapeItems(items) })
  );
}

// ---------------------------------------------------------------------
// STAFF INGEST  --  keyless, server-trusted (browser self-serve upload of the
// T10 teaching-staff instrument). The institution self-identifies via the
// institution/territory columns; the RPC resolves them to the schools/
// countries hierarchy, then upserts staff + staff_mapping atomically.
// Returns { ok, inserted, skipped, institutions:[codes] }.
// ---------------------------------------------------------------------
const STAFF_SAFE_FIELDS = [
  "institution", "territory", "classification", "teacher_type", "subjects",
  "total_periods", "years_experience", "highest_qualification",
  "area_of_specialisation", "cpd_hours", "appraised", "left_service", "sex",
];

function shapeStaffItems(items) {
  return items.map(({ record, mapping, identityHash }) => {
    const s = record.staff || {};
    const row = {
      ruli: record.RULI,
      metadata: { ...record.metadata, tables: record.tables },
      identity_hash: identityHash,
      salt: mapping.salt,
      sensitive: mapping.staff || {},
    };
    for (const f of STAFF_SAFE_FIELDS) row[f] = s[f] ?? null;
    return row;
  });
}

export async function ingestStaff({ items, rejected = [] }) {
  const p_rejected = rejected.map((r) => ({ data: r.data ?? {}, errors: r.errors ?? [] }));
  return unwrap(
    await svc().rpc("ingest_staff", { p_rows: shapeStaffItems(items), p_rejected })
  );
}

// Reconstruct the anonymized "dash records" the SDG/stats math expects
// ({ RULI, metadata, staff:{...safe}, tables }) from the staff table.
// service_role read (server-trusted; the institution dashboard shows totals).
const STAFF_SELECT =
  "ruli, " + STAFF_SAFE_FIELDS.join(", ") + ", metadata, created_at";

export async function readStaffRecords() {
  const rows =
    unwrap(await svc().from("staff").select(STAFF_SELECT).order("created_at", { ascending: true }).order("ruli", { ascending: true })) || [];
  return rows.map((r) => {
    const staff = {};
    for (const f of STAFF_SAFE_FIELDS) {
      if (r[f] !== null && r[f] !== undefined) staff[f] = r[f];
    }
    const meta = r.metadata || {};
    return {
      RULI: r.ruli,
      metadata: { ...meta, createdAt: meta.createdAt || r.created_at },
      staff,
      tables: meta.tables || {},
    };
  });
}

// Wipe all staff rows (staff_mapping cascades via FK) + rejected rows. Used by
// /api/clear so a demo reset starts fresh. service_role only.
export async function clearStaff() {
  const sb = svc();
  unwrap(await sb.from("staff").delete().gte("id", 0));
  unwrap(await sb.from("staff_rejected").delete().gte("id", 0));
}

// Failed-validation staff rows -> [{ data, errors }] for the dashboard's
// rejected view (shape matches the pipeline's result.rejected entries).
export async function readStaffRejected() {
  const rows =
    unwrap(await svc().from("staff_rejected").select("data, errors, created_at").order("created_at", { ascending: true })) || [];
  return rows.map((r) => ({ data: r.data || {}, errors: r.errors || [] }));
}

// RULI -> { RULI, salt, staff:{...PII} } for the dashboard row-expand reveal.
export async function readStaffMapping() {
  const rows = unwrap(await svc().from("staff_mapping").select("ruli, salt, sensitive")) || [];
  const byRuli = {};
  for (const m of rows) byRuli[m.ruli] = { RULI: m.ruli, salt: m.salt, staff: m.sensitive || {} };
  return byRuli;
}

// ---------------------------------------------------------------------
// ENROLMENT INGEST  --  keyless, server-trusted browser upload of the T2
// instrument (lib/parseInstrument.js). No PII -> no mapping table. The
// workbook-level institution/academicYear ride in p_meta; the programme
// rows in p_rows. The RPC resolves the institution to the hierarchy and
// upserts one row per programme (idempotent per school/year/division/prog).
// Returns { ok, inserted, skipped, institution:code }.
// ---------------------------------------------------------------------
export async function ingestEnrolment({ meta, rows, rejected = [] }) {
  const p_rejected = rejected.map((r) => ({ data: r.data ?? {}, errors: r.errors ?? [] }));
  // Institution-level Background (SDG 4.a.1 / 4.a.3) and Finance (SDG 4.5.3 /
  // 4.5.4 / 4.c.5) facts ride on each programme row's metadata jsonb -- no
  // extra table. The ingest RPC already persists r.metadata, and readEnrolment
  // dedupes back to one block per institution. Harmless cross-row duplication.
  const bg = meta?.background || null;
  const fin = meta?.finance || null;
  const p_rows = (rows || []).map((r) =>
    bg || fin
      ? { ...r, metadata: { ...(r.metadata || {}), ...(bg ? { background: bg } : {}), ...(fin ? { finance: fin } : {}) } }
      : r
  );
  return unwrap(
    await svc().rpc("ingest_enrolment", { p_meta: meta || {}, p_rows, p_rejected })
  );
}

// DB snake_case -> camelCase used by the SDG math (lib/sdgEnrolment.js). The
// embedded countries(name) becomes `territory` so the ministry/territory
// rollups work (the instrument carries no territory column of its own).
const ENROL_SELECT =
  "school_id, country_id, institution, academic_year, period_start, period_end, " +
  "division, certification, programme, accredited, is_tvet, " +
  "y1m, y1f, y2m, y2f, y3m, y3f, y4m, y4f, " +
  "total_pt_m, total_pt_f, total_ft_m, total_ft_f, " +
  "oecs_nat_m, oecs_nat_f, other_caricom_m, other_caricom_f, " +
  "other_nat_m, other_nat_f, oda_scholarship, metadata, created_at, countries(name)";

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export async function readEnrolment() {
  const rows =
    unwrap(
      await svc().from("enrolment").select(ENROL_SELECT)
        .order("institution", { ascending: true })
        .order("division", { ascending: true })
        .order("programme", { ascending: true })
    ) || [];
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "countries") continue; // embedded join, mapped to territory below
      out[camel(k)] = v;
    }
    out.territory = r.countries?.name || "Unspecified";
    return out;
  });
}

// Failed-validation enrolment rows -> [{ data, errors }] for the dashboard's
// rejected view (shape matches the staff rejected entries).
export async function readEnrolmentRejected() {
  const rows =
    unwrap(await svc().from("enrolment_rejected").select("institution, academic_year, data, errors, created_at").order("created_at", { ascending: true })) || [];
  return rows.map((r) => ({
    institution: r.institution || "",
    academicYear: r.academic_year || "",
    data: r.data || {},
    errors: r.errors || [],
  }));
}

// Wipe all enrolment rows + rejected rows. service_role only (used by /api/clear).
export async function clearEnrolment() {
  const sb = svc();
  unwrap(await sb.from("enrolment").delete().gte("id", 0));
  unwrap(await sb.from("enrolment_rejected").delete().gte("id", 0));
}

// ---- Google Sheets registry (used by /api/cron/sync-sheets) ----
export async function listEnabledSheets() {
  return unwrap(
    await svc()
      .from("school_sheets")
      .select("id, school_id, spreadsheet_id, range_a1, entity")
      .eq("enabled", true)
      .order("id")
  );
}

export async function markSheetSynced(id, status) {
  unwrap(
    await svc()
      .from("school_sheets")
      .update({ last_synced_at: new Date().toISOString(), last_status: String(status).slice(0, 300) })
      .eq("id", id)
  );
}

// =====================================================================
// ADMIN PORTAL  --  ingest credentials + sheet registrations (service_role)
// =====================================================================
export async function adminOverview() {
  return unwrap(await svc().rpc("admin_overview"));
}

export async function createApiKey({ schoolCode, label }) {
  const sb = svc();
  const school = unwrap(
    await sb.from("schools").select("id, name").eq("code", schoolCode).maybeSingle()
  );
  if (!school) return { notFound: true };

  const rawKey = "sk_" + crypto.randomBytes(24).toString("hex");
  const keyHash = hashKey(rawKey);
  const row = unwrap(
    await sb
      .from("school_api_keys")
      .insert({ school_id: school.id, key_hash: keyHash, label: label || null })
      .select("id")
      .single()
  );
  // raw key returned ONCE; only the hash is stored.
  return { ok: true, id: row.id, school: school.name, rawKey };
}

export async function revokeApiKey(keyId) {
  const rows = unwrap(
    await svc().from("school_api_keys").update({ revoked: true }).eq("id", keyId).select("id")
  );
  return { ok: rows.length > 0 };
}

export async function addSheet({ schoolCode, spreadsheetId, range }) {
  const sb = svc();
  const school = unwrap(
    await sb.from("schools").select("id, name").eq("code", schoolCode).maybeSingle()
  );
  if (!school) return { notFound: true };

  const row = unwrap(
    await sb
      .from("school_sheets")
      .upsert(
        { school_id: school.id, spreadsheet_id: spreadsheetId, range_a1: range || "A:Z", enabled: true },
        { onConflict: "school_id,spreadsheet_id,range_a1" }
      )
      .select("id")
      .single()
  );
  return { ok: true, id: row.id, school: school.name };
}

export async function toggleSheet(sheetId, enabled) {
  const rows = unwrap(
    await svc().from("school_sheets").update({ enabled: !!enabled }).eq("id", sheetId).select("id")
  );
  return { ok: rows.length > 0 };
}

// ---- per-institution drill-down (schools.can_drill) -----------------
export async function listSchoolsDrill() {
  return unwrap(await svc().rpc("list_schools_drill"));
}

// Set can_drill for ONE school, every school of a LEVEL, or every school in a
// TERRITORY (country_iso). Returns { ok, updated }.
export async function setSchoolDrill({ schoolId, level, country_iso, canDrill }) {
  const flag = !!canDrill;
  const sb = svc();
  let q;
  if (schoolId != null) {
    q = sb.from("schools").update({ can_drill: flag }).eq("id", schoolId);
  } else if (level) {
    q = sb.from("schools").update({ can_drill: flag }).eq("level", level);
  } else if (country_iso) {
    const country = unwrap(
      await sb.from("countries").select("id").ilike("iso_code", country_iso).maybeSingle()
    );
    if (!country) return { ok: true, updated: 0 };
    q = sb.from("schools").update({ can_drill: flag }).eq("country_id", country.id);
  } else {
    throw new Error("schoolId, level, or country_iso required");
  }
  const rows = unwrap(await q.select("id"));
  return { ok: true, updated: rows.length };
}

// =====================================================================
// IDENTITY  --  resolved server-side via service_role (SECURITY DEFINER fns).
// These return ONLY identity columns; they never expose scoped data.
// =====================================================================
export async function listPersonas() {
  return unwrap(await svc().rpc("list_demo_personas"));
}
export async function resolvePersonaById(id) {
  const rows = unwrap(await svc().rpc("resolve_user_by_id", { p_id: id }));
  return rows?.[0] ?? null;
}
export async function resolveUserByEmail(email) {
  const rows = unwrap(await svc().rpc("resolve_user_by_email", { p_email: email }));
  return rows?.[0] ?? null;
}

// =====================================================================
// RLS-SCOPED READ PATH  --  dashboards (real user JWT or persona JWT)
// =====================================================================
// fetchScoped / fetchHierarchy take a JWT and query as `authenticated`, so the
// policies in db/policies.sql filter every row to that identity. role/canDrill
// are passed alongside the token only for JS-side presentation (deciding which
// schools render as drillable); the row filtering itself is pure RLS.
// =====================================================================

const byStr = (a, b) => String(a ?? "").localeCompare(String(b ?? ""));

export async function fetchScoped({ token }) {
  const sb = userClient(token);

  const students = (
    unwrap(
      await sb
        .from("students")
        .select("ruli, class, gender, age, is_demo, schools(code, name), countries(iso_code, name)")
    ) || []
  )
    .map((r) => ({
      ruli: r.ruli,
      class: r.class,
      gender: r.gender,
      age: r.age,
      is_demo: r.is_demo,
      school_code: r.schools?.code ?? null,
      school_name: r.schools?.name ?? null,
      country: r.countries?.iso_code ?? null,
      country_name: r.countries?.name ?? null,
    }))
    .sort((a, b) => byStr(a.school_code, b.school_code) || byStr(a.class, b.class) || byStr(a.ruli, b.ruli));

  const schools = (
    unwrap(await sb.from("schools").select("code, name, level, countries(iso_code)")) || []
  )
    .map((r) => ({ code: r.code, name: r.name, level: r.level, country: r.countries?.iso_code ?? null }))
    .sort((a, b) => byStr(a.code, b.code));

  const institutions = (
    unwrap(await sb.from("institutions").select("name, type, countries(iso_code, name)")) || []
  )
    .map((r) => ({
      name: r.name,
      type: r.type,
      country: r.countries?.iso_code ?? null,
      country_name: r.countries?.name ?? null,
    }))
    .sort((a, b) => byStr(a.name, b.name));

  return { students, schools, institutions };
}

// ---------------------------------------------------------------------
// fetchHierarchy -- RLS-scoped, shaped for the two demo views (teacher /
// minister). RLS still decides which rows are visible; we nest them in JS.
// ---------------------------------------------------------------------
function classRank(name) {
  const n = String(name);
  if (/^grade\s+k$/i.test(n)) return 0;
  const g = n.match(/^grade\s+(\d+)$/i);
  if (g) return Number(g[1]);
  const f = n.match(/^form\s+(\d+)$/i);
  if (f) return 100 + Number(f[1]);
  const y = n.match(/^year\s+(\d+)$/i);
  if (y) return 200 + Number(y[1]);
  return 999; // 'Unassigned' / unknown last
}

export async function fetchHierarchy({ token, role, canDrill }) {
  const sb = userClient(token);

  // Every school visible to this scope, with its admin drill-down flag.
  const schoolRows = (
    unwrap(await sb.from("schools").select("id, code, name, level, can_drill, countries(iso_code)")) || []
  )
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      level: r.level,
      can_drill: r.can_drill,
      country: r.countries?.iso_code ?? null,
    }))
    .sort((a, b) => byStr(a.code, b.code));

  // Individual students visible to this scope. RLS already withholds rows for
  // any school whose drill-down is off, so this only contains drillable rows.
  const studentRows = (
    unwrap(await sb.from("students").select("ruli, class, gender, age, school_id")) || []
  ).sort((a, b) => byStr(a.class, b.class) || byStr(a.ruli, b.ruli));

  // TRUE per-school counts (SECURITY DEFINER, bypasses RLS) so a school whose
  // rows are hidden still shows its aggregate totals.
  const ids = schoolRows.map((s) => s.id);
  const statsRows = ids.length ? unwrap(await sb.rpc("school_stats_by_ids", { p_ids: ids })) || [] : [];
  const statsById = new Map(statsRows.map((r) => [r.school_id, r]));

  // Group the visible (drillable) students by school -> class.
  const bySchool = new Map();
  for (const st of studentRows) {
    if (!bySchool.has(st.school_id)) bySchool.set(st.school_id, new Map());
    const classes = bySchool.get(st.school_id);
    const cls = st.class || "Unassigned";
    if (!classes.has(cls)) classes.set(cls, []);
    classes.get(cls).push({ ruli: st.ruli, gender: st.gender, age: st.age });
  }

  // Can THIS user drill into the school? Admin always; minister needs both the
  // school flag and their own can_drill; teacher needs the school flag.
  const canDrillInto = (flag) => {
    if (role === "admin") return true;
    if (role === "minister") return flag && canDrill !== false;
    return flag; // teacher
  };

  const schools = schoolRows.map((sc) => {
    const agg = statsById.get(sc.id);
    const drillable = canDrillInto(sc.can_drill);
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
    return { code: sc.code, name: sc.name, level: sc.level, country: sc.country, drillable, stats, classes };
  });

  const scope = role === "minister" ? "ministry" : role === "teacher" ? "institution" : "all";
  const aggregateOnly = schools.some((s) => !s.drillable);
  return { scope, schools, aggregateOnly };
}

// =====================================================================
// VALUE ALIASES  --  admin-approved enum normalizations (service_role)
// =====================================================================
export async function listValueAliases(entity) {
  let q = svc().from("value_aliases").select("id, entity, field, variant, canonical");
  if (entity) q = q.eq("entity", entity);
  return unwrap(await q.order("field").order("variant"));
}

export async function addValueAlias({ entity, field, variant, canonical }) {
  if (!entity || !field || !variant || !canonical) {
    throw new Error("entity, field, variant, canonical are all required");
  }
  const row = unwrap(
    await svc()
      .from("value_aliases")
      .upsert(
        { entity, field: String(field).toLowerCase(), variant, canonical },
        { onConflict: "entity,field,variant" }
      )
      .select("id")
      .single()
  );
  return { id: row.id };
}

export async function removeValueAlias(id) {
  unwrap(await svc().from("value_aliases").delete().eq("id", id));
  return { ok: true };
}

// Snapshot then wipe (caller writes a backup before the rows are gone).
export async function clearValueAliases() {
  const sb = svc();
  const rows = unwrap(
    await sb.from("value_aliases").select("id, entity, field, variant, canonical").order("id")
  );
  unwrap(await sb.from("value_aliases").delete().gte("id", 0));
  return rows;
}

// =====================================================================
// PENDING ALIAS SUGGESTIONS  --  uploader-submitted, admin-approved
// =====================================================================
export async function createPendingAlias({ entity, field, variant, canonical, submittedBy, institution, scope }) {
  return unwrap(
    await svc().rpc("submit_pending_alias", {
      p_entity: entity,
      p_field: String(field).toLowerCase(),
      p_variant: variant,
      p_canonical: canonical,
      p_submitted_by: submittedBy,
      p_institution: institution || null,
      p_scope: scope || "institution",
    })
  );
}

// Snapshot then wipe every pending suggestion (caller backs up first).
export async function clearPendingAliases() {
  const sb = svc();
  const rows = unwrap(
    await sb
      .from("pending_aliases")
      .select(
        "id, entity, field, variant, canonical, submitted_by, institution, scope, status, review_note, acknowledged, submitted_at"
      )
      .order("id")
  );
  unwrap(await sb.from("pending_aliases").delete().gte("id", 0));
  return rows;
}

export async function listPendingAliases() {
  return unwrap(
    await svc()
      .from("pending_aliases")
      .select("id, entity, field, variant, canonical, submitted_by, institution, submitted_at")
      .eq("status", "pending")
      .order("submitted_at", { ascending: false })
  );
}

export async function countPendingAliases() {
  const { count, error } = await svc()
    .from("pending_aliases")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getPendingAliasesForSubmitter(submittedBy) {
  return unwrap(
    await svc()
      .from("pending_aliases")
      .select("entity, field, variant, canonical")
      .eq("submitted_by", submittedBy)
      .eq("status", "pending")
  );
}

// Admin approves: copy into value_aliases (global) + mark approved, atomically.
export async function approvePendingAlias(id) {
  return unwrap(await svc().rpc("approve_pending_alias", { p_id: id }));
}

// Admin rejects: mark rejected + optional reason; reset acknowledged so the
// uploader is re-notified of the decision.
export async function rejectPendingAlias(id, note) {
  const rows = unwrap(
    await svc()
      .from("pending_aliases")
      .update({ status: "rejected", review_note: note ? String(note).slice(0, 500) : null, acknowledged: false })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
  );
  return { ok: rows.length > 0 };
}

// Reviewed suggestions for ONE room/scope not yet dismissed (uploader bell).
export async function listRoomNotifications(scope) {
  return unwrap(
    await svc()
      .from("pending_aliases")
      .select("id, entity, field, variant, canonical, status, review_note, submitted_at")
      .eq("scope", scope)
      .in("status", ["approved", "rejected"])
      .eq("acknowledged", false)
      .order("submitted_at", { ascending: false })
  );
}

// Dismiss notifications for a room. Empty ids = dismiss all of that room's.
export async function acknowledgeNotifications(scope, ids) {
  const sb = svc();
  if (Array.isArray(ids) && ids.length) {
    unwrap(
      await sb.from("pending_aliases").update({ acknowledged: true }).eq("scope", scope).in("id", ids)
    );
  } else {
    unwrap(
      await sb
        .from("pending_aliases")
        .update({ acknowledged: true })
        .eq("scope", scope)
        .in("status", ["approved", "rejected"])
    );
  }
  return { ok: true };
}

// =====================================================================
// VALIDATION LAYER  --  cross-institution duplicate detection
// =====================================================================
// Fed by the RULI Mapper standalone. Tables in db/validation.sql; all access
// via svc() (service_role). See lib/ruliReverse.js for salt decryption.

// NOTE: no master/identity key lives here. Detection is salt-equality only; the
// salt-derivation key stays in the institutions' exes, so this layer can't
// re-identify anyone. (See db/validation.sql.)

// Upsert complete tokens (idempotent on re-push). tokens: [{token,ruli,salt,institution}]
// updated_at is set on every push so a re-push registers as an "edited" time.
export async function valInsertTokens(tokens) {
  const now = new Date().toISOString();
  const rows = (tokens || [])
    .filter((t) => t && t.token && t.ruli && t.salt)
    .map((t) => ({ token: t.token, ruli: t.ruli, salt: t.salt, institution: t.institution || null, updated_at: now }));
  if (!rows.length) return { inserted: 0, institutions: [] };
  unwrap(await svc().from("validation_tokens").upsert(rows, { onConflict: "token" }).select("token"));
  const institutions = [...new Set(rows.map((r) => r.institution).filter(Boolean))];
  return { inserted: rows.length, institutions };
}

// Append an audit event. kind: push | scan | decide | key_update.
export async function valLogEvent({ kind, institution = null, detail = null }) {
  if (!kind) return { ok: false };
  unwrap(await svc().from("validation_events").insert({ kind, institution, detail }).select("id"));
  return { ok: true };
}

// Recent activity, newest first.
export async function valListEvents(limit = 100) {
  return unwrap(
    await svc().from("validation_events")
      .select("id, kind, institution, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)
  ) || [];
}

// Stored salts grouped: the institutions that pushed each salt, how many distinct
// RULIs share it, and the first-seen (created) / last-push (edited) timestamps.
export async function valListTokens() {
  const rows = unwrap(
    await svc().from("validation_tokens").select("salt, institution, ruli, created_at, updated_at")
  ) || [];
  const bySalt = {};
  for (const r of rows) {
    const g = (bySalt[r.salt] ||= { salt: r.salt, institutions: new Set(), rulis: new Set(), created_at: r.created_at, updated_at: r.updated_at });
    if (r.institution) g.institutions.add(r.institution);
    if (r.ruli) g.rulis.add(r.ruli);
    if (r.created_at && r.created_at < g.created_at) g.created_at = r.created_at;
    if (r.updated_at && r.updated_at > g.updated_at) g.updated_at = r.updated_at;
  }
  return Object.values(bySalt)
    .map((g) => ({ salt: g.salt, institutions: [...g.institutions], tokenCount: g.rulis.size, created_at: g.created_at, updated_at: g.updated_at }))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

// Find salts shared by tokens with >1 distinct RULI (same person, different
// institution) and open a pending dup candidate per new salt.
export async function valScan() {
  const rows = unwrap(await svc().from("validation_tokens").select("ruli, salt")) || [];
  const bySalt = {};
  for (const r of rows) (bySalt[r.salt] ||= new Set()).add(r.ruli);
  const dupSalts = Object.entries(bySalt).filter(([, rulis]) => rulis.size > 1).map(([salt]) => salt);

  let created = 0;
  for (const salt of dupSalts) {
    const existing = unwrap(
      await svc().from("validation_dups").select("id").eq("salt", salt).maybeSingle()
    );
    if (!existing) {
      unwrap(await svc().from("validation_dups").insert({ salt, status: "pending" }).select("id"));
      created++;
    }
  }
  return { duplicatesFound: dupSalts.length, created };
}

// Pending dup prompts, optionally only those involving `institution`. Each
// carries the tokens (institution + RULI) that collided on the salt. Identity
// decryption is done by the caller (route) with the master key.
export async function valListPrompts(institution) {
  const dups = unwrap(
    await svc().from("validation_dups").select("id, salt, status, canonical_ruli").eq("status", "pending")
  ) || [];
  const out = [];
  for (const d of dups) {
    const toks = unwrap(
      await svc().from("validation_tokens").select("token, ruli, institution").eq("salt", d.salt)
    ) || [];
    if (institution && !toks.some((t) => (t.institution || "") === institution)) continue;
    out.push({ id: d.id, salt: d.salt, tokens: toks });
  }
  return out;
}

export async function valDecide({ id, decision, canonicalRuli, decidedBy }) {
  const status = decision === "approve" ? "approved" : "denied";
  unwrap(
    await svc().from("validation_dups")
      .update({
        status,
        canonical_ruli: canonicalRuli || null,
        decided_by: decidedBy || null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id")
  );
  return { ok: true };
}

// ---- RULI Mapper keys (per-exe registry) -----------------------------------
// Each institution's standalone GENERATES its own unique key (rmk_<hex>) and
// self-registers it here (open registration). Auth checks an incoming Bearer
// against the whole set — many exes, many keys, no shared secret.

// Register an exe's key (idempotent on the key). Optional institution label.
export async function registerRuliKey({ key, institution = null }) {
  const existing = unwrap(await svc().from("ruli_mapper_keys").select("id").eq("key", key).maybeSingle());
  if (existing) {
    if (institution) unwrap(await svc().from("ruli_mapper_keys").update({ institution }).eq("id", existing.id).select("id"));
    return { ok: true, created: false };
  }
  unwrap(await svc().from("ruli_mapper_keys").insert({ key, institution }).select("id"));
  return { ok: true, created: true };
}

// Is this Bearer a registered exe key? Bumps last_used_at when it matches.
export async function ruliKeyExists(key) {
  if (!key) return false;
  const r = unwrap(await svc().from("ruli_mapper_keys").select("id").eq("key", key).maybeSingle());
  if (!r) return false;
  unwrap(await svc().from("ruli_mapper_keys").update({ last_used_at: new Date().toISOString() }).eq("id", r.id).select("id"));
  return true;
}

// All registered keys (newest first) for the admin tab — masked by the route.
export async function listRuliKeys() {
  return unwrap(
    await svc().from("ruli_mapper_keys")
      .select("id, key, institution, created_at, last_used_at")
      .order("created_at", { ascending: false })
  ) || [];
}

// All dup candidates (any status) for the /validation page overview.
export async function valListAllDups() {
  return unwrap(
    await svc().from("validation_dups")
      .select("id, salt, status, canonical_ruli, decided_by, decided_at, created_at")
      .order("created_at", { ascending: false })
  ) || [];
}
