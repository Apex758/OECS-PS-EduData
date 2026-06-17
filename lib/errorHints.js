// =====================================================================
// FRIENDLY FIELD LABELS + ERROR HINTS
// =====================================================================
// Turns a structured validation error into a plain, one-sentence hint a
// teacher / school clerk can act on -- no jargon. validation.js builds the
// error objects; this file decides how they READ.
//
// Error object shape (built in validation.js):
//   { field, label, code, value, message, hint }
//     field   -- canonical column name (e.g. "date_of_birth")  [used to color the cell]
//     label   -- friendly name (e.g. "Date of birth")
//     code    -- machine reason (e.g. "not_int")
//     value   -- the offending cell value
//     message -- short what's-wrong (engineer-ish)
//     hint    -- one simple sentence: how to fix it (teacher-facing)
// =====================================================================

// Friendly names for known canonical fields. Unknown fields fall back to a
// title-cased version of the column name.
const FIELD_LABELS = {
  first_name: "First name",
  last_name: "Last name",
  middle_name: "Middle name",
  other_names: "Other names",
  maiden_name: "Maiden name",
  date_of_birth: "Date of birth",
  gender: "Gender",
  class: "Class",
  last_updated: "Last updated",
  age: "Age",
};

export function fieldLabel(field) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return String(field)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Build a {message, hint} pair for one failed check. `value` is the raw cell.
// `rule` is the field's rule (for min/max/len/options).
export function describe(code, label, value, rule = {}) {
  const v = value === "" || value == null ? "(empty)" : `"${value}"`;
  switch (code) {
    case "required":
      return {
        message: `${label} is required`,
        hint: `${label} is empty — please fill it in.`,
      };
    case "not_int":
      return {
        message: `${label} is not a whole number`,
        hint: `${label} must be a whole number like 12, not ${v}.`,
      };
    case "not_float":
      return {
        message: `${label} is not a number`,
        hint: `${label} must be a number, not ${v}.`,
      };
    case "below_min":
      return {
        message: `${label} below minimum ${rule.min}`,
        hint: `${label} must be at least ${rule.min}. You entered ${value}.`,
      };
    case "above_max":
      return {
        message: `${label} above maximum ${rule.max}`,
        hint: `${label} must be ${rule.max} or less. You entered ${value}.`,
      };
    case "bad_email":
      return {
        message: `${label} is not a valid email`,
        hint: `${label} must look like name@school.com — check for a missing @ or domain.`,
      };
    case "bad_date":
      return {
        message: `${label} is not a valid date`,
        hint: `${label} must be a real date like 2015-04-23 (year-month-day), not ${v}.`,
      };
    case "not_in_options":
      return {
        message: `${label} is not an allowed option`,
        hint: `${label} must be one of: ${(rule.values || []).join(", ")}. You entered ${v}.`,
      };
    case "too_short":
      return {
        message: `${label} is too short`,
        hint: `${label} must be at least ${rule.minLen} character${rule.minLen === 1 ? "" : "s"} long.`,
      };
    case "too_long":
      return {
        message: `${label} is too long`,
        hint: `${label} must be ${rule.maxLen} characters or fewer.`,
      };
    case "bad_pattern":
      return {
        message: `${label} has the wrong format`,
        hint: `${label} is not written in the expected format — please double-check it.`,
      };
    default:
      return {
        message: `${label} is invalid`,
        hint: `Please check ${label}.`,
      };
  }
}
