// =====================================================================
// FILE PARSER  --  CSV + XLSX -> header-keyed row objects
// =====================================================================
// Detects the format by extension (falling back to magic bytes) and
// returns the SAME shape parseCSV produces: an array of objects keyed by
// the header row, every value a trimmed string. The pipeline downstream
// (normalizeHeaders, validation) is format-agnostic from here on.
//
// Google Sheets is NOT handled here -- it's pulled separately (Sheets API
// on a schedule) and exported to CSV before hitting this code path.
// =====================================================================

import { toMatrix, matrixToRecords } from "@/lib/csv";
import { findHeaderRowIndex } from "@/lib/headerAliases";
import { isRegistryWorkbook, parseRegistryUpload, looksLikeXlsx } from "@/lib/registryWorkbook";

// parseUpload(buffer, filename, entity) -> [{ header: value, ... }, ...]
// When `entity` is given, the header row is auto-detected so title/junk rows
// above it are skipped; otherwise row 0 is treated as the header.
export function parseUpload(buf, filename = "", entity) {
  const name = String(filename).toLowerCase();
  const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls") || looksLikeXlsx(buf);

  if (isXlsx && isRegistryWorkbook(buf)) {
    return parseRegistryUpload(buf, entity === "student" ? "student" : "staff");
  }

  let matrix;
  if (!isXlsx) {
    matrix = toMatrix(buf.toString("utf8"));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName =
      entity === "student"
        ? wb.SheetNames.find((n) => /students?/i.test(n)) || wb.SheetNames[0]
        : entity === "staff"
          ? wb.SheetNames.find((n) => /teachers?/i.test(n)) || wb.SheetNames[0]
          : wb.SheetNames[0];
    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false });
    matrix = rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c).trim())) : []));
  }

  return matrixToRecords(matrix, findHeaderRowIndex(matrix, entity));
}
