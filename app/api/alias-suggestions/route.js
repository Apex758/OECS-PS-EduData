import { NextResponse } from "next/server";
import { createPendingAlias } from "@/lib/db";
import { getSubmitterIdentity } from "@/lib/submitterIdentity";

// Public endpoint — no admin token required.
// Uploader submits an alias suggestion (e.g. "Female" -> "F") after seeing
// the unrecognized-values card. The suggestion is stored as 'pending' and
// applied only for that same uploader's future uploads until an admin approves
// it globally via /api/admin/alias-suggestions.
export const runtime = "nodejs";

export async function POST(req) {
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
