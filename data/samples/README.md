# Sample student CSVs — different formats, same canonical schema

Five files from five fictional schools. Each names its columns and writes its
values **differently**, yet all five flow through the ingest pipeline and land
in the **same canonical student record**. Use them to demo that institution
format does not matter — header aliasing + value aliasing normalize everything.

Upload each in the **Upload** tab (or POST to `/api/ingest` with an API key).
After each upload, the **Normalization applied** card shows exactly which
headers and values were remapped.

| File | Format quirk it demonstrates |
|------|------------------------------|
| `01-canonical.csv` | The canonical field names + `M`/`F`/`Other` + ISO dates — the baseline. |
| `02-uk-synonyms.csv` | Synonym headers (`forename`, `surname`, `sex`, `birthday`, `form`, `years`); values `Male`/`Female`/`nonbinary`; ISO dates. |
| `03-allcaps-punctuation.csv` | ALL-CAPS + punctuation headers (`FIRST-NAME`, `FAMILY NAME`, `D.O.B`); values `BOY`/`GIRL`/`X`; **`dd/mm/yyyy`** (day-first) dates. |
| `04-abbreviations.csv` | Abbreviated headers (`fname`, `lname`, `dob`, `grade`); values `m`/`f`/`1`/`2`/`o`; **`mm/dd/yyyy`** (US month-first) dates. |
| `05-messy-with-noise.csv` | Spaced headers (`Given Name`, `Sex / Gender`); values `man`/`woman`/`Male`/`nb`; **`dd.mm.yyyy`** dotted dates; **extra `Notes` + `Email` columns** that are unknown → warned and dropped. |

## How the normalization happens
1. **Headers → canonical fields** — `lib/headerAliases.js` maps every column
   name (fuzzy: case/space/`_`/`-`/`.` ignored) to a canonical field
   (`surname` → `last_name`, `D.O.B` → `date_of_birth`, `grade` → `class`, …).
2. **Values → canonical values** — `lib/valueAliases.js` maps each ENUM cell to
   a canonical value (`Male`/`boy`/`m`/`1` → `M`; `Female`/`girl`/`f`/`2` → `F`;
   everything else listed → `Other`).
3. **Dates → ISO** — `lib/dateNormalize.js` reformats every date field to
   `YYYY-MM-DD`. Numeric `a/b/yyyy` is ambiguous per-cell, so the **whole file**
   is read day-first or month-first based on its unambiguous rows (a part > 12
   proves the day). No signal → assumes day-first (Caribbean default) and warns.
4. **Validate** — `lib/validationRules.js` checks the now-canonical record.

## Canonical student fields
`first_name`*, `last_name`*, `middle_name`, `other_names`, `maiden_name`,
`date_of_birth`*, `gender`* (`M`/`F`/`Other`), `class`, `last_updated`,
`age`* (3–19).  *= required.

PII (`first_name`, `last_name`, `middle_name`, `other_names`, `maiden_name`,
`date_of_birth`) is split into the RULI mapping only; the dashboard record
keeps just the coded RULI + non-identifying fields (`gender`, `age`, `class`).
