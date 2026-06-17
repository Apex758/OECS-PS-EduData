// Minimal CSV parser. Handles quoted fields and commas inside quotes.
// First row = header. Returns array of objects keyed by header.
export function parseCSV(text) {
  return matrixToRecords(toMatrix(text), 0);
}

// CSV text -> matrix (array of arrays of trimmed cell strings). Lets callers
// inspect raw rows (e.g. to auto-detect which row is the header) before
// committing to "row 0 = headers".
export function toMatrix(text) {
  return splitRows(String(text).trim()).map((r) => parseLine(r).map((c) => c.trim()));
}

// matrix + header row index -> array of header-keyed row objects. Rows ABOVE
// headerIdx (junk/title rows) are skipped; fully-blank rows are dropped.
export function matrixToRecords(matrix, headerIdx = 0) {
  if (!Array.isArray(matrix) || matrix.length <= headerIdx) return [];
  const headers = (matrix[headerIdx] || []).map((h) => String(h ?? "").trim());
  const records = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    if (cells.every((c) => String(c ?? "").trim() === "")) continue; // blank row
    const obj = {};
    headers.forEach((h, idx) => {
      if (h === "") return;
      obj[h] = String(cells[idx] ?? "").trim();
    });
    records.push(obj);
  }
  return records;
}

function splitRows(text) {
  // Split on newlines that are NOT inside quotes.
  const rows = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      rows.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur !== "") rows.push(cur);
  return rows;
}

function parseLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}
