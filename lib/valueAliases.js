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

// canonicalValue -> [accepted variants]   (canonical codes = OECS RMR)
const staffValueAliases = {
  highest_qualification: {
    PHD:  ["phd", "ph.d", "doctorate", "doctoral", "dphil"],
    MAST: ["masters", "master", "msc", "ma", "med", "mba", "masters_degree", "master_degree", "postgraduate", "post_graduate", "mast"],
    PGD:  ["postgraddiploma", "post_grad_diploma", "postgraduate_diploma", "pgdip", "pg_dip", "pgd", "post_graduate_diploma"],
    BACH: ["bachelors", "bachelor", "bsc", "ba", "bed", "beng", "degree", "undergraduate", "first_degree", "bachelors_degree", "bachelor_degree", "bach"],
    AD:   ["associate_degree", "associate", "ad", "assoc", "associates"],
    DIP:  ["diploma", "dip"],
    CERT: ["certificate", "cert"],
    CAPE: ["cape", "a_levels", "a_level", "alevels", "advanced_level", "cape_a_levels"],
  },
  classification: {
    PRIN:  ["principal", "prin", "pr", "president", "director", "head"],
    VPRIN: ["vice_principal", "viceprincipal", "vprin", "vp", "deputy_principal", "deputy"],
    DEAN:  ["dean"],
    HOD:   ["head_of_department", "hod", "department_head", "coordinator"],
    LECT:  ["lecturer", "lect", "trained_teacher", "teacher", "tt"],
    INST:  ["instructor", "inst"],
    TUTOR: ["tutor"],
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

// canonicalValue -> [accepted variants]   (canonical codes = OECS RMR)
// NOTE: age_band is intentionally OMITTED -- its codes ("<16","30-34","40+")
// contain symbols canon() would strip, risking collisions, so raw codes must
// match exactly (no aliasing).
const studentValueAliases = {
  sex: {
    M: ["m", "male", "boy", "man", "1", "masculine"],
    F: ["f", "female", "girl", "woman", "2", "feminine"],
    U: ["u", "unknown", "unspecified", "not_stated", "0"],
  },
  attendance_mode: {
    FT: ["ft", "full_time", "fulltime", "full"],
    PT: ["pt", "part_time", "parttime", "part"],
  },
  programme_type: {
    CERT: ["cert", "certificate"],
    CAPE: ["cape", "a_levels", "advanced_level"],
    DIP:  ["dip", "diploma"],
    AD:   ["ad", "associate_degree", "associate"],
    BACH: ["bach", "bachelor_degree", "bachelor", "bachelors", "degree", "undergraduate"],
    MAST: ["mast", "masters_degree", "masters", "master"],
    PHD:  ["phd", "doctorate", "doctoral"],
    CVQ:  ["cvq", "caribbean_vocational_qualification", "vocational"],
  },
  qualification_level: {
    CERT: ["cert", "certificate"],
    CAPE: ["cape", "a_levels"],
    DIP:  ["dip", "diploma"],
    AD:   ["ad", "associate_degree", "associate"],
    UG:   ["ug", "undergraduate", "undergraduate_degree", "bachelor", "bachelors"],
    GRAD: ["grad", "graduate", "graduate_degree"],
    PG:   ["pg", "postgraduate", "postgraduate_degree", "masters"],
    PHD:  ["phd", "doctorate", "doctoral"],
  },
  isced_level: {
    ISCED4: ["isced4", "isced_4", "4", "post_secondary_non_tertiary"],
    ISCED5: ["isced5", "isced_5", "5", "short_cycle_tertiary"],
    ISCED6: ["isced6", "isced_6", "6", "bachelor_or_equivalent"],
    ISCED7: ["isced7", "isced_7", "7", "master_or_equivalent"],
    ISCED8: ["isced8", "isced_8", "8", "doctoral_or_equivalent"],
  },
  cvq_level: {
    CVQ1: ["cvq1", "cvq_1", "level1", "level_1", "1"],
    CVQ2: ["cvq2", "cvq_2", "level2", "level_2", "2"],
    CVQ3: ["cvq3", "cvq_3", "level3", "level_3", "3"],
    CVQ4: ["cvq4", "cvq_4", "level4", "level_4", "4"],
    CVQ5: ["cvq5", "cvq_5", "level5", "level_5", "5"],
  },
  dropout_reason: {
    FIN:  ["fin", "financial_difficulty", "financial", "money"],
    ACAD: ["acad", "academic_difficulty", "academic", "grades"],
    EMP:  ["emp", "employment", "employed", "job", "work"],
    MIG:  ["mig", "migration", "migrated", "relocated"],
    HLTH: ["hlth", "health", "illness", "medical"],
    FAM:  ["fam", "family_responsibility", "family"],
    TRF:  ["trf", "transfer_to_another_institution", "transfer", "transferred"],
    DISC: ["disc", "disciplinary", "discipline", "expelled"],
    PERS: ["pers", "personal_reasons", "personal"],
    UNK:  ["unk", "unknown", "unspecified", "not_stated"],
  },
};

const institutionValueAliases = {
  institution_status: {
    ACTIVE:   ["active", "open", "operational"],
    INACTIVE: ["inactive", "dormant", "suspended"],
    CLOSED:   ["closed", "shut", "defunct"],
  },
  sector_type: {
    PUB:  ["pub", "public", "government", "state"],
    PRIV: ["priv", "private"],
    IND:  ["ind", "independent"],
  },
  gender_composition: {
    COED:   ["coed", "co_ed", "co_educational", "mixed"],
    MALE:   ["male", "boys", "all_male", "boys_only"],
    FEMALE: ["female", "girls", "all_female", "girls_only"],
  },
  locality: {
    URB:    ["urb", "urban", "city", "town"],
    RUR:    ["rur", "rural", "country", "countryside"],
    REMRUR: ["remrur", "remote_rural", "remote", "remote_rural_area"],
  },
  funding_source: {
    GOV:  ["gov", "government", "state", "public"],
    DON:  ["don", "donor", "donation", "grant", "aid"],
    PTA:  ["pta", "parent_teacher_association"],
    PRIV: ["priv", "private", "fees", "tuition"],
    OTH:  ["oth", "other", "misc"],
  },
};

export const valueAliasesByEntity = {
  staff: staffValueAliases,
  student: studentValueAliases,
  institution: institutionValueAliases,
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
