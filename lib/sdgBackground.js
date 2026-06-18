// =====================================================================
// BACKGROUND SDG LAYER  --  Post-Secondary / Tertiary (instrument T1)
// =====================================================================
// Turns the institution-level Background facts (items 1.13–1.18, carried on
// each enrolment row's metadata.background by lib/db.js ingestEnrolment) into
// the SDG-4 indicators that section is tagged with:
//   4.a.1  Facilities / basic services -- disability access + OECS NREN
//   4.a.3  Safety                      -- disaster plan + emergency drills
// (4.a.3 officially counts attacks on students/staff/institutions; the OECS
// instrument has no attacks field, so disaster-readiness stands in -- noted.)
//
// One fact block PER INSTITUTION. No I/O here -- the route reads the rows and
// calls computeBackground(); this file just dedupes + does the math.
// =====================================================================

export const SDG_BG_COLOURS = {
  "4.a.1": "#ec4899", // Facilities / services
  "4.a.3": "#ef4444", // Safety
};

export const SDG_BG_REFERENCE = {
  "4.a.1": {
    title: "Facilities & Basic Services",
    colour: SDG_BG_COLOURS["4.a.1"],
    note: "Share of institutions offering basic services. The instrument captures two: disability-accessible facilities (1.16) and OECS NREN connectivity (1.17).",
  },
  "4.a.3": {
    title: "Safety & Disaster Readiness",
    colour: SDG_BG_COLOURS["4.a.3"],
    note: "Proxy for SDG 4.a.3. The instrument carries no attacks count, so disaster-management plans (1.14) and emergency drills (1.15) stand in as the safety signal.",
  },
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

// Pull one Background fact block per institution out of the enrolment rows.
// Rows of the same institution share an identical block (stamped at ingest),
// so the first one wins.
export function collectBackground(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byInstitution = new Map();
  for (const r of list) {
    const bg = r?.metadata?.background;
    if (!bg) continue;
    const key = (r.institution || "Unspecified").trim() || "Unspecified";
    if (!byInstitution.has(key)) {
      byInstitution.set(key, {
        institution: key,
        territory: (r.territory || "Unspecified").trim() || "Unspecified",
        ...bg,
      });
    }
  }
  return [...byInstitution.values()].sort((a, b) => a.institution.localeCompare(b.institution));
}

// computeBackground(rows) -> { count, indicators[], institutions[] }
//   count        : institutions that reported any Background facts
//   indicators   : 4.a.1 (×2 services) + 4.a.3 (plan % + drills total)
//   institutions : the per-institution fact rows for the detail table
export function computeBackground(rows) {
  const insts = collectBackground(rows);
  const n = insts.length;
  const yesCount = (field) => insts.filter((i) => i[field] === "Y").length;
  const drills = insts.reduce((s, i) => s + (Number(i.emergencyDrills) || 0), 0);

  const indicators = n === 0 ? [] : [
    {
      code: "4.a.1", key: "4.a.1-disability",
      title: "Disability-Accessible Facilities",
      colour: SDG_BG_COLOURS["4.a.1"],
      value: pct(yesCount("disabilityAccess"), n), unit: "%",
      detail: `${yesCount("disabilityAccess")} of ${n} institutions`,
      note: "Item 1.16 — all areas accessible to students with disabilities.",
    },
    {
      code: "4.a.1", key: "4.a.1-nren",
      title: "OECS NREN Connectivity",
      colour: SDG_BG_COLOURS["4.a.1"],
      value: pct(yesCount("nrenMember"), n), unit: "%",
      detail: `${yesCount("nrenMember")} of ${n} institutions`,
      note: "Item 1.17 — member of the OECS National Research & Education Network.",
    },
    {
      code: "4.a.3", key: "4.a.3-plan",
      title: "Disaster Management Plan",
      colour: SDG_BG_COLOURS["4.a.3"],
      value: pct(yesCount("disasterPlan"), n), unit: "%",
      detail: `${yesCount("disasterPlan")} of ${n} institutions`,
      note: "Item 1.14 — institution has a disaster management plan.",
    },
    {
      code: "4.a.3", key: "4.a.3-drills",
      title: "Emergency Drills (total)",
      colour: SDG_BG_COLOURS["4.a.3"],
      value: drills, unit: "drills",
      detail: `${drills} drills across ${n} institutions`,
      note: "Item 1.15 — emergency drills conducted in the past year.",
    },
  ];

  return { count: n, indicators, institutions: insts };
}
