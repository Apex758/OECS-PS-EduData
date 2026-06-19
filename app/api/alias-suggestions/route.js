import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import { createPendingAlias } from "@/lib/db";
import { getSubmitterIdentity } from "@/lib/submitterIdentity";

export const runtime = "nodejs";

export async function POST(req) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Saving alias suggestions requires Supabase in .env." },
      { status: 503 }
    );
  }
  try {
    const { entity, field, variant, canonical, institution, scope } = await req.json();
    if (!entity || !field || !variant || !canonical) {
      return NextResponse.json(
        { error: "entity, field, variant, canonical required" },
        { status: 400 }
      );
    }
    const ROOMS = ["institution", "ministry", "admin"];
    const submittedBy = getSubmitterIdentity(req);
    const result = await createPendingAlias({
      entity,
      field,
      variant,
      canonical,
      submittedBy,
      institution: institution || null,
      scope: ROOMS.includes(scope) ? scope : "institution",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
