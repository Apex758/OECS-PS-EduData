// =====================================================================
// VALUE ALIASES  --  EDIT THESE
// =====================================================================
// Sibling of headerAliases.js, but for CELL VALUES instead of column
// names. Institutions don't just name columns differently -- they write
// the SAME concept in different words: gender comes in as "Male", "male",
// "MALE", "boy", "m", "1", ... all meaning the same thing.
//
// headerAliases collapses "Sex / Gender" -> the canonical FIELD `gender`.
// valueAliases then collapses the cell's CONTENT -> a canonical VALUE
// ("M" | "F" | "Other") so validationRules.js (values: ["M","F","Other"])
// just works regardless of how the school spelled it.
//
// Only ENUM fields are normalized (rule.type === "enum"). Open-ended
// fields (names, dates, numbers) are left untouched.
//
// Matching is FUZZY, same canon() rule as headerAliases/sensitiveFields:
// case, spaces, underscores, hyphens and dots are ignored. List only
// genuinely different WORDS -- "Male", "MALE", "ma le" all collapse to
// one token, so one entry covers every casing.
//
// The canonical value itself is always accepted; no need to repeat it.
// =====================================================================

// canonicalValue -> [accepted variants]
const staffValueAliases = {
  highest_qualification: {
    PhD:             ["phd", "ph.d", "doctorate", "doctoral", "dphil"],
    Masters:         ["masters", "master", "msc", "ma", "med", "mba", "masters_degree", "master_degree", "postgraduate", "post_graduate"],
    PostGradDiploma: ["postgraddiploma", "post_grad_diploma", "postgraduate_diploma", "pgdip", "pg_dip", "pgd"],
    Bachelors:       ["bachelors", "bachelor", "bsc", "ba", "bed", "beng", "degree", "undergraduate", "first_degree", "bachelors_degree", "bachelor_degree"],
    Diploma:         ["diploma", "dip", "associate_degree", "associate"],
    CAPE:            ["cape", "a_levels", "a_level", "alevels", "advanced_level", "cape_a_levels"],
  },
  classification: {
    PR:  ["principal", "pr", "president", "director", "head"],
    VP:  ["vice_principal", "viceprincipal", "vp", "deputy_principal", "deputy"],
    HOD: ["head_of_department", "hod", "department_head", "coordinator"],
    TT:  ["trained_teacher", "teacher", "tt", "lecturer", "tutor", "instructor"],
  },
  appraised: {
    Y: ["yes", "y", "true", "1", "appraised"],
    N: ["no", "n", "false", "0", "not_appraised"],
  },
  left_service: {
    Y: ["yes", "y", "true", "1", "left", "departed", "exited"],
    N: ["no", "n", "false", "0", "active", "in_service", "stayed"],
  },
  sex: {
    // NOTE: the full words "male"/"female" are intentionally OMITTED so the
    // demo can show the admin "add this value to the rules?" flow (a row with
    // sex="Male" is rejected, then an admin approves Male->M via value_aliases,
    // and it normalizes automatically thereafter).
    M: ["m", "boy", "man", "b", "1", "masculine"],
    F: ["f", "girl", "woman", "g", "w", "2", "feminine"],
  },
};

export const valueAliasesByEntity = {
  staff: staffValueAliases,
  institution: {},
};

// Strip everything but letters/digits, lowercase -- mirrors headerAliases.canon.
function canon(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Build { field -> { normalizedVariant -> canonicalValue } } for one entity.
// Canonical value is registered first so it always wins. `extraAliases` are
// admin-approved rows from the value_aliases DB table: [{field,variant,canonical}].
function buildReverseMap(entity, extraAliases = []) {
  const fieldMap = valueAliasesByEntity[entity] || {};
  const reverse = {};
  for (const [field, valueMap] of Object.entries(fieldMap)) {
    const r = {};
    for (const [canonical, variants] of Object.entries(valueMap)) {
      r[canon(canonical)] = canonical;
      for (const v of variants) r[canon(v)] = canonical;
    }
    reverse[field] = r;
  }
  // Merge DB-approved aliases on top (also creates a table for fields that had
  // no static aliases yet).
  for (const a of extraAliases) {
    if (!a || !a.field || !a.variant || !a.canonical) continue;
    const f = a.field;
    if (!reverse[f]) reverse[f] = {};
    reverse[f][canon(a.canonical)] = a.canonical;
    reverse[f][canon(a.variant)] = a.canonical;
  }
  return reverse;
}

// =====================================================================
// normalizeValues(records, entity, fieldRules)
// =====================================================================
// Rewrites recognized ENUM cell values to their canonical form. Runs
// AFTER normalizeHeaders (so keys are canonical) and BEFORE validation
// (so it sees canonical values). Returns:
//   {
//     records:      [...]                  // same rows, enum values canonicalized
//     applied:      [{ field, from, to }]  // values that were remapped (info)
//     unrecognized: [{ field, value }]     // enum values matching NO variant
//   }
// Unrecognized values are passed through UNCHANGED -- validation then
// rejects them against rule.values, so nothing is silently "fixed".
export function normalizeValues(records, entity, fieldRules = {}, extraAliases = []) {
  const reverse = buildReverseMap(entity, extraAliases);

  // Which canonical fields are enums we should normalize?
  const enumFields = Object.entries(fieldRules)
    .filter(([, rule]) => rule && rule.type === "enum")
    .map(([field]) => field)
    .filter((field) => reverse[field]); // only fields we have a value table for

  if (records.length === 0 || enumFields.length === 0) {
    return { records, applied: [], unrecognized: [] };
  }

  const applied = [];
  const unrecognized = [];

  const out = records.map((rec) => {
    const next = { ...rec };
    for (const field of enumFields) {
      const raw = rec[field];
      if (raw == null || String(raw).trim() === "") continue;
      const val = String(raw).trim();
      const canonical = reverse[field][canon(val)];
      if (canonical == null) {
        unrecognized.push({ field, value: val });
        continue; // leave as-is -> validation will reject
      }
      if (canonical !== val) {
        next[field] = canonical;
        applied.push({ field, from: val, to: canonical });
      }
    }
    return next;
  });

  return { records: out, applied, unrecognized };
}
