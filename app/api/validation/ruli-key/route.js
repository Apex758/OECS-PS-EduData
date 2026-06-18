import { NextResponse } from "next/server";
import { registerRuliKey, deleteRuliKey, valLogEvent } from "@/lib/db";
import { isAdmin } from "@/lib/userAdminGate";

// Each RULI Mapper standalone GENERATES its own unique key (rmk_<hex>) and
// self-registers it here. Registration is gated by RULI_REGISTER_SECRET: the
// exe must send it as "Bearer <secret>". If the env var is UNSET, registration
// stays open (demo default). Afterwards the key authenticates the exe's pushes.
export const runtime = "nodejs";

function registerAllowed(req) {
  const secret = process.env.RULI_REGISTER_SECRET;
  if (!secret) return true; // open registration when no secret configured
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req) {
  if (!registerAllowed(req)) {
    return NextResponse.json({ error: "registration closed — valid Bearer secret required" }, { status: 403 });
  }
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
