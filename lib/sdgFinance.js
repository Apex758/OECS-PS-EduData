// =====================================================================
// FINANCE SDG LAYER  --  Post-Secondary / Tertiary (instrument T13)
// =====================================================================
// Turns the institution-level Finance facts (carried on each enrolment row's
// metadata.finance by lib/db.js ingestEnrolment) into the SDG-4 indicators the
// Finance sheet is tagged with:
//   4.5.3  Equity funding mechanism   -- share of institutions with one
//   4.5.4  Expenditure per student    -- recurrent expenditure / enrolled
//   4.c.5  Teacher salary ratio        -- avg teacher salary / comparator
// Partial (need external inputs the instrument lacks, surfaced as notes):
//   4.5.6  Expenditure as % of GDP    -- GDP not collected -> expenditure only
//   4.5.5  ODA to education, LDC share -- national/global ODA, not institution
//
// One fact block PER INSTITUTION. Enrolled headcount for 4.5.4 is summed from
// the same enrolment rows. No I/O here -- the route calls computeFinance().
// =====================================================================

export const SDG_FIN_COLOURS = {
  "4.5.3": "#8b5cf6", // Equity
  "4.5.4": "#0ea5e9", // Expenditure per student
  "4.c.5": "#3fb950", // Salary ratio (4.c family green)
};

export const SDG_FIN_REFERENCE = {
  "4.5.3": {
    title: "Equity Funding Mechanism",
    colour: SDG_FIN_COLOURS["4.5.3"],
    note: "Share of institutions with a formal mechanism to reallocate resources to disadvantaged groups (item T13 equity question).",
  },
  "4.5.4": {
    title: "Expenditure per Student",
    colour: SDG_FIN_COLOURS["4.5.4"],
    note: "Total recurrent expenditure ÷ total enrolled students, in local currency. Expenditure from Finance T13; enrolment from the T2 rows of the same institution(s).",
  },
  "4.c.5": {
    title: "Teacher Salary Ratio",
    colour: SDG_FIN_COLOURS["4.c.5"],
    note: "Average full-time teacher salary ÷ average salary of professions requiring comparable qualifications. 1.0 = parity.",
  },
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Enrolled headcount for one programme row (full-time + part-time, M + F).
const headOf = (r) => num(r.totalFtM) + num(r.totalFtF) + num(r.totalPtM) + num(r.totalPtF);

// Collect one Finance fact block per institution + that institution's total
// enrolled headcount (for the per-student ratio).
export function collectFinance(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byInstitution = new Map();
  for (const r of list) {
    const key = (r.institution || "Unspecified").trim() || "Unspecified";
    let rec = byInstitution.get(key);
    if (!rec) {
      const fin = r?.metadata?.finance || null;
      rec = {
        institution: key,
        territory: (r.territory || "Unspecified").trim() || "Unspecified",
        enrolled: 0,
        finance: fin,
      };
      byInstitution.set(key, rec);
    }
    rec.enrolled += headOf(r);
  }
  // Keep only institutions that actually reported finance facts.
  return [...byInstitution.values()]
    .filter((r) => r.finance)
    .map((r) => ({ institution: r.institution, territory: r.territory, enrolled: r.enrolled, ...r.finance }))
    .sort((a, b) => a.institution.localeCompare(b.institution));
}

// computeFinance(rows) -> { count, indicators[], institutions[] }
export function computeFinance(rows) {
  const insts = collectFinance(rows);
  const n = insts.length;
  if (n === 0) return { count: 0, indicators: [], institutions: [] };

  const withEquity = insts.filter((i) => i.equityMechanism === "Y").length;

  // 4.5.4: pooled expenditure / pooled enrolment across the scope.
  const totalExp = insts.reduce((s, i) => s + num(i.totalExpenditure), 0);
  const totalEnrolled = insts.reduce((s, i) => s + num(i.enrolled), 0);
  const perStudent = totalEnrolled > 0 ? Math.round(totalExp / totalEnrolled) : null;

  // 4.c.5: average of the per-institution salary ratios that are computable.
  const ratios = insts
    .map((i) => (num(i.comparatorSalary) > 0 ? num(i.avgTeacherSalary) / num(i.comparatorSalary) : (Number(i.salaryRatio) || null)))
    .filter((v) => Number.isFinite(v) && v > 0);
  const avgRatio = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100 : null;

  const indicators = [
    {
      code: "4.5.3", key: "4.5.3",
      ...SDG_FIN_REFERENCE["4.5.3"],
      value: pct(withEquity, n), unit: "%",
      detail: `${withEquity} of ${n} institutions`,
    },
    {
      code: "4.5.4", key: "4.5.4",
      ...SDG_FIN_REFERENCE["4.5.4"],
      value: perStudent, unit: "currency",
      detail: perStudent == null ? "no enrolment data" : `${totalExp.toLocaleString()} ÷ ${totalEnrolled.toLocaleString()} students`,
    },
    {
      code: "4.c.5", key: "4.c.5",
      ...SDG_FIN_REFERENCE["4.c.5"],
      value: avgRatio, unit: "ratio",
      detail: ratios.length ? `avg of ${ratios.length} institution${ratios.length > 1 ? "s" : ""}` : "no salary data",
    },
  ];

  return { count: n, indicators, institutions: insts };
}
