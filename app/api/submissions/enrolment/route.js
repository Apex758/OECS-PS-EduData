import { NextResponse } from "next/server";
import { isDbConfigured, pushRequiresDbResponse } from "@/lib/dbConfig";
import {
  submitEnrolmentSubmission,
  getUserPrimarySchool,
  valLogEvent,
} from "@/lib/db";
import { computeEnrolmentAggregationRows } from "@/lib/computeSubmissionAggregations";
import { enrichEnrolmentMeta } from "@/lib/enrichStaffSubmission";
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

  const { meta, accepted, rejected } = body || {};
  if (!meta || !Array.isArray(accepted) || accepted.length === 0) {
    return NextResponse.json({ error: "meta and accepted[] required" }, { status: 400 });
  }

  const userId = authOut.session.user.id;
  const schoolCtx = await getUserPrimarySchool(userId);
  const scopedMeta = enrichEnrolmentMeta(meta, schoolCtx);
  const aggregations = computeEnrolmentAggregationRows(accepted);
  const bg = scopedMeta?.background || null;
  const fin = scopedMeta?.finance || null;
  const rowsWithMeta = (accepted || []).map((r) =>
    bg || fin
      ? {
          ...r,
          metadata: {
            ...(r.metadata || {}),
            ...(bg ? { background: bg } : {}),
            ...(fin ? { finance: fin } : {}),
          },
        }
      : r
  );

  try {
    const out = await submitEnrolmentSubmission({
      userId,
      meta: scopedMeta,
      rows: rowsWithMeta,
      rejected: rejected || [],
      aggregations,
    });
    if (out.error) {
      const status = out.error.includes("not authorized") ? 403 : 400;
      return NextResponse.json({ error: out.error }, { status });
    }

    await valLogEvent({
      kind: "enrolment",
      institution: out.institution || scopedMeta.institution || null,
      detail: {
        submissionId: out.submissionId,
        status: out.status,
        approvalRequired: out.approvalRequired,
        inserted: out.inserted,
        skipped: out.skipped,
        aggregations: out.aggregations,
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      entity: "enrolment",
      recordsInserted: out.inserted ?? 0,
      recordsSkipped: out.skipped ?? 0,
      submissionId: out.submissionId ?? null,
      status: out.status ?? null,
      approvalRequired: out.approvalRequired ?? false,
      aggregations: out.aggregations ?? 0,
      institution: out.institution || scopedMeta.institution,
    });
  } catch (e) {
    return NextResponse.json({ error: `database error: ${e.message}` }, { status: 500 });
  }
}
