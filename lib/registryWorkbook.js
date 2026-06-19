// Combined registry workbook (Cover / Background / Teachers / Students sheets).
import * as XLSX from "xlsx";
import { matrixToRecords } from "@/lib/csv";
import { detectEntity, findHeaderRowIndex } from "@/lib/headerAliases";

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function looksLikeXlsx(buf) {
  return buf.byteLength >= 2 && new Uint8Array(buf)[0] === 0x50 && new Uint8Array(buf)[1] === 0x4b;
}

function sheetMatrix(wb, name) {
  const want = norm(name);
  const sheetName = wb.SheetNames.find((n) => norm(n) === want);
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false });
  return rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c).trim())) : []));
}

function valueRightOf(row, labelCol) {
  for (let c = labelCol + 1; c < row.length; c++) {
    if (String(row[c]).trim() !== "") return String(row[c]).trim();
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

function extractInstitution(cover, background) {
  for (const matrix of [cover, background]) {
    for (const row of matrix) {
      for (let c = 0; c < row.length; c++) {
        const cell = norm(row[c]);
        if (cell.startsWith("institution") || cell.includes("name of institution")) {
          const v = valueRightOf(row, c);
          if (v) return v;
        }
      }
    }
  }
  return "";
}

function extractReportPeriod(background) {
  for (const row of background) {
    const joined = norm(row.join(" "));
    if (joined.includes("academic year")) {
      const years = joined.match(/\b(19|20)\d{2}\b/g) || [];
      return {
        startYear: years[0] || "",
        endYear: years[1] || years[0] || "",
        raw: row.filter(Boolean).join(" "),
      };
    }
  }
  return { startYear: "", endYear: "", raw: "" };
}

function readWorkbook(buf) {
  return XLSX.read(buf, { type: buf instanceof ArrayBuffer ? "array" : "buffer" });
}

export function isRegistryWorkbook(buf) {
  try {
    const wb = readWorkbook(buf);
    const names = wb.SheetNames.map((n) => norm(n));
    const has = (w) => names.includes(w);
    const hasRegistrySheet = has("teachers") || has("teacher") || has("students") || has("student");
    const hasMeta = has("cover") || has("background");
    return hasRegistrySheet && hasMeta;
  } catch {
    return false;
  }
}

function registrySheetName(wb, kind) {
  const names = wb.SheetNames.map((n) => norm(n));
  if (kind === "staff") {
    const idx = names.findIndex((n) => n === "teachers" || n === "teacher");
    return idx >= 0 ? wb.SheetNames[idx] : null;
  }
  const idx = names.findIndex((n) => n === "students" || n === "student");
  return idx >= 0 ? wb.SheetNames[idx] : null;
}

function sheetEntityKind(sheetNorm) {
  if (sheetNorm === "teachers" || sheetNorm === "teacher") return "staff";
  if (sheetNorm === "students" || sheetNorm === "student") return "student";
  return null;
}

export function detectRegistryEntity(buf) {
  if (!isRegistryWorkbook(buf)) return null;
  const wb = readWorkbook(buf);
  let best = null;
  let bestScore = 0;
  for (const name of wb.SheetNames) {
    const kind = sheetEntityKind(norm(name));
    if (!kind) continue;
    const matrix = sheetMatrix(wb, name);
    if (!matrix.length) continue;
    const headerIdx = findHeaderRowIndex(matrix, kind);
    const headers = matrix[headerIdx] || [];
    const score = headers.length ? (detectEntity(headers) === kind ? 10 : 0) : 0;
    const headerCount = headers.filter(Boolean).length;
    const total = score + headerCount;
    if (total > bestScore) {
      bestScore = total;
      best = kind;
    }
  }
  return best || "staff";
}

function coalesceStaffFields(row) {
  const out = { ...row };
  const type = String(out.teacher_type || "").trim();
  const cls = String(out.classification || "").trim();
  const classTokens = ["PR", "PRIN", "VP", "VPRIN", "DEAN", "HOD", "LECT", "INST", "TUTOR"];
  if (!cls && type && classTokens.includes(type.toUpperCase())) {
    out.classification = type;
    out.teacher_type = "";
  }
  if (out.sex) {
    const s = String(out.sex).trim().toLowerCase();
    if (s === "female") out.sex = "F";
    else if (s === "male") out.sex = "M";
  }
  return out;
}

function coalesceStudentFields(row) {
  const out = { ...row };
  if (out.sex) {
    const s = String(out.sex).trim().toLowerCase();
    if (s === "female") out.sex = "F";
    else if (s === "male") out.sex = "M";
  }
  const fte = String(out.attendance_mode || out.is_fte || "").trim().toUpperCase();
  if (fte === "Y") out.attendance_mode = "FT";
  else if (fte === "N") out.attendance_mode = "PT";
  const age = String(out.age_band || out.age || "").trim();
  if (age && /^\d+$/.test(age)) out.age_band = age;
  return out;
}

export function parseRegistryUpload(buf, entity = "staff") {
  const wb = readWorkbook(buf);
  const cover = sheetMatrix(wb, "Cover");
  const background = sheetMatrix(wb, "Background");
  const institution = extractInstitution(cover, background);
  const territory = extractTerritory(cover, background);
  const period = extractReportPeriod(background);
  const academicYear =
    period.startYear && period.endYear ? `${period.startYear}/${period.endYear}` : period.raw || "";

  const sheetName = registrySheetName(wb, entity);
  if (!sheetName) return [];

  const matrix = sheetMatrix(wb, sheetName);
  const headerIdx = findHeaderRowIndex(matrix, entity);
  let rows = matrixToRecords(matrix, headerIdx);

  rows = rows.map((row) => {
    let next = { ...row };
    if (institution && !next.institution) next.institution = institution;
    if (territory && !next.territory) next.territory = territory;
    if (academicYear && !next.academic_year) next.academic_year = academicYear;
    next = entity === "staff" ? coalesceStaffFields(next) : coalesceStudentFields(next);
    return next;
  });

  return rows;
}

export { looksLikeXlsx };
