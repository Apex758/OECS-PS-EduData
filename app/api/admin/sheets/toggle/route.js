import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { toggleSheet } from "@/lib/db";

export const runtime = "nodejs";

// POST { sheetId, enabled } -> enable/disable a sheet for cron pull.
export async function POST(req) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sheetId, enabled } = await req.json().catch(() => ({}));
  if (!sheetId) return NextResponse.json({ error: "sheetId required" }, { status: 400 });
  try {
    const out = await toggleSheet(sheetId, enabled);
    if (!out.ok) return NextResponse.json({ error: "sheet not found" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: `db error: ${e.message}` }, { status: 500 });
  }
}
