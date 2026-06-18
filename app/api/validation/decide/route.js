import { NextResponse } from "next/server";
import { isAdminOrRuliKey } from "@/lib/ruliKeyAuth";
import { valDecide, valLogEvent } from "@/lib/db";

// Record a decision on a duplicate candidate: approve (pick a canonical RULI)
// or deny (not the same person).
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "not authorized" }, { status: 403 });

export async function POST(req) {
  if (!(await isAdminOrRuliKey(req))) return deny();
  try {
    const { id, decision, canonicalRuli } = await req.json();
    if (!id || !["approve", "deny"].includes(decision)) {
      return NextResponse.json({ error: "id and decision (approve|deny) required" }, { status: 400 });
    }
    await valDecide({ id, decision, canonicalRuli });
    await valLogEvent({ kind: "decide", detail: { id, decision, canonicalRuli: canonicalRuli || null } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
