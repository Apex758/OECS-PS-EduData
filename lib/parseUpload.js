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

// XLSX files are ZIP archives -> first bytes are "PK".
function looksLikeXlsx(buf) {
  return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
}

// parseUpload(buffer, filename, entity) -> [{ header: value, ... }, ...]
// When `entity` is given, the header row is auto-detected so title/junk rows
// above it are skipped; otherwise row 0 is treated as the header.
export function parseUpload(buf, filename = "", entity) {
  const name = String(filename).toLowerCase();
  const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls") || looksLikeXlsx(buf);

  let matrix;
  if (!isXlsx) {
    matrix = toMatrix(buf.toString("utf8"));
  } else {
    // Lazy require so CSV-only deployments don't pay the xlsx load cost.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const first = wb.SheetNames[0];
    if (!first) return [];
    // header:1 -> array-of-arrays (matrix), so we can find the header row.
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, defval: "", raw: false });
    matrix = rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c).trim())) : []));
  }

  return matrixToRecords(matrix, findHeaderRowIndex(matrix, entity));
}
