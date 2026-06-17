// =====================================================================
// DATA VALIDATION RULES  --  EDIT THESE
// =====================================================================
// Declarative rules. One entry per CSV column, grouped by ENTITY.
// `validation.js` reads this file and applies each rule.
// All CSV values arrive as STRINGS -- `type` says how to interpret them.
//
// Per-field options:
//   required : boolean        -- must be present and non-empty
//   type     : "string" | "int" | "float" | "email" | "date" | "enum"
//   min      : number         -- for int/float: numeric min (inclusive)
//   max      : number         -- for int/float: numeric max (inclusive)
//   minLen   : number         -- for string: min length
//   maxLen   : number         -- for string: max length
//   values   : string[]       -- for enum: allowed values
//   pattern  : RegExp         -- extra content check (any type)
//   unique   : boolean        -- no duplicate values across the batch
//
// NOTE: RULI is the GENERATED code (crypto). It is NOT validated as input
// even if present in the CSV -- the app fills/overwrites it. Leave it out
// of the rules below, or set required:false.
// =====================================================================

// ---- TEACHING STAFF columns ----
// Source: OECS Post-Secondary SDG Instrument, table T10 (Teaching Staff Profile)
// -- one row per staff member. Several fields feed SDG 4.c indicators.
export const staffFieldRules = {
  institution: {
    // The post-secondary institution this staff member belongs to. Drives the
    // ministry (per-institution) and admin (per-territory) dashboard rollups.
    required: true,
    type: "string",
    minLen: 1,
    maxLen: 120,
  },
  territory: {
    // Country / OECS territory the institution sits in (name or ISO).
    required: false,
    type: "string",
    maxLen: 60,
  },
  surname: {
    required: true,
    type: "string",
    minLen: 1,
    maxLen: 100,
  },
  first_name: {
    required: true,
    type: "string",
    minLen: 1,
    maxLen: 100,
  },
  classification: {
    // PR = Principal, VP = Vice Principal, HOD = Head of Department, TT = Trained Teacher
    required: false,
    type: "enum",
    values: ["PR", "VP", "HOD", "TT"],
  },
  teacher_type: {
    required: false,
    type: "string",
    maxLen: 50,
  },
  subjects: {
    required: false,
    type: "string",
    maxLen: 200,
  },
  total_periods: {
    required: false,
    type: "int",
    min: 0,
    max: 100,
  },
  years_experience: {
    required: false,
    type: "int",
    min: 0,
    max: 60,
  },
  date_of_birth: {
    required: true,
    type: "date",
  },
  nationality: {
    required: false,
    type: "string",
    maxLen: 60,
  },
  highest_qualification: {
    // SDG 4.c.1 -- minimum-qualification proportion is computed from this.
    required: true,
    type: "enum",
    values: ["PhD", "Masters", "PostGradDiploma", "Bachelors", "Diploma", "CAPE"],
  },
  area_of_specialisation: {
    required: false,
    type: "string",
    maxLen: 100,
  },
  cpd_hours: {
    // SDG 4.c.7 -- CPD (in-service training) hours in the past 12 months.
    required: false,
    type: "int",
    min: 0,
    max: 2000,
  },
  appraised: {
    required: false,
    type: "enum",
    values: ["Y", "N"],
  },
  left_service: {
    // SDG 4.c.6 -- attrition: did this staff member leave service this year?
    required: false,
    type: "enum",
    values: ["Y", "N"],
  },
  sex: {
    // Optional on T10, but enables SDG 4.5.1 gender-parity when present.
    required: false,
    type: "enum",
    values: ["M", "F"],
  },
};

// ---- INSTITUTION columns  --  FILL THIS IN (columns coming) ----
export const institutionFieldRules = {
  // TODO: e.g.
  // institution_id: { required: true, type: "int", unique: true },
  // name:           { required: true, type: "string", minLen: 1, maxLen: 200 },
  // type:           { required: true, type: "enum", values: ["primary", "secondary"] },
};

// Lookup by entity name. route.js picks the set by ?entity=...
export const rulesByEntity = {
  staff: staffFieldRules,
  institution: institutionFieldRules,
};

// Batch-level rules (across all rows). EDIT.
export const batchRules = {
  rejectDuplicateRows: false,   // TODO: implement if you want exact-dup detection
  maxRows: 100000,
};
