import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminOverview } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await adminOverview());
  } catch (e) {
    return NextResponse.json({ error: `db error: ${e.message}` }, { status: 500 });
  }
}
