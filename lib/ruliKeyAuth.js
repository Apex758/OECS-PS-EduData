// Auth gate for the RULI Mapper standalone. The exe authenticates with a
// dedicated key (generated in the admin tab), NOT the ADMIN_SECRET — so an
// institution operator never holds the admin password. Endpoints the exe hits
// accept EITHER the admin (for humans in the portal) OR this key.
import { isAdmin } from "@/lib/userAdminGate";
import { ruliKeyExists } from "@/lib/db";
import { requireTeacherSession } from "@/lib/sessionAuth";

// Valid if the Bearer matches ANY registered exe key (per-exe registry).
export async function ruliKeyValid(req) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return false;
  try {
    return await ruliKeyExists(m[1]);
  } catch {
    return false;
  }
}

async function teacherSessionValid() {
  const out = await requireTeacherSession();
  return !out.error;
}

export async function isAdminOrRuliKey(req) {
  if (await isAdmin(req)) return true;
  return ruliKeyValid(req);
}

/** Browser institution submit (session cookie) or standalone exe (rmk_ key) or admin. */
export async function isValidationPushAuthorized(req) {
  if (await isAdmin(req)) return true;
  if (await ruliKeyValid(req)) return true;
  return teacherSessionValid();
}
