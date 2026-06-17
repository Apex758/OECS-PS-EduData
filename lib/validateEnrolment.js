// =====================================================================
// ENROLMENT VALIDATION  --  instrument T2 programme rows
// =====================================================================
// The parser (lib/parseInstrument.js) is deliberately lenient: it coerces
// blank numeric cells to 0 and keeps any string it can't parse. That means
// bad rows used to ingest silently. This module is the gate: it splits the
// extracted programme rows into accepted / rejected BEFORE ingest, so the
// dashboard can surface the rejects -- exactly like the staff pipeline's
// result.{accepted,rejected}.
//
// Rejected shape mirrors the staff pipeline: { data, errors:[{field,message}] }
// so the dashboard's rejected view renders both the same way.
//
// Checks:
//   - programme required
//   - every count is a non-negative integer (rejects negatives + "Yes" etc.)
//   - isTvet in {Y, N}
//   - accredited in {"", No, Locally, Regionally, Internationally}
//   - RECONCILIATION: per sex, Σ year-of-study == full-time + part-time
//     == Σ nationality. The three cuts describe the same headcount, so a
//     mismatch means the return doesn't add up.
// =====================================================================

// Canonical numeric keys (must match lib/parseInstrument.js NUM_KEYS).
export const ENROL_NUM_KEYS = [
  "y1m", "y1f", "y2m", "y2f", "y3m", "y3f", "y4m", "y4f",
  "totalPtM", "totalPtF", "totalFtM", "totalFtF",
  "oecsNatM", "oecsNatF", "otherCaricomM", "otherCaricomF",
  "otherNatM", "otherNatF", "odaScholarship",
];

const ACCRED_OK = new Set(["", "no", "locally", "regionally", "internationally"]);

// A clean non-negative integer, or null if the value can't be one.
function intOf(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// validateEnrolment(rows) -> { accepted:[rows], rejected:[{data,errors}] }
export function validateEnrolment(rows) {
  const accepted = [];
  const rejected = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const errors = [];

    // ---- programme required ----
    if (!String(row.programme || "").trim()) {
      errors.push({ field: "programme", message: "programme is required" });
    }

    // ---- numerics: non-negative integers ----
    const num = {};
    for (const k of ENROL_NUM_KEYS) {
      const n = intOf(row[k]);
      if (n === null) {
        errors.push({ field: k, message: `${k} must be a non-negative whole number (got "${row[k]}")` });
      } else {
        num[k] = n;
      }
    }

    // ---- isTvet enum ----
    const tvet = String(row.isTvet ?? "").trim().toUpperCase();
    if (tvet !== "" && tvet !== "Y" && tvet !== "N") {
      errors.push({ field: "isTvet", message: `isTvet must be Y or N (got "${row.isTvet}")` });
    }

    // ---- accredited enum ----
    const accred = String(row.accredited ?? "").trim().toLowerCase();
    if (!ACCRED_OK.has(accred)) {
      errors.push({ field: "accredited", message: `accredited must be No/Locally/Regionally/Internationally (got "${row.accredited}")` });
    }

    // ---- reconciliation (only when all numerics parsed) ----
    if (Object.keys(num).length === ENROL_NUM_KEYS.length) {
      for (const sx of ["m", "f"]) {
        const S = sx.toUpperCase();
        const years = num[`y1${sx}`] + num[`y2${sx}`] + num[`y3${sx}`] + num[`y4${sx}`];
        const ftpt = num[`totalFt${S}`] + num[`totalPt${S}`];
        const nat = num[`oecsNat${S}`] + num[`otherCaricom${S}`] + num[`otherNat${S}`];
        if (years !== ftpt || years !== nat) {
          const sex = sx === "m" ? "male" : "female";
          errors.push({
            field: `total_${sex}`,
            message: `${sex} totals disagree: years=${years} ft+pt=${ftpt} nationality=${nat}`,
          });
        }
      }
    }

    if (errors.length) rejected.push({ data: row, errors });
    else accepted.push(row);
  }

  return { accepted, rejected };
}
