// =====================================================================
// HEADER ALIASES  --  EDIT THESE
// =====================================================================
// Institutions name their CSV columns differently. One school writes
// "gender", another writes "sex" or "Sex / Gender". This file maps every
// CANONICAL field name (the keys used in validationRules.js) to the list
// of ALIASES we accept for it on upload.
//
// Matching is FUZZY: case, spaces, underscores, hyphens and dots are
// ignored. So "First Name", "first-name", "FIRST_NAME" and "firstname"
// all collapse to the same thing -- you do NOT need to list every casing.
// List only genuinely different WORDS (dob, birthday, forename, ...).
//
// The canonical name itself is always accepted; no need to repeat it.
//
// Used by `normalizeHeaders()` below as a POST-PROCESSING step, called
// after parseCSV() and before validation -- it rewrites each record's
// keys to canonical names so the rules in validationRules.js just work.
// =====================================================================

// ---- TEACHING STAFF header aliases (instrument table T10) ----
export const staffHeaderAliases = {
  institution:           ["college", "campus", "school", "institution_name", "inst", "institution_name", "centre", "center"],
  territory:             ["country", "country_name", "state", "island", "member_state"],
  surname:               ["lastname", "last_name", "lname", "family_name", "familyname", "sur_name"],
  first_name:            ["firstname", "fname", "given_name", "givenname", "forename", "first"],
  classification:        ["class", "role", "position", "rank", "post"],
  teacher_type:          ["type", "staff_type", "employment_type", "teacher_type"],
  subjects:              ["subject", "subjects_taught", "subject_taught", "subjects_s_taught", "subjects_taught"],
  programme_name:        ["programme", "program", "program_name"],
  teacher_no:            ["teacher_number", "teacherno", "staff_no", "staff_number"],
  total_periods:         ["periods", "total_periods_taught", "periods_taught", "no_of_periods"],
  years_experience:      ["experience", "years_teaching", "years_teaching_experience", "yrs_experience", "teaching_experience"],
  date_of_birth:         ["dob", "birthdate", "birth_date", "birthday", "dateofbirth", "d_o_b", "born"],
  nationality:           ["nation", "citizenship", "country_of_nationality"],
  highest_qualification: ["qualification", "qual", "highest_qual", "highestqualification", "highest_degree", "qualifications"],
  area_of_specialisation:["specialisation", "specialization", "area", "area_of_specialization", "specialism"],
  cpd_hours:             ["cpd", "cpdhours", "cpd_hours_past_year", "cpd_hours_past_yr", "inservice_hours", "in_service_hours", "training_hours"],
  appraised:             ["appraised_last_year", "appraised_last_yr", "was_appraised"],
  left_service:          ["attrition", "left", "resigned", "left_service_this_year", "left_this_year", "exited"],
  sex:                   ["gender", "gender_sex", "sex_gender"],
};

// ---- STUDENT header aliases (OECS RMR student-level) ----
export const studentHeaderAliases = {
  institution:         ["college", "campus", "school", "institution_name", "inst", "centre", "center"],
  territory:           ["country", "country_name", "state", "island", "member_state"],
  sex:                 ["gender", "gender_sex", "sex_gender", "student_gender"],
  attendance_mode:     ["attendance", "mode", "enrolment_mode", "enrollment_mode", "study_mode", "is_fte", "isfte", "studentisfte"],
  programme_type:      ["programme", "program", "course_type", "programme_of_study", "program_type"],
  qualification_level: ["qual_level", "qualification", "level_of_qualification", "certification_type"],
  isced_level:         ["isced", "isced_2011", "isced_code"],
  cvq_level:           ["cvq", "cvq_lvl", "vocational_level"],
  age_band:            ["age", "age_group", "ageband", "age_range", "age_at_time_of_reporting", "ageattimeofreporting"],
  is_fte:              ["student_is_fte"],
  programme_name:      ["programme_name", "program_name"],
  student_no:          ["student_number", "studentno"],
  dropout_reason:      ["reason_left", "withdrawal_reason", "reason_for_leaving", "exit_reason", "dropout"],
};

// ---- INSTITUTION header aliases (OECS DSF / RMR) ----
export const institutionHeaderAliases = {
  institution:        ["name", "institution_name", "school_name", "college", "school"],
  territory:          ["country", "country_name", "state", "island", "member_state"],
  institution_status: ["status", "operational_status"],
  sector_type:        ["sector", "ownership", "type", "category"],
  gender_composition: ["composition", "gender_mix", "coed_status"],
  locality:           ["location", "area", "urban_rural", "setting"],
  funding_source:     ["funding", "funded_by", "source_of_funding", "finance_source"],
};

// Lookup by entity name (mirrors rulesByEntity).
export const aliasesByEntity = {
  staff: staffHeaderAliases,
  student: studentHeaderAliases,
  institution: institutionHeaderAliases,
};

