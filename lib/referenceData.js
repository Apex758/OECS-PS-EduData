// =====================================================================
// TERRITORY REFERENCE INPUTS  --  for system-level SDG indicators
// =====================================================================
// The instrument collects institution data only. Three SDG-4 indicators need
// external, territory-level denominators it does NOT carry:
//   4.3.2  Gross Enrolment Ratio (tertiary) -> population of the post-secondary
//          age cohort (the 5-year group after end of secondary).
//   4.5.6  Education expenditure as % of GDP -> GDP at market prices.
//   4.5.5  ODA to education share -> ODA-to-education and total ODA receipts
//          (education's share of national Official Development Assistance, USD).
//
// The figures below are ILLUSTRATIVE DEMO VALUES (local-currency GDP on the
// same scale as the demo Finance expenditure; ODA in USD). Replace with
// official statistics (ECCB / OECD-DAC / national stats offices) for real
// reporting.
// =====================================================================

export const TERRITORY_REFERENCE = {
  "Antigua and Barbuda":               { gdp: 110_000_000, tertiaryAgePopulation: 3400, odaToEducation: 720_000,   odaTotal: 4_800_000 },
  "Anguilla":                          { gdp: 70_000_000,  tertiaryAgePopulation: 2600, odaToEducation: 410_000,   odaTotal: 2_900_000 },
  "British Virgin Islands":            { gdp: 95_000_000,  tertiaryAgePopulation: 2900, odaToEducation: 530_000,   odaTotal: 3_600_000 },
  "Dominica":                          { gdp: 88_000_000,  tertiaryAgePopulation: 3100, odaToEducation: 880_000,   odaTotal: 5_200_000 },
  "Grenada":                           { gdp: 105_000_000, tertiaryAgePopulation: 3600, odaToEducation: 690_000,   odaTotal: 4_500_000 },
  "Montserrat":                        { gdp: 60_000_000,  tertiaryAgePopulation: 2300, odaToEducation: 300_000,   odaTotal: 2_100_000 },
  "Saint Kitts and Nevis":             { gdp: 98_000_000,  tertiaryAgePopulation: 3000, odaToEducation: 600_000,   odaTotal: 3_900_000 },
  "Saint Lucia":                       { gdp: 120_000_000, tertiaryAgePopulation: 3900, odaToEducation: 1_050_000, odaTotal: 6_400_000 },
  "Saint Vincent and the Grenadines":  { gdp: 92_000_000,  tertiaryAgePopulation: 3300, odaToEducation: 840_000,   odaTotal: 5_000_000 },
};

// Reference inputs for a territory, or null when none is on file (the system
// indicators then render "—" for that scope rather than inventing a number).
export function referenceFor(territory) {
  return TERRITORY_REFERENCE[(territory || "").trim()] || null;
}

// True flag so the UI can label these figures as illustrative, not measured.
export const REFERENCE_IS_ILLUSTRATIVE = true;
