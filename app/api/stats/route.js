import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "data", "output");
const ENTITIES = ["staff", "institution"];

async function readJSON(file) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export async function GET() {
  const entities = [];

  for (const entity of ENTITIES) {
    const recPath = path.join(OUT_DIR, `${entity}-records.json`);
    const mapPath = path.join(OUT_DIR, `${entity}-mapping.json`);
    const rejPath = path.join(OUT_DIR, `${entity}-rejected.json`);
    const records = await readJSON(recPath);
    const mapping = await readJSON(mapPath);
    const rejected = await readJSON(rejPath);
    if (!records) continue;

    let lastUpdated = null;
    const rows = [];
    const columns = ["RULI"];
    for (const r of records) {
      const at = r?.metadata?.createdAt;
      if (at && (!lastUpdated || at > lastUpdated)) lastUpdated = at;

      const data = r?.[entity] ?? {};
      for (const k of Object.keys(data)) {
        if (!columns.includes(k)) columns.push(k);
      }
      rows.push({ ...data, RULI: r?.RULI });
    }

    // RULI -> private mapping (names, DOB, salt) for row expansion
    const mappingByRuli = {};
    if (Array.isArray(mapping)) {
      for (const m of mapping) {
        if (m?.RULI) mappingByRuli[m.RULI] = m;
      }
    }

    // rejected rows (failed validation) -> full original data + errors
    const rejRows = Array.isArray(rejected) ? rejected : [];
    const rejColumns = [];
    for (const r of rejRows) {
      for (const k of Object.keys(r?.data ?? {})) {
        if (!rejColumns.includes(k)) rejColumns.push(k);
      }
    }

    entities.push({
      entity,
      records: records.length,
      mapped: Array.isArray(mapping) ? mapping.length : 0,
      lastUpdated,
      columns,
      rows,
      mappingByRuli,
      rejected: rejRows,
      rejColumns,
    });
  }

  const totalRecords = entities.reduce((s, e) => s + e.records, 0);

  return NextResponse.json({ entities, totalRecords });
}
