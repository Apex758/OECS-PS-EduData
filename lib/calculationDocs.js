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
import { SDG_REFERENCE as ENROL_REF } from "./sdgEnrolment";
import { SDG_BG_REFERENCE } from "./sdgBackground";
import { SDG_FIN_REFERENCE } from "./sdgFinance";
import { SDG_SYS_REFERENCE } from "./sdgSystem";

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
  {
    code: "4.c.3",
    title: SDG_REFERENCE["4.c.3"].title,
    unit: "%",
    formula: "qualified ÷ total × 100",
    numerator: `staff whose highest_qualification is one of: ${MIN_QUALIFICATIONS.join(", ")} (national minimum standard)`,
    denominator: ALL_STAFF,
    rounding: PCT_ROUNDING,
    instrument: "T10 · highest_qualification → SDG Reference 4.c.3 (by-institution-type split shown via the institution roll-up)",
    note: SDG_REFERENCE["4.c.3"].note,
  },
  {
    code: "4.c.2",
    title: SDG_REFERENCE["4.c.2"].title,
    unit: "pupils per teacher",
    formula: "enrolled pupils ÷ teaching staff",
    numerator: "total enrolled pupils for the scope — sum of full-time + part-time, M + F, from the enrolment (T2) rows of the same institution(s)",
    denominator: "all teaching-staff records uploaded (T10). No pedagogical-training flag exists in T10, so every teaching-staff row counts.",
    rounding: "rounded to 1 decimal place. Shows “—” when no enrolment data covers the scope or there are no staff.",
    instrument: "T2 enrolment headcount ÷ T10 staff → SDG Reference 4.c.2",
    note: SDG_REFERENCE["4.c.2"].note,
  },
  {
    code: "4.c.4",
    title: SDG_REFERENCE["4.c.4"].title,
    unit: "pupils per teacher",
    formula: "enrolled pupils ÷ qualified teachers",
    numerator: "total enrolled pupils for the scope (same enrolment headcount as 4.c.2)",
    denominator: `staff whose highest_qualification is one of: ${MIN_QUALIFICATIONS.join(", ")} (Bachelors and above)`,
    rounding: "rounded to 1 decimal place. Shows “—” when no enrolment data covers the scope or there are no qualified staff.",
    instrument: "T2 enrolment headcount ÷ T10 qualified staff → SDG Reference 4.c.4",
    note: SDG_REFERENCE["4.c.4"].note,
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

// ---- Enrolment indicators (lib/sdgEnrolment.js, instrument T2) ----
export const enrolmentDocs = [
  {
    code: "4.3.3",
    title: ENROL_REF["4.3.3"].title,
    unit: "%",
    formula: "TVET enrolment ÷ total enrolment × 100",
    numerator: "enrolment in programmes flagged Is TVET = Y (full-time + part-time, M + F)",
    denominator: "total enrolment across all programmes in scope",
    rounding: PCT_ROUNDING,
    instrument: "T2 · is_tvet → SDG Reference 4.3.3",
    note: ENROL_REF["4.3.3"].note,
  },
  {
    code: "4.5.1",
    title: ENROL_REF["4.5.1"].title,
    unit: "ratio",
    formula: "female ÷ male",
    numerator: "total female enrolment (Total FT F + Total PT F)",
    denominator: "total male enrolment (Total FT M + Total PT M)",
    rounding: "rounded to 2 decimals. 1.00 = parity. “—” when there are zero male students.",
    instrument: "T2 · year/PT/FT sex columns → SDG Reference 4.5.1",
    note: ENROL_REF["4.5.1"].note,
  },
  {
    code: "4.b.1",
    title: ENROL_REF["4.b.1"].title,
    unit: "count",
    formula: "Σ ODA Scholarship",
    numerator: "sum of the ODA Scholarship column across programmes in scope",
    denominator: "none — a raw count; the detail line also shows it as a % of total enrolment",
    rounding: "integer count.",
    instrument: "T2 · oda_scholarship → SDG Reference 4.b.1",
    note: ENROL_REF["4.b.1"].note,
  },
];

// ---- Background indicators (lib/sdgBackground.js, instrument items 1.13–1.18) ----
export const backgroundDocs = [
  {
    code: "4.a.1",
    title: "Facilities & Basic Services",
    unit: "%",
    formula: "institutions with the service ÷ institutions reporting × 100",
    numerator: "institutions answering Yes — computed separately for disability-accessible facilities (1.16) and OECS NREN membership (1.17)",
    denominator: "institutions that reported any Background facts",
    rounding: PCT_ROUNDING,
    instrument: "Background · 1.16 / 1.17 → SDG Reference 4.a.1",
    note: SDG_BG_REFERENCE["4.a.1"].note,
  },
  {
    code: "4.a.3",
    title: "Safety & Disaster Readiness",
    unit: "% + count",
    formula: "institutions with a plan ÷ reporting × 100;  Σ drills",
    numerator: "institutions answering Yes to a disaster-management plan (1.14); plus the total of emergency drills (1.15)",
    denominator: "institutions that reported any Background facts",
    rounding: `${PCT_ROUNDING} Drills are an integer total.`,
    instrument: "Background · 1.14 / 1.15 → SDG Reference 4.a.3",
    note: SDG_BG_REFERENCE["4.a.3"].note,
  },
];

// ---- Finance indicators (lib/sdgFinance.js, instrument T13) ----
export const financeDocs = [
  {
    code: "4.5.3",
    title: SDG_FIN_REFERENCE["4.5.3"].title,
    unit: "%",
    formula: "institutions with a mechanism ÷ reporting × 100",
    numerator: "institutions answering Yes to a formal mechanism to reallocate resources to disadvantaged groups",
    denominator: "institutions that reported Finance facts",
    rounding: PCT_ROUNDING,
    instrument: "T13 · equity question → SDG Reference 4.5.3",
    note: SDG_FIN_REFERENCE["4.5.3"].note,
  },
  {
    code: "4.5.4",
    title: SDG_FIN_REFERENCE["4.5.4"].title,
    unit: "currency",
    formula: "Σ recurrent expenditure ÷ Σ enrolled students",
    numerator: "total recurrent expenditure across institutions in scope (Finance T13 TOTAL)",
    denominator: "total enrolled students for those institutions (summed from their T2 enrolment rows)",
    rounding: "rounded to the nearest whole currency unit. “—” when no enrolment covers the scope.",
    instrument: "T13 expenditure ÷ T2 enrolment → SDG Reference 4.5.4",
    note: SDG_FIN_REFERENCE["4.5.4"].note,
  },
  {
    code: "4.c.5",
    title: SDG_FIN_REFERENCE["4.c.5"].title,
    unit: "ratio",
    formula: "avg teacher salary ÷ comparator salary",
    numerator: "average annual salary of full-time teaching staff",
    denominator: "average annual salary of professions requiring comparable qualifications",
    rounding: "per-institution ratio, then averaged across institutions in scope (2 decimals). 1.00 = parity.",
    instrument: "T13 · salary items → SDG Reference 4.c.5",
    note: SDG_FIN_REFERENCE["4.c.5"].note,
  },
];

// ---- System indicators (lib/sdgSystem.js, territory-level + external reference) ----
export const systemDocs = [
  {
    code: "4.3.2",
    title: SDG_SYS_REFERENCE["4.3.2"].title,
    unit: "%",
    formula: "tertiary enrolment ÷ age cohort × 100",
    numerator: "total tertiary enrolment in the territory (summed from T2 rows)",
    denominator: "population of the post-secondary age cohort — external reference input (lib/referenceData.js)",
    rounding: PCT_ROUNDING,
    instrument: "T2 enrolment ÷ reference population → SDG Reference 4.3.2",
    note: SDG_SYS_REFERENCE["4.3.2"].note,
  },
  {
    code: "4.5.6",
    title: SDG_SYS_REFERENCE["4.5.6"].title,
    unit: "%",
    formula: "recurrent expenditure ÷ GDP × 100",
    numerator: "total recurrent education expenditure in the territory (summed once per institution from T13)",
    denominator: "GDP at market prices — external reference input (lib/referenceData.js)",
    rounding: PCT_ROUNDING,
    instrument: "T13 expenditure ÷ reference GDP → SDG Reference 4.5.6",
    note: SDG_SYS_REFERENCE["4.5.6"].note,
  },
  {
    code: "4.5.5",
    title: SDG_SYS_REFERENCE["4.5.5"].title,
    unit: "%",
    formula: "ODA to education ÷ total ODA × 100",
    numerator: "ODA to education receipts — external reference input (lib/referenceData.js)",
    denominator: "total ODA receipts — external reference input (lib/referenceData.js)",
    rounding: PCT_ROUNDING,
    instrument: "reference ODA receipts → SDG Reference 4.5.5",
    note: SDG_SYS_REFERENCE["4.5.5"].note,
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
