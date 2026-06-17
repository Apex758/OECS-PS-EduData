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
    // OECS RMR teacher_classification codes:
    // PRIN=Principal, VPRIN=Vice Principal, DEAN=Dean, HOD=Head of Department,
    // LECT=Lecturer, INST=Instructor, TUTOR=Tutor
    required: false,
    type: "enum",
    values: ["PRIN", "VPRIN", "DEAN", "HOD", "LECT", "INST", "TUTOR"],
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
    // OECS RMR highest_qualification codes:
    // PHD=Doctorate, MAST=Masters, PGD=Post Grad Diploma, BACH=Bachelors,
    // AD=Associate Degree, DIP=Diploma, CERT=Certificate, CAPE=CAPE/A-Levels
    required: true,
    type: "enum",
    values: ["PHD", "MAST", "PGD", "BACH", "AD", "DIP", "CERT", "CAPE"],
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

// ---- STUDENT columns ----
// Source: OECS RMR student-level disaggregation. One row per student,
// described ONLY by coded dimensions (no names) -- privacy-first.
// All enum codes come straight from "RMR and validation_rules.json".
export const studentFieldRules = {
  institution: {
    // Post-secondary institution the student is enrolled in. Drives rollups.
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
  sex: {
    // M, F, U -- enables UIS disaggregation + gender parity.
    required: false,
    type: "enum",
    values: ["M", "F", "U"],
  },
  attendance_mode: {
    // FT=Full Time, PT=Part Time
    required: false,
    type: "enum",
    values: ["FT", "PT"],
  },
  programme_type: {
    // CERT, CAPE, DIP, AD, BACH, MAST, PHD, CVQ
    required: false,
    type: "enum",
    values: ["CERT", "CAPE", "DIP", "AD", "BACH", "MAST", "PHD", "CVQ"],
  },
  qualification_level: {
    // CERT, CAPE, DIP, AD, UG, GRAD, PG, PHD
    required: false,
    type: "enum",
    values: ["CERT", "CAPE", "DIP", "AD", "UG", "GRAD", "PG", "PHD"],
  },
  isced_level: {
    // UNESCO ISCED 2011: post-secondary levels 4-8.
    required: false,
    type: "enum",
    values: ["ISCED4", "ISCED5", "ISCED6", "ISCED7", "ISCED8"],
  },
  cvq_level: {
    // Caribbean Vocational Qualification levels 1-5.
    required: false,
    type: "enum",
    values: ["CVQ1", "CVQ2", "CVQ3", "CVQ4", "CVQ5"],
  },
  age_band: {
    // Raw codes only -- must match exactly (no value aliases; see valueAliases.js).
    required: false,
    type: "enum",
    values: ["<16", "16", "17", "18", "19", "20", "21", "22", "23", "24",
      "25", "26", "27", "28", "29", "30-34", "35-39", "40+", "Unknown"],
  },
  dropout_reason: {
    // FIN, ACAD, EMP, MIG, HLTH, FAM, TRF, DISC, PERS, UNK
    required: false,
    type: "enum",
    values: ["FIN", "ACAD", "EMP", "MIG", "HLTH", "FAM", "TRF", "DISC", "PERS", "UNK"],
  },
};

// ---- INSTITUTION columns ----
// Source: OECS DSF / RMR institution-level fields.
export const institutionFieldRules = {
  institution: {
    // Institution name (the join key to staff/student rollups).
    required: true,
    type: "string",
    minLen: 1,
    maxLen: 200,
  },
  territory: {
    required: false,
    type: "string",
    maxLen: 60,
  },
  institution_status: {
    // ACTIVE, INACTIVE, CLOSED
    required: false,
    type: "enum",
    values: ["ACTIVE", "INACTIVE", "CLOSED"],
  },
  sector_type: {
    // PUB=Public, PRIV=Private, IND=Independent
    required: false,
    type: "enum",
    values: ["PUB", "PRIV", "IND"],
  },
  gender_composition: {
    // COED, MALE, FEMALE
    required: false,
    type: "enum",
    values: ["COED", "MALE", "FEMALE"],
  },
  locality: {
    // URB=Urban, RUR=Rural, REMRUR=Remote-rural
    required: false,
    type: "enum",
    values: ["URB", "RUR", "REMRUR"],
  },
  funding_source: {
    // GOV, DON, PTA, PRIV, OTH
    required: false,
    type: "enum",
    values: ["GOV", "DON", "PTA", "PRIV", "OTH"],
  },
};

// Lookup by entity name. route.js picks the set by ?entity=...
export const rulesByEntity = {
  staff: staffFieldRules,
  student: studentFieldRules,
  institution: institutionFieldRules,
};

// Batch-level rules (across all rows). EDIT.
export const batchRules = {
  rejectDuplicateRows: false,   // TODO: implement if you want exact-dup detection
  maxRows: 100000,
};
