// =====================================================================
// DATA VALIDATION ENGINE
// =====================================================================
// Validates each CELL on two axes:
//   1. TYPE    -- int / float / email / date / string (length)
//   2. CONTENT -- if the field has FIXED OPTIONS (rule.values, e.g.
//                 ["yes","no"]) the cell must be one of them.
//                 OPEN-ENDED fields (no `values`) -> content check is
//                 SKIPPED for now (TODO: fill later).
//
// Each failed check produces a STRUCTURED error (not a string) so the UI can
// (a) color the exact offending cell red and (b) show a plain-English hint:
//   { field, label, code, value, message, hint }
// See errorHints.js for the friendly labels + hint wording.
//
// You edit the RULES in validationRules.js, not (usually) this engine.
// =====================================================================

import { rulesByEntity, batchRules } from "@/lib/validationRules";
import { fieldLabel, describe } from "@/lib/errorHints";

// Build one structured error for a field/check.
function makeError(field, code, value, rule) {
  const label = fieldLabel(field);
  const { message, hint } = describe(code, label, value, rule);
  return { field, label, code, value, message, hint };
}

// validateRecord(record, rowIndex, entity) -> { valid, errors }
// entity = "student" | "institution"; errors = array of structured objects.
export function validateRecord(record, rowIndex, entity) {
  const fieldRules = rulesByEntity[entity];
  if (!fieldRules) {
    return {
      valid: false,
      errors: [makeError("_entity", "bad_pattern", entity, {})],
    };
  }

  const errors = [];

  for (const [field, rule] of Object.entries(fieldRules)) {
    const raw = record[field];
    const val = raw == null ? "" : String(raw).trim();

    // (1) required / presence
    if (rule.required && val === "") {
      errors.push(makeError(field, "required", val, rule));
      continue;
    }
    if (val === "") continue; // optional + empty -> skip rest

    // (2) TYPE check
    const typeCode = checkType(val, rule);
    if (typeCode) errors.push(makeError(field, typeCode, val, rule));

    // (3) CONTENT check (fixed options vs open-ended)
    const contentCode = checkContent(val, rule);
    if (contentCode) errors.push(makeError(field, contentCode, val, rule));

    // (4) extra pattern, if given
    if (rule.pattern && !rule.pattern.test(val)) {
      errors.push(makeError(field, "bad_pattern", val, rule));
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---- TYPE checks ---- return an error CODE (string) or null.
function checkType(val, rule) {
  switch (rule.type) {
    // -------------------------------------------------------------
    // INTEGER -- digits only, optional sign; min/max bounds
    // -------------------------------------------------------------
    case "int": {
      if (!/^-?\d+$/.test(val)) return "not_int";
      const n = Number(val);
      if (rule.min != null && n < rule.min) return "below_min";
      if (rule.max != null && n > rule.max) return "above_max";
      return null;
    }

    // -------------------------------------------------------------
    // FLOAT -- optional decimal part; min/max bounds
    // -------------------------------------------------------------
    case "float": {
      if (!/^-?\d+(\.\d+)?$/.test(val)) return "not_float";
      const n = Number(val);
      if (rule.min != null && n < rule.min) return "below_min";
      if (rule.max != null && n > rule.max) return "above_max";
      return null;
    }

    // -------------------------------------------------------------
    // EMAIL -- single @, non-empty local/domain, dotted domain
    // -------------------------------------------------------------
    case "email":
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val) ? null : "bad_email";

    // -------------------------------------------------------------
    // DATE -- parseable by Date.parse
    // -------------------------------------------------------------
    case "date":
      return isNaN(Date.parse(val)) ? "bad_date" : null;

    // -------------------------------------------------------------
    // ENUM -- type passes here; options enforced in checkContent
    // -------------------------------------------------------------
    case "enum":
      return null;

    // -------------------------------------------------------------
    // STRING (default) -- minLen/maxLen length bounds
    // -------------------------------------------------------------
    case "string":
    default: {
      if (rule.minLen != null && val.length < rule.minLen) return "too_short";
      if (rule.maxLen != null && val.length > rule.maxLen) return "too_long";
      return null;
    }
  }
}

// ---- CONTENT checks ---- return an error CODE (string) or null.
// Fixed options  -> value must be in rule.values (case-insensitive).
// Open-ended     -> no `values` set => SKIP for now (will fix later).
function checkContent(val, rule) {
  if (Array.isArray(rule.values) && rule.values.length > 0) {
    const opts = rule.values.map((o) => String(o).toLowerCase());
    if (!opts.includes(val.toLowerCase())) {
      return "not_in_options";
    }
    return null;
  }

  // OPEN-ENDED FIELD -- content not yet validated.
  // TODO: add free-text content rules here later if needed.
  return null;
}

// validateBatch(records, entity) -> { valid, errors }
export function validateBatch(records, entity) {
  const fieldRules = rulesByEntity[entity] || {};
  const errors = [];

  if (batchRules.maxRows != null && records.length > batchRules.maxRows) {
    errors.push(`too many rows: ${records.length} > ${batchRules.maxRows}`);
  }

  // uniqueness across batch for fields flagged `unique: true`
  for (const [field, rule] of Object.entries(fieldRules)) {
    if (!rule.unique) continue;
    const seen = new Set();
    records.forEach((r, i) => {
      const v = String(r[field] ?? "").trim();
      if (v === "") return;
      if (seen.has(v)) errors.push(`row ${i}: duplicate ${field} "${v}"`);
      seen.add(v);
    });
  }

  return { valid: errors.length === 0, errors };
}
