import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { createApiKey } from "@/lib/db";

export const runtime = "nodejs";

// POST { schoolCode, label } -> issues a key. rawKey returned ONCE.
export async function POST(req) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { schoolCode, label } = await req.json().catch(() => ({}));
  if (!schoolCode) return NextResponse.json({ error: "schoolCode required" }, { status: 400 });
  try {
    const out = await createApiKey({ schoolCode, label });
    if (out.notFound) return NextResponse.json({ error: `no school "${schoolCode}"` }, { status: 404 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: `db error: ${e.message}` }, { status: 500 });
  }
}
