import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import { rejectSubmission, valLogEvent } from "@/lib/db";
import { requireMinisterSession, sessionErrorResponse } from "@/lib/sessionAuth";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  }

  const authOut = await requireMinisterSession();
  if (authOut.error) return sessionErrorResponse(authOut.error);

  const submissionId = Number(params.id);
  if (!Number.isFinite(submissionId)) {
    return NextResponse.json({ error: "invalid submission id" }, { status: 400 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional body */
  }

  try {
    const out = await rejectSubmission({
      submissionId,
      ministerId: authOut.session.user.id,
      reason: body.reason || "",
    });
    if (out.error) {
      const status = out.error.includes("not authorized") ? 403 : 400;
      return NextResponse.json({ error: out.error }, { status });
    }

    await valLogEvent({
      kind: "reject_l2",
      detail: { submissionId, reason: body.reason || null },
    }).catch(() => {});

    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
