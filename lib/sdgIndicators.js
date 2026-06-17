// =====================================================================
// SDG INDICATOR LAYER  --  Post-Secondary / Tertiary (SDG 4.c family)
// =====================================================================
// Pure functions that turn a batch of anonymized TEACHING STAFF records
// (instrument table T10) into the SDG-4 indicators the OECS questionnaire
// is tagged with. No I/O here -- the API route reads the files and calls
// computeIndicators(); this file just does the math + carries the
// reference metadata (titles, colours) lifted from the workbook's
// "SDG Reference" sheet and its colour key.
// =====================================================================

// Qualifications that count as "minimum qualified" for SDG 4.c.1.
// Bachelors and above; Diploma / CAPE fall below the post-secondary bar.
// Single source of truth -- also imported by lib/transform.js.
export const MIN_QUALIFICATIONS = ["Bachelors", "PostGradDiploma", "Masters", "PhD"];

// Colour key from the instrument's "SDG INDICATOR COLOUR KEY" block.
export const SDG_COLOURS = {
  "4.3.2": "#4f8cf7", // Tertiary GER
  "4.3.3": "#22d3ee", // TVET Participation
  "4.5.1": "#a78bfa", // Parity (M/F)
  "4.c":   "#3fb950", // Teachers / CPD family
};

// Reference metadata for each indicator this MVP computes (SDG 4.c family
// + parity), straight from the SDG Reference sheet.
export const SDG_REFERENCE = {
  "4.c.1": {
    title: "Teachers with Minimum Qualifications",
    colour: SDG_COLOURS["4.c"],
    note: "Share of teaching staff whose highest qualification is Bachelors or above.",
  },
  "4.c.6": {
    title: "Teacher Attrition Rate",
    colour: SDG_COLOURS["4.c"],
    note: "Share of staff who left service during the academic year.",
  },
  "4.c.7": {
    title: "Teachers Receiving In-Service Training (12 months)",
    colour: SDG_COLOURS["4.c"],
    note: "Share of staff with any CPD (continuous professional development) hours in the past year.",
  },
  "4.5.1": {
    title: "Gender Parity of Teaching Staff",
    colour: SDG_COLOURS["4.5.1"],
    note: "Female-to-male ratio of teaching staff (1.0 = parity). Needs a sex column.",
  },
};

// Pull the "safe" staff fields out of a dash record. A record looks like
//   { RULI, metadata, staff: {...safe fields...}, tables: { sdg: {...} } }
function staffOf(record) {
  return record?.staff ?? {};
}

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

// computeIndicators(records) -> { count, indicators:[...], distributions:{...} }
//   records : array of dash records (staff-records.json)
export function computeIndicators(records) {
  const rows = Array.isArray(records) ? records.map(staffOf) : [];
  const n = rows.length;

  // ---- SDG 4.c.1 -- minimum-qualified proportion ----
  const minQ = rows.filter((r) => MIN_QUALIFICATIONS.includes(r.highest_qualification)).length;

  // ---- SDG 4.c.6 -- attrition (left_service = Y) ----
  const left = rows.filter((r) => r.left_service === "Y").length;

  // ---- SDG 4.c.7 -- CPD coverage (cpd_hours > 0) ----
  const withCpd = rows.filter((r) => Number(r.cpd_hours) > 0).length;

  // ---- SDG 4.5.1 -- gender parity (only if sex present) ----
  const male = rows.filter((r) => r.sex === "M").length;
  const female = rows.filter((r) => r.sex === "F").length;
  const haveSex = male + female > 0;
  const parity = haveSex && male > 0 ? Math.round((female / male) * 100) / 100 : null;

  const indicators = [
    {
      code: "4.c.1",
      ...SDG_REFERENCE["4.c.1"],
      value: pct(minQ, n),
      unit: "%",
      detail: `${minQ} of ${n} staff`,
    },
    {
      code: "4.c.7",
      ...SDG_REFERENCE["4.c.7"],
      value: pct(withCpd, n),
      unit: "%",
      detail: `${withCpd} of ${n} staff had CPD this year`,
    },
    {
      code: "4.c.6",
      ...SDG_REFERENCE["4.c.6"],
      value: pct(left, n),
      unit: "%",
      detail: `${left} of ${n} staff left service`,
    },
    {
      code: "4.5.1",
      ...SDG_REFERENCE["4.5.1"],
      value: haveSex ? parity : null,
      unit: "ratio",
      detail: haveSex ? `${female}F / ${male}M` : "no sex column supplied",
    },
  ];

  // ---- distributions for the dashboard charts ----
  const byQualification = orderBy(countBy(rows, "highest_qualification"), QUAL_ORDER);
  const byClassification = countBy(rows, "classification");
  const byGender = [
    { label: "Female", value: female },
    { label: "Male", value: male },
  ].filter((g) => g.value > 0);
  const cpdBands = bandCounts(rows, "cpd_hours", CPD_BANDS);
  const experienceBands = bandCounts(rows, "years_experience", EXP_BANDS);

  return {
    count: n,
    indicators,
    distributions: { byQualification, byClassification, byGender, cpdBands, experienceBands },
  };
}

// computeGroups(records, field) -> one indicator bundle per distinct value of
// record.staff[field]. Used for the ministry (field="institution") and admin
// (field="territory") dashboard rollups. Each entry is a full computeIndicators
// result for that subset, plus { key, territory, institutions }.
export function computeGroups(records, field) {
  const rows = Array.isArray(records) ? records : [];
  const groups = new Map();   // key -> records[]
  for (const r of rows) {
    const raw = staffOf(r)[field];
    const key = raw == null || String(raw).trim() === "" ? "Unspecified" : String(raw).trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()]
    .map(([key, subset]) => {
      // territory of an institution group = first non-empty territory in it.
      const territory = field === "institution"
        ? (subset.map((r) => staffOf(r).territory).find((t) => t && String(t).trim()) || "Unspecified")
        : undefined;
      // distinct institutions in a territory group (for completeness counts).
      const institutions = field === "territory"
        ? [...new Set(subset.map((r) => staffOf(r).institution).filter(Boolean))]
        : undefined;
      return { key, territory, institutions, ...computeIndicators(subset) };
    })
    .sort((a, b) => b.count - a.count);
}

// Natural ordering for the qualification ladder (highest first).
export const QUAL_ORDER = ["PhD", "Masters", "PostGradDiploma", "Bachelors", "Diploma", "CAPE"];

// Numeric band definitions: [label, min, max] (max inclusive; Infinity for open top).
export const CPD_BANDS = [
  ["0", 0, 0],
  ["1–19", 1, 19],
  ["20–39", 20, 39],
  ["40+", 40, Infinity],
];
export const EXP_BANDS = [
  ["0–4", 0, 4],
  ["5–9", 5, 9],
  ["10–19", 10, 19],
  ["20+", 20, Infinity],
];

// Sort an [{label,value}] list by a preferred label order, unknowns last.
function orderBy(items, order) {
  return [...items].sort((a, b) => {
    const ia = order.indexOf(a.label), ib = order.indexOf(b.label);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

// Bucket a numeric field into fixed bands -> [{label, value}] (band order kept).
function bandCounts(rows, field, bands) {
  return bands.map(([label, min, max]) => ({
    label,
    value: rows.filter((r) => {
      const v = Number(r[field]);
      return Number.isFinite(v) && v >= min && v <= max;
    }).length,
  }));
}

// Count rows by a field -> [{ label, value }] sorted desc, blanks as "—".
function countBy(rows, field) {
  const counts = new Map();
  for (const r of rows) {
    const key = r[field] == null || r[field] === "" ? "—" : String(r[field]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
