import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { computeIndicators, computeGroups } from "@/lib/sdgIndicators";

// SDG dashboard source: the anonymized staff dash records produced by the
// /api/process upload. Only the SAFE record is read here -- no names/DOB
// (those live in staff-mapping.json and are never returned).
const OUT_DIR = path.join(process.cwd(), "data", "output");

async function readJSON(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const records = await readJSON(path.join(OUT_DIR, "staff-records.json"));
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({
      count: 0, indicators: [],
      distributions: { byQualification: [], byClassification: [], byGender: [], cpdBands: [], experienceBands: [] },
      byInstitution: [], byTerritory: [],
    });
  }
  return NextResponse.json({
    ...computeIndicators(records),                  // global rollup
    byInstitution: computeGroups(records, "institution"),
    byTerritory: computeGroups(records, "territory"),
  });
}
