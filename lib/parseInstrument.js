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

function extractTerritory(cover, background) {
  for (const matrix of [cover, background]) {
    for (const row of matrix) {
      for (let c = 0; c < row.length; c++) {
        const cell = norm(row[c]);
        if (
          cell.startsWith("territory")
          || cell.startsWith("country")
          || cell.includes("member state")
          || cell.includes("oecs member")
        ) {
          const v = valueRightOf(row, c);
          if (v) return v;
        }
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

// ---- Background: safety + infrastructure facts (items 1.13–1.18) -------
// Feeds SDG 4.a.1 (facilities/services) and 4.a.3 (safety). Labels are matched
// by text so inserted rows don't break it. A filled form marks the Yes/No
// checkbox (☑ / ✓) or types an explicit "Yes"/"No"; counts are read as the
// first integer on the row. Returns a flat facts object (blanks where absent).
const BG_QUESTIONS = [
  ["strategicPlan", "strategic plan", "yn"],       // 1.13
  ["disasterPlan", "disaster management", "yn"],   // 1.14 -> 4.a.3
  ["emergencyDrills", "emergency drills", "int"],  // 1.15 -> 4.a.3
  ["disabilityAccess", "accessible to students with disab", "yn"], // 1.16 -> 4.a.1
  ["nrenMember", "nren", "yn"],                    // 1.17 -> 4.a.1
  ["researchStaff", "academic research", "mf"],    // 1.18 -> 4.c.1
];

// A checkbox cell counts as ticked when it carries a filled-box / check glyph
// (☑ ☒ ✓ ✔) or a bracketed x -- as opposed to the empty ☐ on a blank form.
const isTicked = (s) => /[☑☒✓✔]/.test(String(s)) || /\[\s*x\s*\]/i.test(String(s));

// Resolve a Yes/No question from its row: a ticked "Yes"/"No" cell wins; else
// an explicit standalone Yes/No/Y/N token; else "" (unanswered).
function ynAnswer(row) {
  // Combined "Yes ☑  No ☐" / "Yes ☐  No ☑" in one cell: the tick follows the
  // chosen label, so anchor on label-then-mark.
  for (const cell of row) {
    const s = String(cell);
    if (/yes\s*[☑☒✓✔]/i.test(s)) return "Y";
    if (/no\s*[☑☒✓✔]/i.test(s)) return "N";
  }
  for (const cell of row) {
    const c = norm(cell);
    if (!c) continue;
    if (isTicked(cell)) {
      if (/\byes\b/.test(c)) return "Y";
      if (/\bno\b/.test(c)) return "N";
    }
  }
  for (const cell of row) {
    const c = norm(cell);
    if (c === "yes" || c === "y") return "Y";
    if (c === "no" || c === "n") return "N";
  }
  return "";
}

// Integers from a row's ANSWER cells (col 0 = label). Only whole-number cells
// count -- this skips the "SDG 4.a.3" tag column and "Yes ☐"/label text, so a
// blank form yields no phantom counts.
function intsOf(row) {
  const out = [];
  for (let c = 1; c < row.length; c++) {
    const cell = String(row[c]).trim();
    if (/^-?\d+$/.test(cell)) out.push(parseInt(cell, 10));
  }
  return out;
}

function extractBackground(matrix) {
  const facts = {};
  let any = false;
  for (const [key, phrase, kind] of BG_QUESTIONS) {
    const row = matrix.find((r) => norm(r.join(" ")).includes(phrase));
    if (!row) continue;
    if (kind === "yn") {
      const v = ynAnswer(row);
      if (v) { facts[key] = v; any = true; }
    } else if (kind === "int") {
      const ns = intsOf(row);
      if (ns.length) { facts[key] = ns[0]; any = true; }
    } else if (kind === "mf") {
      const ns = intsOf(row);
      if (ns.length) { facts.researchStaffM = ns[0] ?? null; facts.researchStaffF = ns[1] ?? null; any = true; }
    }
  }
  return any ? facts : null;
}

// ---- Finance: revenue / expenditure / equity / salary (T13) -----------
// Feeds SDG 4.5.3 (equity funding), 4.5.4 (expenditure per student), 4.c.5
// (teacher salary ratio); 4.5.6 (% GDP) and 4.5.5 (ODA share) need external
// GDP / national-ODA inputs the instrument doesn't carry, so only the local
// expenditure side is captured. Returns a flat facts object (or null).
const moneyOf = (cell) => {
  const s = String(cell).replace(/[,$\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

// First label cell (row-major) whose normalized text includes `phrase`.
function findLabel(matrix, phrase) {
  for (const row of matrix) {
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]).includes(phrase)) return { row, col: c };
    }
  }
  return null;
}

// First pure-number cell to the right of a label; falls back to the cell below.
function numByPhrase(matrix, phrase) {
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    for (let c = 0; c < row.length; c++) {
      if (!norm(row[c]).includes(phrase)) continue;
      for (let k = c + 1; k < row.length; k++) {
        const m = moneyOf(row[k]);
        if (m !== null) return m;
      }
      const below = matrix[i + 1];
      if (below) {
        const m = moneyOf(below[c + 1]) ?? moneyOf(below[c]);
        if (m !== null) return m;
      }
      return null;
    }
  }
  return null;
}

function extractFinance(matrix) {
  const fin = {};
  let meaningful = false;
  const mark = (k, v) => { if (v != null) { fin[k] = v; if (typeof v !== "number" || v !== 0) meaningful = true; } };

  // Revenue + recurrent-expenditure totals share the "TOTAL" row (revenue in
  // the left block, expenditure in the right) -> first two number cells.
  const totalRow = matrix.find((r) => r.some((c) => norm(c) === "total"));
  if (totalRow) {
    const nums = totalRow.map(moneyOf).filter((m) => m !== null);
    if (nums.length >= 1) mark("totalRevenue", nums[0]);
    if (nums.length >= 2) mark("totalExpenditure", nums[1]);
  }
  mark("teachingEmoluments", numByPhrase(matrix, "- teaching staff"));

  // 4.5.3 equity funding mechanism (Y/N + value + description).
  const eq = findLabel(matrix, "formal mechanism to reallocate");
  if (eq) { const v = ynAnswer(eq.row); if (v) mark("equityMechanism", v); }
  mark("equityValue", numByPhrase(matrix, "total value of equity"));
  const desc = findLabel(matrix, "describe the mechanism");
  if (desc) { const t = valueRightOf(desc.row, desc.col); if (t) mark("equityDescription", t); }

  // 4.c.5 teacher salary relative ratio.
  mark("avgTeacherSalary", numByPhrase(matrix, "average annual salary of full-time teaching"));
  mark("comparatorSalary", numByPhrase(matrix, "comparable qualifications"));
  mark("salaryRatio", numByPhrase(matrix, "ratio (teacher salary"));

  return meaningful ? fin : null;
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
  const finance = sheetMatrix(XLSX, findSheet("Finance"));

  return {
    institution: extractInstitution(cover),
    territory: extractTerritory(cover, background),
    reportPeriod: extractReportPeriod(background),
    background: extractBackground(background),
    finance: extractFinance(finance),
    enrolment: extractEnrolment(enrolment),
  };
}
