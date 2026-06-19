import { readFileSync, existsSync } from "fs";
import { join } from "path";

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const cols = lines[0].split(",").map((c) => c.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? "").trim()]));
  });
}

/** Load data/countries.csv — canonical OECS territory list + L2 approval flag. */
export function readCountriesCsv(root = process.cwd()) {
  const path = join(root, "data", "countries.csv");
  if (!existsSync(path)) return [];
  return parseCsv(readFileSync(path, "utf8")).map((row) => ({
    iso: row.country_iso,
    name: row.country_name,
    approvalRequired: String(row.approval_required).toLowerCase() === "true",
  }));
}

export function ministerDemoEmail(iso) {
  return `minister.${String(iso || "").toLowerCase()}@demo.local`;
}
