import { NextResponse } from "next/server";
import { registerRuliKey, deleteRuliKey, valLogEvent } from "@/lib/db";
import { isAdmin } from "@/lib/userAdminGate";

// Each RULI Mapper standalone GENERATES its own unique key (rmk_<hex>) and
// self-registers it here. Open registration (demo): any exe may register its own
// key. Afterwards that key authenticates the exe's pushes. Many exes → many keys.
export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { key, institution } = await req.json();
    if (!key || !/^rmk_[0-9a-f]{16,}$/i.test(key)) {
      return NextResponse.json({ error: "key must look like rmk_<hex>" }, { status: 400 });
    }
    const r = await registerRuliKey({ key, institution: institution || null });
    if (r.created) await valLogEvent({ kind: "ruli_key_register", institution: institution || null });
    return NextResponse.json({ ok: true, registered: r.created });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Admin-only: unregister a key by id, or wipe all when no id is given (demo reset).
export async function DELETE(req) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "admin only" }, { status: 403 });
  try {
    const { id } = await req.json().catch(() => ({}));
    const r = await deleteRuliKey({ id: id || null });
    await valLogEvent({ kind: "ruli_key_delete", detail: { deleted: r.deleted } });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
