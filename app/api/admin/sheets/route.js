import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { addSheet } from "@/lib/db";

export const runtime = "nodejs";

// POST { schoolCode, spreadsheetId, range? } -> registers a sheet for cron pull.
export async function POST(req) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { schoolCode, spreadsheetId, range } = await req.json().catch(() => ({}));
  if (!schoolCode || !spreadsheetId) {
    return NextResponse.json({ error: "schoolCode and spreadsheetId required" }, { status: 400 });
  }
  try {
    const out = await addSheet({ schoolCode, spreadsheetId, range });
    if (out.notFound) return NextResponse.json({ error: `no school "${schoolCode}"` }, { status: 404 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: `db error: ${e.message}` }, { status: 500 });
  }
}
