// =====================================================================
// JSON HIERARCHY BUILDER
// =====================================================================
// Shape of each output record (entity = "student" or "institution"):
//   {
//     RULI:     <CSPRNG random code>      <-- wired, leave as is
//     metadata: { ... }                 <-- wired below
//     student | institution: { ...original CSV fields }  <-- wired
//     tables:   { ... }                 <-- FILL THIS IN ("other data")
//   }
//
// RULI (the generated code), metadata, and the raw record are done.
// The "other fields / tables" section is left empty for you.
// =====================================================================

import { MIN_QUALIFICATIONS } from "@/lib/sdgIndicators";

// metadata block -- adjust as you like.
export function buildMetadata({ code, salt, hash, rowIndex, createdAt, entity }) {
  return {
    entity,
    codeAlgo: "crypto.randomBytes(16) hex",
    saltAlgo: "crypto.randomBytes(16) hex",
    hashAlgo: "scrypt(code, salt, 32)",
    salt,        // remove if you don't want salt stored in the public record
    hash,        // verification hash of the RULI code
    sourceRow: rowIndex,
    createdAt,
    schemaVersion: 1,
  };
}

// ---- OTHER DATA / TABLES  --  FILL THIS IN ----
// Build whatever extra nested tables you need from the raw record.
// `entity` tells you if it's a student or an institution row.
// Return an object. Leave {} until you decide the structure.
export function buildTables(data, ctx) {
  const tables = {};
  const { entity } = ctx;

  // Teaching staff (instrument T10): self-document which SDG 4.c indicators
  // this row feeds. `data` here is the SAFE record -- names/DOB/nationality
  // have already been split out to the private mapping, so they never appear.
  if (entity === "staff") {
    tables.sdg = {
      qualification: data.highest_qualification ?? null,   // SDG 4.c.1
      minQualified: MIN_QUALIFICATIONS.includes(data.highest_qualification), // SDG 4.c.1
      cpdHours: data.cpd_hours != null ? Number(data.cpd_hours) : null,      // SDG 4.c.7
      cpdInLastYear: Number(data.cpd_hours) > 0,                              // SDG 4.c.7
      leftService: data.left_service === "Y",                                 // SDG 4.c.6
    };
  }

  return tables;
}

// Assembles the final record. Usually no need to edit.
// `entity` becomes the key holding the original CSV row.
export function buildRecord({ code, metadata, entity, data, tables }) {
  return { RULI: code, metadata, [entity]: data, tables };
}