// =====================================================================
// NORMALIZE KEY  --  fuzzy-match helper
// =====================================================================
// Strips everything but letters/digits and lowercases, so all the
// cosmetic variants of a header collapse to one comparable token.
function canon(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Registry spreadsheets prefix columns (Teacher_First Name, Student_Gender, …).
function lookupCanonical(header, reverse) {
  const c = canon(header);
  if (reverse[c]) return reverse[c];
  for (const prefix of ["teacher", "student", "course"]) {
    if (c.startsWith(prefix)) {
      const rest = c.slice(prefix.length);
      if (reverse[rest]) return reverse[rest];
    }
  }
  return null;
}

// Build { normalizedAlias -> canonicalField } for one entity.
// Canonical name is registered first so it always wins.
function buildReverseMap(entity) {
  const aliasMap = aliasesByEntity[entity] || {};
  const reverse = {};
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    reverse[canon(canonical)] = canonical;
    for (const a of aliases) reverse[canon(a)] = canonical;
  }
  return reverse;
}

// =====================================================================
// detectEntity(headers)  --  auto-identify the record type from columns
// =====================================================================
// Scores each entity by how many of the file's headers map to one of its
// canonical fields (via that entity's alias table). Best-scoring entity wins.
// Returns null if nothing scores at least DETECT_MIN_MATCHES so callers can
// fall back. Lets the UI drop the "Data type" dropdown entirely.
const DETECT_MIN_MATCHES = 2;

export function detectEntity(headers) {
  if (!Array.isArray(headers) || headers.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const entity of Object.keys(aliasesByEntity)) {
    const reverse = buildReverseMap(entity);
    const seen = new Set();
    let score = 0;
    for (const h of headers) {
      const c = lookupCanonical(h, reverse);
      if (c && !seen.has(c)) { seen.add(c); score++; }
    }
    if (score > bestScore) { bestScore = score; best = entity; }
  }
  return bestScore >= DETECT_MIN_MATCHES ? best : null;
}

// =====================================================================
// findHeaderRowIndex(matrix, entity)  --  auto-detect the header row
// =====================================================================
// Google Sheets / spreadsheets often carry junk above the real header: a
// title, blank rows, a logo, notes. "Row 0 = headers" then grabs garbage.
// This scans the first rows and returns the index of the one that looks
// MOST like a header — i.e. the row whose cells match the most known field
// names/aliases. Returns 0 if nothing scores above the threshold (so plain,
// well-formed files are unaffected).
const HEADER_SCAN_ROWS = 20;
const HEADER_MIN_MATCHES = 2;

export function findHeaderRowIndex(matrix, entity) {
  if (!Array.isArray(matrix) || matrix.length === 0) return 0;
  const reverse = buildReverseMap(entity);
  if (Object.keys(reverse).length === 0) return 0; // unknown entity -> no-op

  let bestIdx = 0;
  let bestScore = 0;
  const limit = Math.min(HEADER_SCAN_ROWS, matrix.length);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    const seen = new Set();
    let score = 0;
    for (const cell of row) {
      const canonical = lookupCanonical(cell, reverse);
      if (canonical && !seen.has(canonical)) { seen.add(canonical); score++; }
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestScore >= HEADER_MIN_MATCHES ? bestIdx : 0;
}

// =====================================================================
// normalizeHeaders(records, entity)  --  POST-PROCESSING VALIDATION
// =====================================================================
// Rewrites every record's keys to canonical field names using the alias
// table, then reports what it did. Returns:
//   {
//     records:   [...]    // same rows, keys renamed to canonical
//     applied:   [{ from, to }]   // aliases that were remapped (info)
//     unknown:   ["foo"]          // headers matching NO field/alias (warn)
//     collisions:[{ canonical, from:[...] }]  // 2+ columns -> same field
//   }
// `unknown` and `collisions` are surfaced as warnings by the caller; they
// do not by themselves reject the upload (the rules still decide that).
export function normalizeHeaders(records, entity) {
  const reverse = buildReverseMap(entity);

  if (records.length === 0) {
    return { records, applied: [], unknown: [], collisions: [] };
  }

  // Header set comes from the first row (parseCSV gives every row the same keys).
  const headers = Object.keys(records[0]);

  const rename = {};          // original header -> canonical
  const appliedSet = new Map();
  const unknown = [];
  const targets = {};         // canonical -> [original headers mapping to it]

  for (const h of headers) {
    const canonical = lookupCanonical(h, reverse);
    if (!canonical) {
      unknown.push(h);
      continue;
    }
    rename[h] = canonical;
    if (h !== canonical) appliedSet.set(h, canonical);
    (targets[canonical] ||= []).push(h);
  }

  // Two different columns mapping to the same canonical field = ambiguous.
  const collisions = Object.entries(targets)
    .filter(([, from]) => from.length > 1)
    .map(([canonical, from]) => ({ canonical, from }));

  // Apply the rename to every record. Unknown headers are kept as-is so
  // nothing is silently dropped; validation just ignores them.
  const out = records.map((rec) => {
    const next = {};
    for (const [k, v] of Object.entries(rec)) {
      next[rename[k] || k] = v;
    }
    return next;
  });

  const applied = [...appliedSet].map(([from, to]) => ({ from, to }));
  return { records: out, applied, unknown, collisions };
}
