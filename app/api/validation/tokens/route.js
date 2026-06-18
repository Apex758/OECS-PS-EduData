import { NextResponse } from "next/server";
import { isAdminOrRuliKey } from "@/lib/ruliKeyAuth";
import { valInsertTokens, valScan, valLogEvent, valDeleteTokens } from "@/lib/db";

// Standalone pushes complete tokens here; we store them and immediately scan
// for cross-institution salt collisions so the push response can report how
// many possible duplicates were found.
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "not authorized" }, { status: 403 });

export async function POST(req) {
  if (!(await isAdminOrRuliKey(req))) return deny();
  try {
    const { tokens } = await req.json();
    if (!Array.isArray(tokens)) return NextResponse.json({ error: "tokens[] required" }, { status: 400 });
    const ins = await valInsertTokens(tokens);
    const scan = await valScan();
    await valLogEvent({
      kind: "push",
      institution: ins.institutions.length === 1 ? ins.institutions[0] : null,
      detail: { inserted: ins.inserted, institutions: ins.institutions, duplicatesFound: scan.duplicatesFound },
    });
    return NextResponse.json({ ok: true, inserted: ins.inserted, duplicatesFound: scan.duplicatesFound });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Cascade delete: an exe removed a saved mapping run locally and sends that
// run's tokens here so the layer drops them too. Stale dup candidates whose
// collision no longer holds are cleaned up inside valDeleteTokens.
export async function DELETE(req) {
  if (!(await isAdminOrRuliKey(req))) return deny();
  try {
    const { tokens } = await req.json();
    if (!Array.isArray(tokens)) return NextResponse.json({ error: "tokens[] required" }, { status: 400 });
    const out = await valDeleteTokens(tokens);
    await valLogEvent({ kind: "delete", detail: out });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
