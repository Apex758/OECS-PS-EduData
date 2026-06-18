import { NextResponse } from "next/server";
import { registerRuliKey, valLogEvent } from "@/lib/db";

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
