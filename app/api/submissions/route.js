import { NextResponse } from "next/server";
import { isDbConfigured, pushRequiresDbResponse } from "@/lib/dbConfig";
import {
  submitStaffSubmission,
  valLogEvent,
  getUserPrimarySchool,
} from "@/lib/db";
import {
  computeStaffAggregationRows,
  shapeStaffSubmissionRows,
} from "@/lib/computeSubmissionAggregations";
import { enrichStaffRows } from "@/lib/enrichStaffSubmission";
import { requireTeacherSession, sessionErrorResponse } from "@/lib/sessionAuth";

export const runtime = "nodejs";

export async function POST(req) {
  if (!isDbConfigured()) return pushRequiresDbResponse();

  const authOut = await requireTeacherSession();
  if (authOut.error) return sessionErrorResponse(authOut.error);

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { entity, accepted, rejected } = body || {};
  if (entity !== "staff") {
    return NextResponse.json(
      { error: `entity '${entity ?? ""}' not supported yet (staff only)` },
      { status: 400 }
    );
  }
  if (!Array.isArray(accepted) || accepted.length === 0) {
    return NextResponse.json({ error: "accepted[] required" }, { status: 400 });
  }

  const userId = authOut.session.user.id;
  const rows = shapeStaffSubmissionRows(accepted);
  const schoolCtx = await getUserPrimarySchool(userId);
  const scopedRows = enrichStaffRows(rows, schoolCtx);
  const aggregations = computeStaffAggregationRows(accepted);

  try {
    const out = await submitStaffSubmission({
      userId,
      rows: scopedRows,
      rejected: rejected || [],
      aggregations,
    });
    if (out.error) {
      const status = out.error.includes("not authorized") ? 403 : 400;
      return NextResponse.json({ error: out.error }, { status });
    }

    await valLogEvent({
      kind: "submission",
      institution: out.institution || null,
      detail: {
        submissionId: out.submissionId,
        status: out.status,
        approvalRequired: out.approvalRequired,
        inserted: out.inserted,
        skipped: out.skipped,
        aggregations: out.aggregations,
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
