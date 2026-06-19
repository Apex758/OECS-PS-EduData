import { NextResponse } from "next/server";
import { isDbConfigured, pushRequiresDbResponse } from "@/lib/dbConfig";
import {
  submitStaffSubmission,
  submitEnrolmentSubmission,
  valLogEvent,
} from "@/lib/db";
import {
  computeStaffAggregationRows,
  computeEnrolmentAggregationRows,
  shapeStaffSubmissionRows,
} from "@/lib/computeSubmissionAggregations";
import { enrichStaffRows, enrichEnrolmentMeta } from "@/lib/enrichStaffSubmission";
import { resolveSubmissionApiAuth } from "@/lib/submissionApiAuth";
import { STAFF_SAFE_FIELDS } from "@/lib/staffFields";

// External push to the approval layer (no browser session).
//
//   POST /api/submissions/push
//   Header: X-API-Key: sk_<hex>   OR   Authorization: Bearer rmk_<hex>
//
// Staff (pipeline format — same as browser Submit for Approval):
//   { entity: "staff", accepted: [...], rejected?: [...] }
//
// Staff (pre-shaped safe rows — same shape as /api/ingest-records rows):
//   { entity: "staff", rows: [...], rejected?: [...] }
//
// Enrolment:
//   { entity: "enrolment", meta: {...}, accepted: [...], rejected?: [...] }
export const runtime = "nodejs";

function acceptedFromRows(rows) {
  return (rows || []).map((row) => {
    const staff = {};
    for (const f of STAFF_SAFE_FIELDS) staff[f] = row[f] ?? null;
    return {
      record: {
        RULI: row.ruli,
        staff,
        metadata: row.metadata || {},
        tables: row.metadata?.tables,
      },
      mapping: { salt: row.salt },
      identityHash: row.identity_hash,
    };
  });
}

export async function POST(req) {
  if (!isDbConfigured()) return pushRequiresDbResponse();

  const authOut = await resolveSubmissionApiAuth(req);
  if (authOut.error) {
    return NextResponse.json(authOut.error.json, { status: authOut.error.status });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { entity, accepted, rows, rejected, meta } = body || {};
  const userId = authOut.userId;
  const schoolCtx = authOut.schoolCtx;

  if (entity === "staff") {
    const pipelineAccepted = Array.isArray(accepted) && accepted.length > 0
      ? accepted
      : Array.isArray(rows) && rows.length > 0
        ? acceptedFromRows(rows)
        : null;

    if (!pipelineAccepted?.length) {
      return NextResponse.json({ error: "accepted[] or rows[] required" }, { status: 400 });
    }

    const shapedRows = shapeStaffSubmissionRows(pipelineAccepted);
    const scopedRows = enrichStaffRows(shapedRows, schoolCtx);
    const aggregations = computeStaffAggregationRows(pipelineAccepted);

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
          source: authOut.authKind,
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

  if (entity === "enrolment") {
    if (!meta || !Array.isArray(accepted) || accepted.length === 0) {
      return NextResponse.json({ error: "meta and accepted[] required" }, { status: 400 });
    }

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
          source: authOut.authKind,
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

  return NextResponse.json(
    { error: `entity '${entity ?? ""}' not supported (staff or enrolment)` },
    { status: 400 }
  );
}
