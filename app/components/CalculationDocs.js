"use client";

// Calculations reference. Read-only, theme-aware documentation of how every
// dashboard number is derived -- the four SDG 4.c indicators, the distribution
// charts, and the institution/territory roll-ups. Pure render from the static
// model in lib/calculationDocs.js; no fetch, no admin token needed. Colours
// read CSS theme vars so it works in light and dark.

import { indicatorDocs, distributionDocs, rollupDocs } from "@/lib/calculationDocs";
import { SDG_COLOURS } from "@/lib/sdgIndicators";

// Map an indicator code (e.g. "4.c.1", "4.5.1") to its colour-key family.
function codeColour(code) {
  if (code.startsWith("4.5.1")) return SDG_COLOURS["4.5.1"];
  if (code.startsWith("4.c")) return SDG_COLOURS["4.c"];
  if (code.startsWith("4.3.3")) return SDG_COLOURS["4.3.3"];
  if (code.startsWith("4.3.2")) return SDG_COLOURS["4.3.2"];
  return "var(--muted)";
}

export default function CalculationDocs() {
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <p style={{ color: "var(--muted)", margin: 0, fontSize: 14, lineHeight: 1.6 }}>
        How every figure on the dashboard is calculated, mapped back to the OECS
        Post-Secondary SDG Instrument (table <b>T10 — Teaching Staff Profile</b> and the{" "}
        <b>SDG Reference</b> sheet). All numbers come straight from the uploaded T10 rows — no
        data is invented or estimated.
      </p>

      {/* ---- SDG indicators ---- */}
      <section style={card}>
        <h3 style={h3}>SDG indicators</h3>
        <p style={sub}>The four headline metrics. Each is a single number derived from all uploaded staff.</p>
        <div style={{ display: "grid", gap: 16 }}>
          {indicatorDocs.map((d) => (
            <div key={d.code} style={item}>
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
          ))}
        </div>
      </section>

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
