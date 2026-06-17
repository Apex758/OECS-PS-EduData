// =====================================================================
// SENSITIVE FIELD BLOCKLIST  --  EDIT THESE
// =====================================================================
// Canonical field names that are PII / sensitive. On upload these are
// BLOCKED from the dash record (<entity>-records.json that gets transferred
// to the dashboard) and kept ONLY in the secure link table
// (<entity>-mapping.json), alongside RULI + salt.
//
// So the split is:
//   dash record   = RULI, metadata, <entity>:{ NON-sensitive fields }, tables
//   mapping (safe) = { RULI, salt, <entity>:{ sensitive fields only } }
//
// Names go here. Add/remove fields as policy changes. Matching is FUZZY
// (same canon() rule as headerAliases): case/spaces/_/-/. ignored.
// Use the CANONICAL names from validationRules.js.
// =====================================================================

export const sensitiveFields = {
  // ---- TEACHING STAFF sensitive (PII) ----
  // Names + DOB + nationality directly identify a person -> mapping only.
  staff: [
    "surname",
    "first_name",
    "date_of_birth",
    "nationality",
  ],

  // ---- STUDENT sensitive (PII) ----
  // RMR student rows are coded dimensions only -- no names/DOB -> nothing to
  // hide from the dash record. RULI is still generated per row by the pipeline.
  student: [],

  // ---- INSTITUTION sensitive  --  institution fields are non-PII ----
  institution: [],
};

// Strip everything but letters/digits, lowercase -- mirrors headerAliases.canon.
function canon(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Is this field blocked from the dash record for this entity?
export function isSensitive(field, entity) {
  const list = sensitiveFields[entity] || [];
  const c = canon(field);
  return list.some((f) => canon(f) === c);
}

// Split a record into { safe, sensitive } by the blocklist.
//   safe      -> goes to the dash record
//   sensitive -> goes to the mapping ONLY
export function splitSensitive(data, entity) {
  const safe = {};
  const sensitive = {};
  for (const [k, v] of Object.entries(data)) {
    if (isSensitive(k, entity)) sensitive[k] = v;
    else safe[k] = v;
  }
  return { safe, sensitive };
}
