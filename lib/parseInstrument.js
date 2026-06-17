// =====================================================================
// OECS POST-SECONDARY SDG INSTRUMENT PARSER
// =====================================================================
// Each upload is ONE workbook with many sheets. We draw from three:
//   Cover      -> Institution name
//   Background -> reporting date period (academic year)
//   Enrolment  -> one row per Programme (T2 table), with the SDG-tagged
//                 enrolment columns (year/sex/PT/FT/nationality/scholarship)
//
// Labels are matched by text (not fixed cell refs) so the parser survives
// rows being inserted above the data in a filled-in return.
// =====================================================================

// Read a sheet as a trimmed string matrix (array of arrays).
function sheetMatrix(XLSX, ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  return rows.map((r) =>
    Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c).trim())) : []
  );
}

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// First non-empty cell to the right of the matched label cell, same row.
function valueRightOf(row, labelCol) {
  for (let c = labelCol + 1; c < row.length; c++) {
    if (String(row[c]).trim() !== "") return String(row[c]).trim();
  }
  return "";
}

// ---- Cover: Institution ----------------------------------------------
function extractInstitution(matrix) {
  for (const row of matrix) {
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]).startsWith("institution")) {
        const v = valueRightOf(row, c);
        if (v) return v;
      }
    }
  }
  return "";
}

// ---- Background: reporting date period --------------------------------
// Row shape: ["Academic Year - October 15","2025","to September 14","2026"]
// Returns { raw, label, startYear, endYear }.
function extractReportPeriod(matrix) {
  for (const row of matrix) {
    const joined = norm(row.join(" "));
    if (joined.includes("academic year")) {
      const cells = row.map((c) => String(c).trim()).filter((c) => c !== "");
      const years = joined.match(/\b(19|20)\d{2}\b/g) || [];
      return {
        raw: cells.join(" "),
        label: cells[0] || "",
        startYear: years[0] || "",
        endYear: years[1] || years[0] || "",
      };
    }
  }
  return { raw: "", label: "", startYear: "", endYear: "" };
}

// ---- Enrolment: programme rows (T2) -----------------------------------
// Canonical column keys, matched against the multi-line header text.
const ENROL_COLS = [
  ["division", "division/department"],
  ["certification", "certification"],
  ["programme", "programme"],
  ["accredited", "accredited"],
  ["isTvet", "is tvet"],
  ["y1m", "year 1 m"], ["y1f", "year 1 f"],
  ["y2m", "year 2 m"], ["y2f", "year 2 f"],
  ["y3m", "year 3 m"], ["y3f", "year 3 f"],
  ["y4m", "year 4 m"], ["y4f", "year 4 f"],
  ["totalPtM", "total pt m"], ["totalPtF", "total pt f"],
  ["totalFtM", "total ft m"], ["totalFtF", "total ft f"],
  ["oecsNatM", "oecs nationals m"], ["oecsNatF", "oecs nationals f"],
  ["otherCaricomM", "other caricom m"], ["otherCaricomF", "other caricom f"],
  ["otherNatM", "other nationality m"], ["otherNatF", "other nationality f"],
  ["odaScholarship", "oda scholarship"],
];

// Find the header row (the one whose cells include "Programme") and build a
// column-index -> canonical-key map by fuzzy-matching the header text.
function mapEnrolHeader(matrix) {
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    const hasProg = row.some((c) => norm(c) === "programme");
    if (!hasProg) continue;
    const colKey = {};
    row.forEach((cell, c) => {
      const n = norm(cell);
      if (!n) return;
      const hit = ENROL_COLS.find(([, label]) => n === label || n.startsWith(label));
      if (hit && colKey[hit[0]] === undefined) colKey[hit[0]] = c;
    });
    return { headerRow: i, colKey };
  }
  return null;
}

const NUM_KEYS = new Set(
  ENROL_COLS.map(([k]) => k).filter(
    (k) => !["division", "certification", "programme", "accredited", "isTvet"].includes(k)
  )
);

function extractEnrolment(matrix) {
  const hdr = mapEnrolHeader(matrix);
  if (!hdr) return [];
  const { headerRow, colKey } = hdr;
  const progCol = colKey.programme;
  const rows = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const prog = progCol != null ? String(row[progCol] || "").trim() : "";
    if (prog === "") continue; // blank programme -> end / skip filler row
    const rec = {};
    for (const [key, col] of Object.entries(colKey)) {
      let v = String(row[col] ?? "").trim();
      if (NUM_KEYS.has(key)) {
        const n = Number(v.replace(/,/g, ""));
        v = v === "" ? 0 : Number.isFinite(n) ? n : v;
      }
      rec[key] = v;
    }
    rows.push(rec);
  }
  return rows;
}

// Does this buffer look like the multi-sheet instrument workbook (as opposed
// to a flat staff/student table)? True when it carries an Enrolment sheet plus
// a Cover or Background sheet -- so a drop-in is routed to the instrument
// parser even if the uploader's Data type dropdown says something else.
export function isInstrumentWorkbook(buf) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const names = wb.SheetNames.map((n) => norm(n));
    const has = (w) => names.includes(norm(w));
    return has("Enrolment") && (has("Cover") || has("Background"));
  } catch {
    return false;
  }
}

// parseInstrument(buffer) -> { institution, reportPeriod, enrolment[] }
export function parseInstrument(buf) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });

  // Tolerant sheet lookup by name (case/space-insensitive).
  const findSheet = (want) => {
    const w = norm(want);
    const name = wb.SheetNames.find((n) => norm(n) === w);
    return name ? wb.Sheets[name] : null;
  };

  const cover = sheetMatrix(XLSX, findSheet("Cover"));
  const background = sheetMatrix(XLSX, findSheet("Background"));
  const enrolment = sheetMatrix(XLSX, findSheet("Enrolment"));

  return {
    institution: extractInstitution(cover),
    reportPeriod: extractReportPeriod(background),
    enrolment: extractEnrolment(enrolment),
  };
}
