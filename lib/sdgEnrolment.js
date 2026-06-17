// =====================================================================
// ENROLMENT SDG LAYER  --  Post-Secondary / Tertiary (instrument T2)
// =====================================================================
// Pure functions turning enrolment rows (one per programme, lib/db.js
// readEnrolment) into the SDG-4 indicators the T2 table is tagged with:
//   4.3.3  TVET participation  -- share of enrolment in TVET programmes
//   4.5.1  Gender parity        -- female-to-male enrolment ratio
//   4.b.1  ODA scholarships     -- count of scholarship-funded enrolments
// (4.3.2 tertiary GER is intentionally OUT -- it needs an external
// population denominator the instrument doesn't carry.)
//
// No I/O here. Mirrors lib/sdgIndicators.js (staff) so the dashboard
// renders both the same way: { count, totals, indicators[], distributions }.
// =====================================================================

export const SDG_COLOURS = {
  "4.3.3": "#22d3ee", // TVET Participation
  "4.5.1": "#a78bfa", // Parity (M/F)
  "4.b.1": "#f59e0b", // ODA / Scholarships
};

export const SDG_REFERENCE = {
  "4.3.3": {
    title: "TVET Participation",
    colour: SDG_COLOURS["4.3.3"],
    note: "Share of total enrolment in programmes flagged as TVET.",
  },
  "4.5.1": {
    title: "Gender Parity of Enrolment",
    colour: SDG_COLOURS["4.5.1"],
    note: "Female-to-male ratio of enrolled students (1.0 = parity).",
  },
  "4.b.1": {
    title: "ODA Scholarship Enrolments",
    colour: SDG_COLOURS["4.b.1"],
    note: "Number of enrolments funded by an ODA scholarship.",
  },
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Headcount per programme row: full-time + part-time, by sex.
function headOf(r) {
  const male = n(r.totalFtM) + n(r.totalPtM);
  const female = n(r.totalFtF) + n(r.totalPtF);
  return { male, female, total: male + female };
}

// Sum a list of programme rows into one totals block (+ TVET + ODA).
function rollup(rows) {
  let male = 0, female = 0, tvet = 0, oda = 0;
  for (const r of rows) {
    const h = headOf(r);
    male += h.male;
    female += h.female;
    if (String(r.isTvet).toUpperCase() === "Y") tvet += h.total;
    oda += n(r.odaScholarship);
  }
  return { male, female, total: male + female, tvet, oda };
}

// Group rows by a key extractor -> [{ key, ...rollup, programmes }], sorted.
function groupBy(rows, keyOf, fallback) {
  const map = new Map();
  for (const r of rows) {
    const k = String(keyOf(r) || fallback);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()]
    .map(([key, rs]) => ({ key, programmes: rs.length, ...rollup(rs) }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

// Build the three indicator cards from a totals block.
function indicatorsOf(t) {
  const parity = t.male > 0 ? Math.round((t.female / t.male) * 100) / 100 : null;
  return [
    {
      code: "4.3.3", ...SDG_REFERENCE["4.3.3"],
      value: pct(t.tvet, t.total), unit: "%",
      detail: `${t.tvet} of ${t.total} enrolled`,
    },
    {
      code: "4.5.1", ...SDG_REFERENCE["4.5.1"],
      value: parity, unit: "ratio",
      detail: `${t.female} F / ${t.male} M`,
    },
    {
      code: "4.b.1", ...SDG_REFERENCE["4.b.1"],
      value: t.oda, unit: "count",
      detail: `${pct(t.oda, t.total) ?? 0}% of enrolment`,
    },
  ];
}

// computeEnrolment(rows) -> full rollup for one scope (all rows, or one group).
export function computeEnrolment(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const t = rollup(list);
  return {
    count: list.length,                 // programmes
    totals: t,                          // { male, female, total, tvet, oda }
    indicators: indicatorsOf(t),
    distributions: {
      byDivision: groupBy(list, (r) => r.division, "Unspecified"),
      byProgramme: groupBy(list, (r) => r.programme, "Unspecified"),
      byAccreditation: groupBy(list, (r) => r.accredited, "Unspecified"),
    },
  };
}

// computeEnrolmentGroups(rows, "institution"|"territory") -> per-scope rollups
// for the ministry / OECS-wide views. territory falls back to country label
// carried in metadata, else the resolved country isn't on the row -> "OECS".
export function computeEnrolmentGroups(rows, dim) {
  const keyOf =
    dim === "territory"
      ? (r) => r.territory || r.metadata?.territory || "Unspecified"
      : (r) => r.institution || "Unspecified";
  const list = Array.isArray(rows) ? rows : [];
  const map = new Map();
  for (const r of list) {
    const k = String(keyOf(r));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()]
    .map(([key, rs]) => {
      const c = computeEnrolment(rs);
      return { key, count: c.count, totals: c.totals, indicators: c.indicators, distributions: c.distributions };
    })
    .sort((a, b) => b.totals.total - a.totals.total || a.key.localeCompare(b.key));
}
