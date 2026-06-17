import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { revokeApiKey } from "@/lib/db";

export const runtime = "nodejs";

// POST { keyId } -> revokes a key (ingest with it then 401s).
export async function POST(req) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { keyId } = await req.json().catch(() => ({}));
  if (!keyId) return NextResponse.json({ error: "keyId required" }, { status: 400 });
  try {
    const out = await revokeApiKey(keyId);
    if (!out.ok) return NextResponse.json({ error: "key not found" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: `db error: ${e.message}` }, { status: 500 });
  }
}
