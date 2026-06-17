// =====================================================================
// ENROLMENT DEMO DATA  --  synthetic OECS instrument workbooks
// =====================================================================
// Builds the same shape parseInstrument(buffer) produces, one "workbook"
// per institution:
//   { meta: { institution, territory, academicYear, periodStart, periodEnd },
//     rows: [ programme rows keyed exactly like ENROL_COLS ] }
//
// Every generated row RECONCILES by construction (Σ year == ft+pt == Σ
// nationality, per sex), so lib/validateEnrolment.js accepts it. Two rows
// are deliberately broken at the end to demonstrate the rejected view.
//
// Field keys match lib/parseInstrument.js ENROL_COLS and lib/db.js
// ENROL_SELECT exactly -- no key may exist here that isn't in both.
// =====================================================================

const ACADEMIC_YEAR = "2025/2026";
const PERIOD_START = 2025;
const PERIOD_END = 2026;

// Split `total` into integer buckets by weight (largest-remainder), so the
// parts always sum back to `total`. Used to derive the year / ft-pt /
// nationality cuts of one headcount.
function split(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  // hand the leftover to the largest fractional parts
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) out[order[k % order.length].i] += 1;
  return out;
}

// One programme row. m/f are the male/female headcounts; every disaggregation
// is a partition of those, so the row reconciles.
function prog({ division, certification, programme, accredited, isTvet, m, f, oda = 0 }) {
  const [y1m, y2m, y3m, y4m] = split(m, [4, 3, 2, 1]);
  const [y1f, y2f, y3f, y4f] = split(f, [4, 3, 2, 1]);
  const [totalFtM, totalPtM] = split(m, [5, 1]);
  const [totalFtF, totalPtF] = split(f, [5, 1]);
  const [oecsNatM, otherCaricomM, otherNatM] = split(m, [7, 2, 1]);
  const [oecsNatF, otherCaricomF, otherNatF] = split(f, [7, 2, 1]);
  return {
    division, certification, programme, accredited, isTvet,
    y1m, y1f, y2m, y2f, y3m, y3f, y4m, y4f,
    totalPtM, totalPtF, totalFtM, totalFtF,
    oecsNatM, oecsNatF, otherCaricomM, otherCaricomF, otherNatM, otherNatF,
    odaScholarship: oda,
  };
}

// 9 OECS community colleges, one per member territory. The ingest RPC
// resolves each (institution, territory) pair into the schools/countries
// hierarchy, creating the country + school on first sight.
const INSTITUTIONS = [
  ["Antigua State College", "Antigua and Barbuda"],
  ["Anguilla Community College", "Anguilla"],
  ["H. Lavity Stoutt Community College", "British Virgin Islands"],
  ["Dominica State College", "Dominica"],
  ["T.A. Marryshow Community College", "Grenada"],
  ["Montserrat Community College", "Montserrat"],
  ["Clarence Fitzroy Bryant College", "Saint Kitts and Nevis"],
  ["Sir Arthur Lewis Community College", "Saint Lucia"],
  ["St. Vincent and the Grenadines Community College", "Saint Vincent and the Grenadines"],
];

// Programme templates: [division, certification, programme, accredited, isTvet, baseM, baseF, oda]
// 16 distinct programmes -> a 12-programme slice per institution is unique
// (no two rows in one institution share a programme name, which the unique
// index (school, year, division, programme) would otherwise collapse).
const PROGRAMMES = [
  ["Engineering & Technology", "Associate Degree", "Civil Engineering", "Regionally", "Y", 38, 14, 6],
  ["Engineering & Technology", "Diploma", "Electrical Installation", "Locally", "Y", 30, 4, 0],
  ["Engineering & Technology", "Bachelors", "Mechanical Engineering", "Regionally", "Y", 33, 9, 4],
  ["Business & Management", "Bachelors", "Business Administration", "Internationally", "N", 22, 41, 9],
  ["Business & Management", "Associate Degree", "Accounting", "Regionally", "N", 18, 33, 3],
  ["Business & Management", "Diploma", "Marketing", "Locally", "N", 14, 26, 0],
  ["Health Sciences", "Bachelors", "Nursing", "Internationally", "N", 6, 52, 12],
  ["Health Sciences", "Diploma", "Pharmacy Technician", "Regionally", "Y", 9, 27, 0],
  ["Health Sciences", "Associate Degree", "Medical Laboratory Technology", "Regionally", "Y", 12, 24, 3],
  ["Information Technology", "Associate Degree", "Computer Science", "Regionally", "Y", 34, 19, 5],
  ["Information Technology", "Bachelors", "Software Engineering", "Internationally", "Y", 29, 12, 6],
  ["Humanities & Education", "Bachelors", "Primary Education", "Internationally", "N", 8, 36, 7],
  ["Humanities & Education", "Certificate", "Modern Languages", "Locally", "N", 11, 23, 0],
  ["Humanities & Education", "Associate Degree", "Social Work", "Regionally", "N", 7, 31, 2],
  ["Hospitality & Tourism", "Diploma", "Culinary Arts", "Regionally", "Y", 16, 21, 2],
  ["Hospitality & Tourism", "Associate Degree", "Hospitality Management", "Regionally", "N", 13, 28, 4],
];

const PER_INSTITUTION = 12; // programmes per institution (10-12 target)

// buildEnrolmentDemo() -> [{ meta, rows }] -- one workbook per institution.
// Each institution gets a deterministic 12-programme slice of the templates
// with counts nudged by index, so totals vary across institutions.
export function buildEnrolmentDemo() {
  const workbooks = INSTITUTIONS.map(([institution, territory], idx) => {
    const rows = [];
    for (let j = 0; j < PER_INSTITUTION; j++) {
      const t = PROGRAMMES[(idx + j) % PROGRAMMES.length];
      const bump = ((idx * 3 + j) % 5); // 0..4 deterministic variance
      rows.push(prog({
        division: t[0], certification: t[1], programme: t[2],
        accredited: t[3], isTvet: t[4],
        m: t[5] + bump, f: t[6] + bump, oda: t[7] ? t[7] + (bump % 3) : 0,
      }));
    }
    return {
      meta: { institution, territory, academicYear: ACADEMIC_YEAR, periodStart: PERIOD_START, periodEnd: PERIOD_END },
      rows,
    };
  });

  // --- SEEDED BAD ROWS (demonstrate the rejected view) -----------------
  // 1) invalid isTvet enum on the first institution.
  const bad1 = prog({
    division: "Engineering & Technology", certification: "Diploma",
    programme: "Welding & Fabrication", accredited: "Locally", isTvet: "Yes", m: 20, f: 2,
  });
  workbooks[0].rows.push(bad1);

  // 2) nationality split that doesn't reconcile on the second institution.
  const bad2 = prog({
    division: "Business & Management", certification: "Certificate",
    programme: "Entrepreneurship", accredited: "Locally", isTvet: "N", m: 15, f: 18,
  });
  bad2.otherNatM += 5; // break male reconciliation (nationality now exceeds total)
  workbooks[1].rows.push(bad2);

  return workbooks;
}
