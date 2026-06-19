"use client";

// Calculations reference. Read-only, theme-aware documentation of how every
// dashboard number is derived -- the four SDG 4.c indicators, the distribution
// charts, and the institution/territory roll-ups. Pure render from the static
// model in lib/calculationDocs.js; no fetch, no admin token needed. Colours
// read CSS theme vars so it works in light and dark.

import {
  indicatorDocs, distributionDocs, rollupDocs,
  enrolmentDocs, backgroundDocs, financeDocs, systemDocs,
} from "@/lib/calculationDocs";
import { SDG_COLOURS } from "@/lib/sdgIndicators";

// Map an indicator code to its colour-key family (covers every SDG-4 indicator
// the dashboards compute, across staff / enrolment / background / finance /
// system layers).
const CODE_COLOURS = {
  "4.3.2": "#4f8cf7", "4.3.3": "#22d3ee", "4.5.1": "#a78bfa",
  "4.5.3": "#8b5cf6", "4.5.4": "#0ea5e9", "4.5.5": "#14b8a6", "4.5.6": "#1675f9",
  "4.a.1": "#ec4899", "4.a.3": "#ef4444", "4.b.1": "#0b6cf5",
};
function codeColour(code) {
  if (CODE_COLOURS[code]) return CODE_COLOURS[code];
  if (code.startsWith("4.c")) return SDG_COLOURS["4.c"];
  if (code.startsWith("4.5.1")) return SDG_COLOURS["4.5.1"];
  return "var(--muted)";
}

// One documented indicator card (code badge, formula, numerator/denominator…).
function IndicatorItem({ d }) {
  return (
    <div style={item}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <CodeBadge code={d.code} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>{d.title}</span>
        <Formula text={d.formula} />
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>unit: {d.unit}</span>
      </div>
      <Row label="Top (numerator)" value={d.numerator} />
      <Row label="Bottom (denominator)" value={d.denominator} />
      <Row label="Rounding" value={d.rounding} />
      <Row label="Instrument" value={d.instrument} mono />
      {d.note && <p style={noteText}>{d.note}</p>}
    </div>
  );
}

// A titled group of indicator cards.
function IndicatorSection({ title, subtitle, docs }) {
  return (
    <section style={card}>
      <h3 style={h3}>{title}</h3>
      <p style={sub}>{subtitle}</p>
      <div style={{ display: "grid", gap: 16 }}>
        {docs.map((d) => <IndicatorItem key={d.code + d.title} d={d} />)}
      </div>
    </section>
  );
}

export default function CalculationDocs() {
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <p style={{ color: "var(--muted)", margin: 0, fontSize: 14, lineHeight: 1.6 }}>
        How every figure on the dashboards is calculated, mapped back to the OECS
        Post-Secondary SDG Instrument (the <b>Teaching Staff (T10)</b>, <b>Enrolment (T2)</b>,{" "}
        <b>Background (1.13–1.18)</b> and <b>Finance (T13)</b> sheets, plus the{" "}
        <b>SDG Reference</b> sheet). Figures come straight from the uploaded rows — nothing is
        invented. The two indicators marked <i>reference input</i> also use external population /
        GDP / ODA figures the instrument does not collect.
      </p>

      {/* ---- Staff (T10) SDG indicators ---- */}
      <IndicatorSection
        title="Teaching staff — SDG 4.c family"
        subtitle="Derived from the uploaded T10 staff rows. The pupil-teacher ratios (4.c.2 / 4.c.4) also divide by the matching institution's enrolment."
        docs={indicatorDocs}
      />

      {/* ---- Enrolment (T2) ---- */}
      <IndicatorSection
        title="Enrolment — SDG 4.3.3 / 4.5.1 / 4.b.1"
        subtitle="Aggregate programme counts from the T2 enrolment sheet (no PII)."
        docs={enrolmentDocs}
      />

      {/* ---- Background (safety + facilities) ---- */}
      <IndicatorSection
        title="Background — SDG 4.a.1 / 4.a.3"
        subtitle="Institution-level safety & facility answers (items 1.14–1.17), one block per institution."
        docs={backgroundDocs}
      />

      {/* ---- Finance (T13) ---- */}
      <IndicatorSection
        title="Finance — SDG 4.5.3 / 4.5.4 / 4.c.5"
        subtitle="Revenue, recurrent expenditure, equity funding and teacher salaries from the T13 Finance sheet."
        docs={financeDocs}
      />

      {/* ---- System (territory-level + external reference) ---- */}
      <IndicatorSection
        title="System — SDG 4.3.2 / 4.5.6 / 4.5.5 (reference input)"
        subtitle="Territory-level ratios that need an external denominator (population, GDP, ODA) from lib/referenceData.js — illustrative until replaced with official statistics."
        docs={systemDocs}
      />

      {/* ---- Distributions ---- */}
      <section style={card}>
        <h3 style={h3}>Distribution charts</h3>
        <p style={sub}>How staff are bucketed for the qualification, classification, gender, CPD and experience charts.</p>
        <div style={{ display: "grid", gap: 16 }}>
          {distributionDocs.map((d) => (
            <div key={d.title} style={item}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{d.title}</span>
                <code style={fieldChip}>{d.field}</code>
              </div>
              <Row label="Method" value={d.method} />
              <Row label="Buckets" value={d.buckets} mono />
              <Row label="Instrument" value={d.instrument} mono />
            </div>
          ))}
        </div>
      </section>

      {/* ---- Roll-ups ---- */}
      <section style={card}>
        <h3 style={h3}>Comparison roll-ups</h3>
        <p style={sub}>How the ministry / admin comparison tables group the data before re-running the indicators above.</p>
        <div style={{ display: "grid", gap: 16 }}>
          {rollupDocs.map((d) => (
            <div key={d.title} style={item}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{d.title}</span>
                <code style={fieldChip}>group by {d.groupedBy}</code>
              </div>
              <Row label="Method" value={d.method} />
              <Row label="Also shows" value={d.extra} />
              <Row label="Instrument" value={d.instrument} mono />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CodeBadge({ code }) {
  return (
    <span style={{
      color: "#fff", background: codeColour(code), fontSize: 12, fontWeight: 700,
      padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      SDG {code}
    </span>
  );
}

function Formula({ text }) {
  return (
    <code style={{
      fontSize: 13, background: "var(--card-alt)", color: "var(--text)",
      border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px",
    }}>
      {text}
    </code>
  );
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, fontSize: 14, alignItems: "baseline" }}>
      <span style={{ color: "var(--muted)", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "var(--text)", fontFamily: mono ? "monospace" : "inherit", lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}

const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 22, boxShadow: "var(--shadow)" };
const h3 = { fontSize: 18, fontWeight: 600, margin: "0 0 4px", color: "var(--text)" };
const sub = { fontSize: 13, color: "var(--muted)", margin: "0 0 16px" };
const item = { border: "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--card-alt)", display: "grid", gap: 8 };
const noteText = { margin: "4px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.5, fontStyle: "italic" };
const fieldChip = { fontSize: 12, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px", color: "var(--muted)" };
