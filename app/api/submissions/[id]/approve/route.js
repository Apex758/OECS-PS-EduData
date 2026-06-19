import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/dbConfig";
import { approveSubmissionL2, valLogEvent } from "@/lib/db";
import { requireMinisterSession, sessionErrorResponse } from "@/lib/sessionAuth";

export const runtime = "nodejs";

export async function POST(_req, { params }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "database not configured" }, { status: 503 });
  }

  const authOut = await requireMinisterSession();
  if (authOut.error) return sessionErrorResponse(authOut.error);

  const submissionId = Number(params.id);
  if (!Number.isFinite(submissionId)) {
    return NextResponse.json({ error: "invalid submission id" }, { status: 400 });
  }

  try {
    const out = await approveSubmissionL2({
      submissionId,
      ministerId: authOut.session.user.id,
    });
    if (out.error) {
      const status = out.error.includes("not authorized") ? 403 : 400;
      return NextResponse.json({ error: out.error }, { status });
    }

    await valLogEvent({
      kind: "approve_l2",
      detail: { submissionId, ministerId: authOut.session.user.id },
    }).catch(() => {});

    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
