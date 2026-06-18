import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/userAdminGate";
import { valScan, valLogEvent } from "@/lib/db";

// Re-run duplicate detection on demand (the /validation page "Scan" button).
export const runtime = "nodejs";
const deny = () => NextResponse.json({ error: "admin only" }, { status: 403 });

export async function POST(req) {
  if (!(await isAdmin(req))) return deny();
  try {
    const res = await valScan();
    await valLogEvent({ kind: "scan", detail: res });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
