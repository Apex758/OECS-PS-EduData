// =====================================================================
// SUBMISSION AGGREGATIONS  --  pre-compute SDG rows at push time
// =====================================================================
// Turns accepted pipeline items into aggregation rows for the approvals
// table. Reuses lib/sdgIndicators.js and lib/sdgEnrolment.js math.
// =====================================================================

import { computeIndicators } from "@/lib/sdgIndicators";
import { computeEnrolment } from "@/lib/sdgEnrolment";
import { STAFF_SAFE_FIELDS } from "@/lib/staffFields";

function dashRecordFromAccepted({ record, mapping }) {
  const s = record.staff || {};
  const staff = {};
  for (const f of STAFF_SAFE_FIELDS) staff[f] = s[f] ?? null;
  return {
    RULI: record.RULI,
    metadata: { ...record.metadata, tables: record.tables },
    staff,
    mapping,
  };
}

function parseNumeratorDenominator(ind) {
  const detail = String(ind.detail || "");
  const ofMatch = detail.match(/^(\d+(?:\.\d+)?)\s+of\s+(\d+)/i);
  if (ofMatch) {
    return { numerator: Number(ofMatch[1]), denominator: Number(ofMatch[2]) };
  }
  const ratioMatch = detail.match(/(\d+)\s*F\s*\/\s*(\d+)\s*M/i);
  if (ratioMatch) {
    return { numerator: Number(ratioMatch[1]), denominator: Number(ratioMatch[2]) };
  }
  const slashMatch = detail.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (slashMatch) {
    return { numerator: Number(slashMatch[1]), denominator: Number(slashMatch[2]) };
  }
  if (ind.unit === "count" && ind.value != null) {
    return { numerator: Number(ind.value), denominator: null };
  }
  return { numerator: null, denominator: null };
}

function indicatorToAggregationRow(ind) {
  const { numerator, denominator } = parseNumeratorDenominator(ind);
  return {
    sdg: ind.code,
    numerator,
    denominator,
    result: ind.value == null ? null : Number(ind.value),
    metadata: {
      title: ind.title,
      unit: ind.unit,
      detail: ind.detail,
      note: ind.note,
    },
  };
}

/** Staff submission: compute SDG aggregation rows from accepted pipeline items. */
export function computeStaffAggregationRows(accepted, { pupils = null } = {}) {
  const records = (accepted || []).map(dashRecordFromAccepted);
  const { indicators } = computeIndicators(records, { pupils });
  return indicators.map(indicatorToAggregationRow);
}

/** Enrolment submission: compute SDG aggregation rows from programme rows. */
export function computeEnrolmentAggregationRows(programmeRows) {
  const { indicators } = computeEnrolment(programmeRows || []);
  return indicators.map(indicatorToAggregationRow);
}

/** Shape accepted items into RPC staff rows (same as pushPayload). */
export function shapeStaffSubmissionRows(accepted) {
  return (accepted || []).map(({ record, mapping, identityHash }) => {
    const s = record.staff || {};
    const row = {
      ruli: record.RULI,
      metadata: { ...record.metadata, tables: record.tables },
      identity_hash: identityHash,
      salt: mapping.salt,
      sensitive: {},
    };
    for (const f of STAFF_SAFE_FIELDS) row[f] = s[f] ?? null;
    return row;
  });
}
