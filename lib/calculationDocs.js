// =====================================================================
// CALCULATION DOCS  --  human-readable reference for every computed value
// =====================================================================
// Pure data (no JSX). Documents, for each metric the dashboard shows, the
// exact formula, what it reads, the rounding rule, and the mapping back to
// the OECS Post-Secondary SDG Instrument (table T10 Teaching Staff Profile
// and the "SDG Reference" sheet codes).
//
// This file IMPORTS the real math constants from lib/sdgIndicators.js so the
// reference can never drift out of sync with computeIndicators() /
// computeGroups(). If the math changes, this page reflects it automatically.
// =====================================================================

import {
  MIN_QUALIFICATIONS,
  QUAL_ORDER,
  CPD_BANDS,
  EXP_BANDS,
  SDG_REFERENCE,
} from "./sdgIndicators";

// Render a [label,min,max] band list as "0 · 1–19 · 20–39 · 40+".
function bandLabels(bands) {
  return bands.map(([label]) => label).join(" · ");
}

// Common denominator wording -- every indicator is "per teaching-staff record".
const ALL_STAFF = "all teaching-staff records uploaded (one T10 row per teacher)";

// The standard percentage rounding rule used by pct() in sdgIndicators.js.
const PCT_ROUNDING =
  "(numerator ÷ denominator) × 100, rounded to 1 decimal place. Shows “—” when there are no staff records.";

// ---- The four headline SDG indicators (computeIndicators) ----
export const indicatorDocs = [
  {
    code: "4.c.1",
    title: SDG_REFERENCE["4.c.1"].title,
    unit: "%",
    formula: "qualified ÷ total × 100",
    numerator: `staff whose highest_qualification is one of: ${MIN_QUALIFICATIONS.join(", ")} (Bachelors and above)`,
    denominator: ALL_STAFF,
    rounding: PCT_ROUNDING,
    instrument: "T10 · highest_qualification → SDG Reference 4.c.1",
    note: SDG_REFERENCE["4.c.1"].note,
  },
  {
    code: "4.c.7",
    title: SDG_REFERENCE["4.c.7"].title,
    unit: "%",
    formula: "with-CPD ÷ total × 100",
    numerator: "staff whose cpd_hours is greater than 0 (any in-service training in the past 12 months)",
    denominator: ALL_STAFF,
    rounding: PCT_ROUNDING,
    instrument: "T10 · cpd_hours → SDG Reference 4.c.7",
    note: SDG_REFERENCE["4.c.7"].note,
  },
  {
    code: "4.c.6",
    title: SDG_REFERENCE["4.c.6"].title,
    unit: "%",
    formula: "left-service ÷ total × 100",
    numerator: "staff whose left_service = Y (left the institution during the academic year)",
    denominator: ALL_STAFF,
    rounding: `${PCT_ROUNDING} Lower is better — the dashboard gauge turns amber above 10% and red above 20%.`,
    instrument: "T10 · left_service → SDG Reference 4.c.6",
    note: SDG_REFERENCE["4.c.6"].note,
  },
  {
    code: "4.5.1",
    title: SDG_REFERENCE["4.5.1"].title,
    unit: "ratio",
    formula: "female ÷ male",
    numerator: "count of staff where sex = F",
    denominator: "count of staff where sex = M",
    rounding:
      "rounded to 2 decimal places. 1.00 = perfect balance. Shows “—” when no sex column is supplied OR when there are zero male staff (can’t divide by zero).",
    instrument: "T10 · sex → SDG Reference 4.5.1",
    note: SDG_REFERENCE["4.5.1"].note,
  },
];

// ---- The distribution charts (computeIndicators.distributions) ----
export const distributionDocs = [
  {
    title: "Qualification mix",
    field: "highest_qualification",
    method: "Count staff by highest qualification, then order highest-first along the ladder.",
    buckets: QUAL_ORDER.join(" → "),
    instrument: "T10 · highest_qualification → SDG 4.c.1 chart",
  },
  {
    title: "Classification mix",
    field: "classification",
    method: "Count staff by role classification (descending). Blanks shown as “—”.",
    buckets: "PR (Principal) · VP (Vice-Principal) · HOD (Head of Department) · TT (Trained Teacher)",
    instrument: "T10 · classification",
  },
  {
    title: "Gender split",
    field: "sex",
    method: "Count staff with sex = F and sex = M. Buckets with a zero count are hidden.",
    buckets: "Female · Male",
    instrument: "T10 · sex → SDG 4.5.1 chart",
  },
  {
    title: "CPD hours (past year)",
    field: "cpd_hours",
    method: "Bucket each staff member's cpd_hours into fixed bands (band max is inclusive; “40+” is open-ended).",
    buckets: bandLabels(CPD_BANDS),
    instrument: "T10 · cpd_hours → SDG 4.c.7 chart",
  },
  {
    title: "Years of experience",
    field: "years_experience",
    method: "Bucket each staff member's years_experience into fixed bands (band max inclusive; “20+” open-ended).",
    buckets: bandLabels(EXP_BANDS),
    instrument: "T10 · years_experience",
  },
];

// ---- The roll-ups used by the ministry / admin comparison tables (computeGroups) ----
export const rollupDocs = [
  {
    title: "By institution (ministry view)",
    groupedBy: "staff.institution",
    method:
      "Group every staff record by its institution, then run the full set of four SDG indicators above on each group independently. Rows are sorted by staff count, largest first.",
    extra:
      "Each institution row also shows a territory, taken from the first staff record in the group that has a non-empty territory.",
    instrument: "T10 · institution (+ territory)",
  },
  {
    title: "By territory (admin view)",
    groupedBy: "staff.territory",
    method:
      "Group every staff record by its OECS territory, then run the same four SDG indicators on each group. Rows are sorted by staff count, largest first.",
    extra:
      "Each territory row also lists the distinct institutions found within it (for completeness/coverage counts).",
    instrument: "T10 · territory (+ institution)",
  },
];
