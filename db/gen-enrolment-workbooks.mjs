// Generate uploadable OECS instrument workbooks (one .xlsx per institution)
// from the same demo dataset /api/demo injects. Each workbook has the three
// sheets parseInstrument reads: Cover (institution), Background (academic
// year), Enrolment (programme rows). Drop any of these into the uploader with
// data type = Enrolment.
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

mkdirSync(OUT, { recursive: true });
const workbooks = buildEnrolmentDemo();

for (const { meta, rows } of workbooks) {
  const wb = xlsx.utils.book_new();

  // Cover: label + value to the right (matches extractInstitution).
  const cover = [["OECS Post-Secondary SDG Instrument"], [], ["Institution", meta.institution]];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(cover), "Cover");

  // Background: a row carrying "Academic Year" + the start/end years.
  const bg = [["Reporting Period"], [], ["Academic Year", String(meta.periodStart), "to", String(meta.periodEnd)]];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(bg), "Background");

  // Enrolment: header row + one row per programme, columns in COLS order.
  const header = COLS.map(([, label]) => label);
  const body = rows.map((r) => COLS.map(([k]) => r[k]));
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([header, ...body]), "Enrolment");

  const file = join(OUT, `${safe(meta.institution)}.xlsx`);
  writeFileSync(file, xlsx.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log(`wrote ${file}  (${rows.length} programmes)`);
}

console.log(`\n${workbooks.length} workbooks in ${OUT}`);
