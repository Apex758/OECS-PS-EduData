// =====================================================================
// USER / ACCESS ADMIN  --  admin manages app_users + their scope
// =====================================================================
// All ops run under service_role (BYPASSRLS), so the admin can read/write
// every app_users / user_schools row. Used by /api/admin/users/* behind the
// isAdmin() gate. Atomic work (upsert user + replace school links, the
// array_agg listing) lives in db/rpc.sql.
// =====================================================================
import { svc } from "@/lib/supabase";

const ROLES = ["teacher", "minister", "admin"];

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// Full user list with country code + assigned school codes.
export async function listUsers() {
  return unwrap(await svc().rpc("admin_list_users"));
}

// Reference data so the UI can offer valid countries/schools.
export async function refData() {
  const sb = svc();
  const countries = unwrap(await sb.from("countries").select("id, iso_code, name").order("name"));
  const schools = unwrap(await sb.from("schools").select("id, code, name, country_id").order("code"));
  return { countries, schools };
}

// Create or update one user by email; REPLACES their school assignments.
export async function upsertUser({ email, name, role, country_iso, schools, can_drill_students }) {
  if (!email) throw new Error("email required");
  const r = String(role || "").trim().toLowerCase();
  if (!ROLES.includes(r)) throw new Error(`role must be one of ${ROLES.join(", ")} (got "${role}")`);
  const iso = country_iso ? String(country_iso).trim().toUpperCase() : null;
  const drill = can_drill_students === false ? false : true; // default allow
  const codes = Array.isArray(schools) ? schools.map((s) => String(s).trim()).filter(Boolean) : [];

  return unwrap(
    await svc().rpc("admin_upsert_user", {
      p_email: email,
      p_name: name || null,
      p_role: r,
      p_country_iso: iso,
      p_schools: codes,
      p_can_drill: drill,
    })
  );
}

export async function deleteUser(email) {
  if (!email) throw new Error("email required");
  unwrap(await svc().from("app_users").delete().ilike("email", email));
  return { ok: true };
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
