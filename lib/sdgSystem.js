// =====================================================================
// SYSTEM SDG LAYER  --  territory / national indicators
// =====================================================================
// Two SDG-4 indicators are system-level, not institution-level, and need an
// external denominator from lib/referenceData.js:
//   4.3.2  Gross Enrolment Ratio (tertiary) = tertiary enrolment / age cohort
//   4.5.6  Education expenditure as % of GDP = recurrent expenditure / GDP
//   4.5.5  ODA-to-education share = ODA to education / total ODA (reference)
//
// Built per TERRITORY (institutions in that territory pooled) plus an OECS-wide
// roll-up. No I/O here -- the route reads the enrolment rows + reference table
// and calls computeSystem(rows). Enrolment headcount and expenditure are summed
// from the same rows the other SDG layers use.
// =====================================================================

import { referenceFor, REFERENCE_IS_ILLUSTRATIVE } from "./referenceData.js";

export const SDG_SYS_COLOURS = {
  "4.3.2": "#4f8cf7", // Tertiary GER
  "4.5.6": "#1675f9", // Expenditure % GDP
  "4.5.5": "#14b8a6", // ODA to education share
};

export const SDG_SYS_REFERENCE = {
  "4.3.2": {
    title: "Gross Enrolment Ratio (Tertiary)",
    colour: SDG_SYS_COLOURS["4.3.2"],
    note: "Total tertiary enrolment ÷ population of the post-secondary age cohort × 100. Population is an external reference input, not collected by the instrument.",
  },
  "4.5.6": {
    title: "Education Expenditure as % of GDP",
    colour: SDG_SYS_COLOURS["4.5.6"],
    note: "Total recurrent education expenditure ÷ GDP × 100. GDP is an external reference input, not collected by the instrument.",
  },
  "4.5.5": {
    title: "ODA to Education (share of total ODA)",
    colour: SDG_SYS_COLOURS["4.5.5"],
    note: "ODA to education ÷ total ODA receipts × 100. Both are external reference inputs (OECD-DAC / national records), not collected by the instrument.",
  },
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const headOf = (r) => n(r.totalFtM) + n(r.totalFtF) + n(r.totalPtM) + n(r.totalPtF);

// Pool enrolment headcount + finance expenditure by territory, then attach the
// external GDP / population reference and derive GER + %GDP.
export function computeSystem(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byTerritory = new Map(); // territory -> { enrolment, expenditure, institutions:Set }

  for (const r of list) {
    const terr = (r.territory || "Unspecified").trim() || "Unspecified";
    let rec = byTerritory.get(terr);
    if (!rec) { rec = { territory: terr, enrolment: 0, expenditure: 0, institutions: new Set(), seenFinance: new Set() }; byTerritory.set(terr, rec); }
    rec.enrolment += headOf(r);
    const inst = (r.institution || "").trim();
    if (inst) rec.institutions.add(inst);
    // Sum each institution's recurrent expenditure ONCE (finance is duplicated
    // across that institution's programme rows).
    const exp = r?.metadata?.finance?.totalExpenditure;
    if (inst && exp != null && !rec.seenFinance.has(inst)) {
      rec.expenditure += n(exp);
      rec.seenFinance.add(inst);
    }
  }

  const territories = [...byTerritory.values()].map((rec) => {
    const ref = referenceFor(rec.territory);
    const population = ref?.tertiaryAgePopulation ?? null;
    const gdp = ref?.gdp ?? null;
    const odaToEducation = ref?.odaToEducation ?? null;
    const odaTotal = ref?.odaTotal ?? null;
    return {
      territory: rec.territory,
      institutions: rec.institutions.size,
      enrolment: rec.enrolment,
      expenditure: rec.expenditure,
      population,
      gdp,
      odaToEducation,
      odaTotal,
      ger: population ? pct(rec.enrolment, population) : null,
      pctGdp: gdp ? pct(rec.expenditure, gdp) : null,
      odaShare: odaTotal ? pct(odaToEducation, odaTotal) : null,
    };
  }).sort((a, b) => a.territory.localeCompare(b.territory));

  // OECS roll-up only over territories that have a reference denominator.
  const refTerr = territories.filter((t) => t.population != null);
  const refGdp = territories.filter((t) => t.gdp != null);
  const totalEnrol = refTerr.reduce((s, t) => s + t.enrolment, 0);
  const totalPop = refTerr.reduce((s, t) => s + (t.population || 0), 0);
  const totalExp = refGdp.reduce((s, t) => s + t.expenditure, 0);
  const totalGdp = refGdp.reduce((s, t) => s + (t.gdp || 0), 0);
  const refOda = territories.filter((t) => t.odaTotal != null);
  const totalOdaEdu = refOda.reduce((s, t) => s + (t.odaToEducation || 0), 0);
  const totalOda = refOda.reduce((s, t) => s + (t.odaTotal || 0), 0);

  const indicators = [
    {
      code: "4.3.2", key: "4.3.2", ...SDG_SYS_REFERENCE["4.3.2"],
      value: pct(totalEnrol, totalPop), unit: "%",
      detail: totalPop ? `${totalEnrol.toLocaleString()} enrolled / ${totalPop.toLocaleString()} cohort` : "no population reference",
    },
    {
      code: "4.5.6", key: "4.5.6", ...SDG_SYS_REFERENCE["4.5.6"],
      value: pct(totalExp, totalGdp), unit: "%",
      detail: totalGdp ? `${totalExp.toLocaleString()} expenditure / ${totalGdp.toLocaleString()} GDP` : "no GDP reference",
    },
    {
      code: "4.5.5", key: "4.5.5", ...SDG_SYS_REFERENCE["4.5.5"],
      value: pct(totalOdaEdu, totalOda), unit: "%",
      detail: totalOda ? `${totalOdaEdu.toLocaleString()} education / ${totalOda.toLocaleString()} total ODA (USD)` : "no ODA reference",
    },
  ];

  return { count: territories.length, indicators, territories, illustrative: REFERENCE_IS_ILLUSTRATIVE };
}
