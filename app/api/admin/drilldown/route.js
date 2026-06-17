import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/userAdminGate";
import { listSchoolsDrill, setSchoolDrill } from "@/lib/db";

// Admin · per-institution / per-level drill-down toggle. Gated by isAdmin
// (SSO admin role OR ADMIN_SECRET). Writes schools.can_drill, which the
// students RLS policy enforces.
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "admin only" }, { status: 403 });

// GET -> every school with its level, country, student count and can_drill flag.
export async function GET(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    return NextResponse.json({ schools: await listSchoolsDrill() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST { schoolId, canDrill }     -> set one school
// POST { level, canDrill }         -> bulk-set every school of that level
// POST { country_iso, canDrill }   -> bulk-set every school in that territory
export async function POST(req) {
  if (!(await isAdmin(req))) return deny();
  const { schoolId, level, country_iso, canDrill } = await req.json().catch(() => ({}));
  if (schoolId == null && !level && !country_iso) {
    return NextResponse.json({ error: "schoolId, level, or country_iso required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await setSchoolDrill({ schoolId, level, country_iso, canDrill }));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
