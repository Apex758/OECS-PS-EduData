// =====================================================================
// DATE NORMALIZATION  --  any common date format -> canonical ISO
// =====================================================================
// Schools write dates every way imaginable: 2014-03-15, 15/03/2014,
// 03/15/2014, 15-Mar-2014, "Mar 15, 2014", 15.03.2014, 15/3/14 ...
// validationRules.js wants a parseable date; downstream we want ONE shape.
// This rewrites every `date`-typed field to ISO `YYYY-MM-DD`.
//
// The hard part is the ambiguous numeric form `a/b/yyyy`: is 03/11 the 3rd
// of November or the 11th of March? We DON'T guess per-cell -- we decide
// ONCE PER FILE:
//   - scan every date cell; a part > 12 proves which slot is the day
//   - if the file's unambiguous rows say day-first, the whole file is
//     day-first (and vice-versa)
//   - if a file mixes both (some rows day-first, some month-first) or gives
//     no signal at all, fall back to DEFAULT_DAY_FIRST and flag `ambiguous`
//
// Caribbean/Commonwealth schools (this app's users) overwhelmingly write
// day-first, so that's the default when a file gives no evidence.
// =====================================================================

const DEFAULT_DAY_FIRST = true;

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

const pad = (n) => String(n).padStart(2, "0");

// Expand a 2-digit year. <70 -> 2000s, else 1900s. (Student DOBs are 2000s.)
function fullYear(y) {
  if (y >= 100) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

function isValidYmd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Split a purely-numeric date into [a, b, c] parts, or null if not numeric.
//   matches d/m/y, d-m-y, d.m.y, and y-m-d (4-digit year leads).
function numericParts(raw) {
  const m = raw.match(/^(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// Evidence from one cell toward day-first vs month-first. Only the ambiguous
// numeric a/b/yyyy form (both parts <= 31, year last) votes. Returns
// "day" | "month" | null (no signal / not numeric / ISO).
export function dateOrderEvidence(raw) {
  const val = String(raw ?? "").trim();
  if (val === "") return null;
  const parts = numericParts(val);
  if (!parts) return null;
  const [a, b, c] = parts;
  // ISO-ish (4-digit year first): unambiguous, no vote.
  if (a >= 1000) return null;
  // year must be the last slot for the a/b/yyyy day/month question
  if (c < 32) return null; // can't tell which is the year -> skip
  if (a > 12 && b <= 12) return "day";   // a can't be a month -> a is day
  if (b > 12 && a <= 12) return "month"; // b can't be a month -> b is day
  return null;                            // both <= 12 -> ambiguous, no vote
}

// Parse one date string to ISO `YYYY-MM-DD`, or null if unrecognized.
// `dayFirst` only affects the ambiguous numeric a/b/yyyy form.
export function parseFlexibleDate(raw, dayFirst = DEFAULT_DAY_FIRST) {
  const val = String(raw ?? "").trim();
  if (val === "") return null;

  // Already ISO (YYYY-MM-DD or YYYY/MM/DD) -> normalize padding.
  const iso = val.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    return isValidYmd(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }

  // Month-name forms: "15-Mar-2014", "Mar 15 2014", "15 March 2014",
  // "March 15, 2014". Find the alpha month token + the two numbers.
  if (/[a-z]/i.test(val)) {
    const monMatch = val.toLowerCase().match(/[a-z]+/);
    const mon = monMatch && MONTHS[monMatch[0]];
    if (!mon) return null;
    const nums = val.match(/\d+/g);
    if (!nums || nums.length < 2) return null;
    // Of the two numbers, the year is the 4-digit / >31 one; the other is the day.
    const yi = nums.findIndex((n) => n.length === 4 || Number(n) > 31);
    let day, year;
    if (yi >= 0) {
      year = Number(nums[yi]);
      day = Number(nums.find((_, i) => i !== yi));
    } else {
      // both small (e.g. "15 Mar 14"): first token is the day, last is the year
      day = Number(nums[0]);
      year = Number(nums[nums.length - 1]);
    }
    year = fullYear(year);
    return isValidYmd(year, mon, day) ? `${year}-${pad(mon)}-${pad(day)}` : null;
  }

  // Numeric a/b/yyyy (or a/b/yy).
  const parts = numericParts(val);
  if (!parts) return null;
  let [a, b, c] = parts;
  if (a >= 1000) {            // YYYY/M/D handled above, but be safe
    return isValidYmd(a, b, c) ? `${a}-${pad(b)}-${pad(c)}` : null;
  }
  const year = fullYear(c);
  // Disambiguate using the file's decision, but always respect a hard signal
  // (a part > 12 can only be the day).
  let day, month;
  if (a > 12)      { day = a; month = b; }
  else if (b > 12) { day = b; month = a; }
  else if (dayFirst) { day = a; month = b; }
  else               { day = b; month = a; }
  return isValidYmd(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
}

// =====================================================================
// normalizeDates(records, entity, fieldRules)
// =====================================================================
// Runs AFTER value normalization, BEFORE validation. Rewrites every
// `date`-typed field to ISO. Returns:
//   {
//     records:  [...]                    // same rows, dates -> ISO
//     applied:  [{ field, from, to }]    // dates that were reformatted
//     unparsed: [{ field, value }]       // dates we couldn't read (left as-is)
//     dayFirst: boolean                  // the file-level decision used
//     ambiguous: boolean                 // file gave conflicting/no signal
//   }
export function normalizeDates(records, entity, fieldRules = {}) {
  const dateFields = Object.entries(fieldRules)
    .filter(([, rule]) => rule && rule.type === "date")
    .map(([field]) => field);

  if (records.length === 0 || dateFields.length === 0) {
    return { records, applied: [], unparsed: [], dayFirst: DEFAULT_DAY_FIRST, ambiguous: false };
  }

  // ---- file-level day-first vs month-first vote ----
  let dayVotes = 0, monthVotes = 0;
  for (const rec of records) {
    for (const field of dateFields) {
      const ev = dateOrderEvidence(rec[field]);
      if (ev === "day") dayVotes++;
      else if (ev === "month") monthVotes++;
    }
  }
  const conflicting = dayVotes > 0 && monthVotes > 0;
  const noSignal = dayVotes === 0 && monthVotes === 0;
  const dayFirst = conflicting || noSignal
    ? DEFAULT_DAY_FIRST
    : dayVotes >= monthVotes;
  const ambiguous = conflicting || noSignal;

  const applied = [];
  const unparsed = [];
  const out = records.map((rec) => {
    const next = { ...rec };
    for (const field of dateFields) {
      const raw = rec[field];
      if (raw == null || String(raw).trim() === "") continue;
      const val = String(raw).trim();
      const iso = parseFlexibleDate(val, dayFirst);
      if (iso == null) {
        unparsed.push({ field, value: val });
        continue; // leave as-is -> validation rejects
      }
      if (iso !== val) {
        next[field] = iso;
        applied.push({ field, from: val, to: iso });
      }
    }
    return next;
  });

  return { records: out, applied, unparsed, dayFirst, ambiguous };
}
