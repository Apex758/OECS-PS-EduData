// Generate uploadable OECS instrument workbooks (one .xlsx per institution)
// from the same demo dataset /api/demo injects. Each workbook has the sheets
// parseInstrument reads: Cover (institution), Background (academic year + the
// 1.13–1.18 safety/facility answers -> SDG 4.a.1/4.a.3), Finance (T13 revenue/
// expenditure/equity/salary -> SDG 4.5.3/4.5.4/4.c.5), and Enrolment (programme
// rows). Drop any of these into the uploader with data type = Enrolment.
//
//   node db/gen-enrolment-workbooks.mjs
//
// Output: data/samples/enrolment/<institution>.xlsx
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import xlsx from "xlsx";
import { buildEnrolmentDemo } from "../lib/enrolmentDemoData.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "samples", "enrolment");

// canonical key -> human header (header text must match lib/parseInstrument.js
// ENROL_COLS labels under normalization: lowercased, single-spaced).
const COLS = [
  ["division", "Division/Department"],
  ["certification", "Certification"],
  ["programme", "Programme"],
  ["accredited", "Accredited"],
  ["isTvet", "Is TVET"],
  ["y1m", "Year 1 M"], ["y1f", "Year 1 F"],
  ["y2m", "Year 2 M"], ["y2f", "Year 2 F"],
  ["y3m", "Year 3 M"], ["y3f", "Year 3 F"],
  ["y4m", "Year 4 M"], ["y4f", "Year 4 F"],
  ["totalPtM", "Total PT M"], ["totalPtF", "Total PT F"],
  ["totalFtM", "Total FT M"], ["totalFtF", "Total FT F"],
  ["oecsNatM", "OECS Nationals M"], ["oecsNatF", "OECS Nationals F"],
  ["otherCaricomM", "Other CARICOM M"], ["otherCaricomF", "Other CARICOM F"],
  ["otherNatM", "Other Nationality M"], ["otherNatF", "Other Nationality F"],
  ["odaScholarship", "ODA Scholarship"],
];

const safe = (s) => String(s).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Combined Yes/No checkbox cell with the ticked side parseInstrument detects.
const tick = (yn) => (yn === "Y" ? "Yes ☑  No ☐" : yn === "N" ? "Yes ☐  No ☑" : "Yes ☐  No ☐");

mkdirSync(OUT, { recursive: true });
const workbooks = buildEnrolmentDemo();

for (const { meta, rows } of workbooks) {
  const wb = xlsx.utils.book_new();

  // Cover: label + value to the right (matches extractInstitution).
  const cover = [["OECS Post-Secondary SDG Instrument"], [], ["Institution", meta.institution]];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(cover), "Cover");

  // Background: reporting period + the 1.13–1.18 answers (label text contains
  // the phrases extractBackground matches on; answers in the cells to the right).
  const b = meta.background || {};
  const bg = [
    ["Reporting Period"],
    [],
    ["Academic Year", String(meta.periodStart), "to", String(meta.periodEnd)],
    [],
    ["1.13 Does the institution have a strategic plan?", tick(b.strategicPlan)],
    ["1.14 Does the institution have a Disaster Management Plan?", tick(b.disasterPlan)],
    ["1.15 Emergency drills conducted in past year — how many?", b.emergencyDrills ?? 0],
    ["1.16 Are all areas accessible to students with disabilities?", tick(b.disabilityAccess)],
    ["1.17 Is the institution a member of the OECS NREN?", tick(b.nrenMember)],
    ["1.18 Number of teaching staff undertaking academic research (M / F)", b.researchStaffM ?? 0, b.researchStaffF ?? 0],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(bg), "Background");

  // Finance (T13): revenue/expenditure totals, equity mechanism, salary ratio.
  // Layout mirrors the instrument's label phrases extractFinance matches on.
  const f = meta.finance || {};
  const fin = [
    ["T13. Revenue and Recurrent Expenditure"],
    [],
    ["REVENUE", "Amount", "RECURRENT EXPENDITURE", "Amount"],
    ["Government", f.totalRevenue ?? 0, "  - Teaching Staff", f.teachingEmoluments ?? 0],
    ["TOTAL", f.totalRevenue ?? 0, "TOTAL", f.totalExpenditure ?? 0],
    [],
    ["SDG 4.5.3 — Equity Funding Mechanism"],
    ["Does the institution have a formal mechanism to reallocate resources to disadvantaged groups?", tick(f.equityMechanism)],
    ["If yes, describe the mechanism", f.equityDescription ?? ""],
    ["What is the total value of equity-targeted funding in the previous academic year?", f.equityValue ?? 0],
    [],
    ["SDG 4.c.5 — Average Teacher Salary Relative to Other Professions"],
    ["Average annual salary of full-time teaching staff (Local Currency):", f.avgTeacherSalary ?? 0],
    ["Average annual salary of professions requiring comparable qualifications:", f.comparatorSalary ?? 0],
    ["Ratio (teacher salary ÷ comparator salary):", f.salaryRatio ?? 0],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(fin), "Finance");

  // Enrolment: header row + one row per programme, columns in COLS order.
  const header = COLS.map(([, label]) => label);
  const body = rows.map((r) => COLS.map(([k]) => r[k]));
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([header, ...body]), "Enrolment");

  const file = join(OUT, `${safe(meta.institution)}.xlsx`);
  writeFileSync(file, xlsx.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log(`wrote ${file}  (${rows.length} programmes)`);
}

console.log(`\n${workbooks.length} workbooks in ${OUT}`);
