import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/userAdminGate";
import { listRuliKeys } from "@/lib/db";

// View the per-exe RULI Mapper keys. READ-ONLY: each exe generates its own key
// and self-registers it via /api/validation/ruli-key. Keys are masked here.
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "admin only" }, { status: 403 });

const mask = (k) => (k ? `${String(k).slice(0, 8)}…${String(k).slice(-4)}` : "");

export async function GET(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    const keys = (await listRuliKeys()).map((r) => ({
      id: r.id,
      keyHint: mask(r.key),
      institution: r.institution,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
    }));
    return NextResponse.json({ keys });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
