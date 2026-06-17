// =====================================================================
// USER / ACCESS ADMIN  --  admin manages app_users + their scope
// =====================================================================
// All ops run under the RLS admin context (app.role='admin'), so the
// app_users / user_schools admin policies allow full read/write. Used by
// /api/admin/users/* behind the isAdmin() gate.
// =====================================================================
import { withRls } from "@/lib/db";

const ROLES = ["teacher", "minister", "admin"];
const asAdmin = (fn) => withRls({ role: "admin" }, fn);

// Full user list with country code + assigned school codes.
export async function listUsers() {
  return asAdmin(async (c) => {
    const { rows } = await c.query(`
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
       order by u.role, u.email`);
    return rows;
  });
}

// Reference data so the UI can offer valid countries/schools.
export async function refData() {
  return asAdmin(async (c) => {
    const countries = (await c.query("select id, iso_code, name from countries order by name")).rows;
    const schools = (await c.query("select id, code, name, country_id from schools order by code")).rows;
    return { countries, schools };
  });
}

// Create or update one user by email; REPLACES their school assignments.
export async function upsertUser({ email, name, role, country_iso, schools, can_drill_students }) {
  if (!email) throw new Error("email required");
  const r = String(role || "").trim().toLowerCase();
  if (!ROLES.includes(r)) throw new Error(`role must be one of ${ROLES.join(", ")} (got "${role}")`);
  const iso = country_iso ? String(country_iso).trim().toUpperCase() : null;
  const drill = can_drill_students === false ? false : true;   // default allow

  return asAdmin(async (c) => {
    let cid = null;
    if (iso) {
      const f = await c.query("select id from countries where iso_code = $1", [iso]);
      if (f.rowCount === 0) throw new Error(`unknown country_iso: ${iso}`);
      cid = f.rows[0].id;
    }
    const up = await c.query(
      `insert into app_users (email, name, role, country_id, can_drill_students, is_demo)
       values (lower($1), $2, $3, $4, $5, false)
       on conflict (email) do update
         set name = excluded.name, role = excluded.role,
             country_id = excluded.country_id,
             can_drill_students = excluded.can_drill_students
       returning id`,
      [email, name || null, r, cid, drill]
    );
    const uid = up.rows[0].id;

    // replace school links
    await c.query("delete from user_schools where user_id = $1", [uid]);
    const codes = Array.isArray(schools) ? schools.map((s) => String(s).trim()).filter(Boolean) : [];
    for (const code of codes) {
      const s = await c.query("select id from schools where code = $1", [code]);
      if (s.rowCount === 0) throw new Error(`unknown school_code: ${code}`);
      await c.query(
        "insert into user_schools (user_id, school_id) values ($1, $2) on conflict do nothing",
        [uid, s.rows[0].id]
      );
    }
    return { id: uid, email: email.toLowerCase() };
  });
}

export async function deleteUser(email) {
  if (!email) throw new Error("email required");
  return asAdmin(async (c) => {
    await c.query("delete from app_users where lower(email) = lower($1)", [email]);
    return { ok: true };
  });
}

// Bulk import from template rows. Per-row isolation: one bad row doesn't
// abort the rest. `school_codes` may be space/comma/semicolon separated.
export async function importUsers(rows) {
  const results = [];
  for (const [i, row] of rows.entries()) {
    const email = row.email || row.Email || "";
    try {
      const raw = String(row.school_codes ?? row.school_code ?? "").trim();
      const schools = raw ? raw.split(/[;,\s]+/).filter(Boolean) : [];
      // can_drill column optional: "no"/"false"/"0" -> false, anything else -> true
      const drillRaw = String(row.can_drill ?? row.can_drill_students ?? "").trim().toLowerCase();
      const can_drill_students = !["no", "false", "0", "n"].includes(drillRaw);
      await upsertUser({
        email,
        name: row.name || row.Name || null,
        role: row.role || row.Role,
        country_iso: row.country_iso || row.country || null,
        schools,
        can_drill_students,
      });
      results.push({ row: i + 1, email, ok: true });
    } catch (e) {
      results.push({ row: i + 1, email, ok: false, error: e.message });
    }
  }
  return results;
}

// Dump live app_users back to the data/users.json shape (admin "export").
export async function exportUsers() {
  const users = await listUsers();
  return {
    _comment: "Exported from the live database by /admin/access. Loaded back by db/seed.mjs on setup.",
    users: users.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
      country_iso: u.country_iso ?? null,
      schools: u.schools || [],
      can_drill_students: u.can_drill_students,
      is_demo: u.is_demo,
    })),
  };
}
