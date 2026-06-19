import { toMatrix, matrixToRecords } from "@/lib/csv";
import { findHeaderRowIndex } from "@/lib/headerAliases";
import { isRegistryWorkbook, parseRegistryUpload, looksLikeXlsx } from "@/lib/registryWorkbook";
import * as XLSX from "xlsx";

export function parseUploadBrowser(buf, filename = "", entity) {
  const name = String(filename).toLowerCase();
  const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls") || looksLikeXlsx(buf);

  if (isXlsx && isRegistryWorkbook(buf)) {
    return parseRegistryUpload(buf, entity === "student" ? "student" : "staff");
  }

  let matrix;
  if (!isXlsx) {
    const text = new TextDecoder().decode(buf);
    matrix = toMatrix(text);
  } else {
    const wb = XLSX.read(buf, { type: "array" });
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
