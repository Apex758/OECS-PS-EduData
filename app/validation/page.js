"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "@/lib/theme";

// Validation layer — the cross-institution duplicate console. AUTOMATED and
// read-only: tokens pushed by the RULI Mapper standalone are scanned for a
// shared salt on arrival (same person across institutions). This page only
// OBSERVES that activity — it auto-refreshes and never resolves anything
// itself. Approval happens in the institutions' standalone (exe), not here.
// Same interim ADMIN_SECRET gate as the rest of /admin.

const C = {
  border: "var(--border)", muted: "var(--muted)", accent: "var(--accent)",
  card: "var(--card)", text: "var(--text)",
};

export default function ValidationLayerPage() {
  const [theme, toggleTheme] = useTheme();
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    const t = localStorage.getItem("adminToken");
    if (t) { setToken(t); setAuthed(true); }
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/validation/overview", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) { setError(String(e.message)); }
  }, [token]);

  // Hands-off: poll every 5s so the console reflects live activity without
  // anyone clicking anything.
  useEffect(() => {
    if (!authed) return;
    load();
    timer.current = setInterval(load, 5000);
    return () => clearInterval(timer.current);
  }, [authed, load]);

  if (!authed) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 30, fontWeight: 600, color: C.text }}>Validation layer</h1>
        <p style={{ color: C.muted }}>Enter the admin secret.</p>
        <div style={{ display: "flex", gap: 8, maxWidth: 480 }}>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_SECRET" style={input} />
          <button onClick={() => { localStorage.setItem("adminToken", token); setAuthed(true); }} disabled={!token} style={btn(!!token)}>Enter</button>
        </div>
      </main>
    );
  }

  const dups = data?.dups || [];
  const salts = data?.salts || [];
  const events = data?.events || [];
  const pending = dups.filter((d) => d.status === "pending");
  const resolved = dups.filter((d) => d.status !== "pending");

  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 30, fontWeight: 600, margin: 0, color: C.text }}>Validation layer</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ ...pill("pending"), background: "var(--code-bg)", color: C.muted }}>● live · auto-refresh</span>
          <button onClick={toggleTheme} style={ghost} aria-label="Toggle night mode">{theme === "dark" ? "☀ Light" : "🌙 Night"}</button>
          <a href="/admin" style={ghostLink}>← Admin</a>
        </div>
      </div>

      <p style={{ color: C.muted, margin: 0 }}>
        Automated and read-only. Tokens pushed by the standalones are scanned for a shared salt on
        arrival — a shared salt means the <strong>same person</strong> applied at two institutions.
        The layer holds <strong>no identity key</strong>, so salts stay anonymous here; the two
        institutions confirm who it is and approve which RULI to keep in their own exe.
      </p>

      {error && <div style={errBox}>{error}</div>}

      <section style={card}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", color: C.muted }}>
          <span>Registered Institutions: <strong style={{ color: C.text }}>{data?.registeredExes ?? 0}</strong></span>
          <span>Duplicate candidates: <strong style={{ color: C.text }}>{dups.length}</strong></span>
          <span>Awaiting institution approval: <strong style={{ color: C.text }}>{pending.length}</strong></span>
          <span>Resolved: <strong style={{ color: C.text }}>{resolved.length}</strong></span>
        </div>
      </section>

      {dups.length === 0 && <p style={{ color: C.muted }}>No duplicate candidates detected yet.</p>}

      {dups.map((d) => (
        <section key={d.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: 16, margin: 0, color: C.text, fontFamily: "monospace" }}>
              salt {String(d.salt).slice(0, 16)}…
            </h2>
            <span style={pill(d.status)}>{d.status === "pending" ? "awaiting approval" : d.status}</span>
          </div>
          <div style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>same person at two institutions — confirm identity in the exe</div>
          {d.status !== "pending" && (
            <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>
              {d.canonical_ruli ? <>canonical RULI <code>{d.canonical_ruli}</code></> : "—"}
              {d.decided_by && <> · by {d.decided_by}</>}
              {d.decided_at && <> · {new Date(d.decided_at).toLocaleString()}</>}
            </div>
          )}
        </section>
      ))}

      {/* Stored-salt ledger: every salt the standalone has pushed, the institutions
          that submitted it, and when it was first seen / last re-pushed. */}
      <section style={card}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px", color: C.text }}>
          Stored salts <span style={{ color: C.muted, fontWeight: 400 }}>({salts.length})</span>
        </h2>
        {salts.length === 0 ? (
          <p style={{ color: C.muted, margin: 0 }}>No salts stored yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Salt</th>
                  <th style={th}>Institutions</th>
                  <th style={{ ...th, textAlign: "right" }}>Tokens</th>
                  <th style={th}>Created</th>
                  <th style={th}>Edited</th>
                </tr>
              </thead>
              <tbody>
                {salts.map((s) => (
                  <tr key={s.salt}>
                    <td style={{ ...tdc, fontFamily: "monospace", fontSize: 12 }}>{String(s.salt).slice(0, 24)}…</td>
                    <td style={tdc}>{(s.institutions || []).join(", ") || <span style={{ color: C.muted }}>unknown</span>}</td>
                    <td style={{ ...tdc, textAlign: "right" }}>{s.tokenCount}</td>
                    <td style={{ ...tdc, color: C.muted, whiteSpace: "nowrap" }}>{fmt(s.created_at)}</td>
                    <td style={{ ...tdc, color: C.muted, whiteSpace: "nowrap" }}>{fmt(s.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Activity log: append-only record of pushes, scans, decisions, key changes. */}
      <section style={card}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px", color: C.text }}>
          Activity log <span style={{ color: C.muted, fontWeight: 400 }}>({events.length})</span>
        </h2>
        {events.length === 0 ? (
          <p style={{ color: C.muted, margin: 0 }}>No activity recorded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {events.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 13, borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                <span style={pill(eventTone(e.kind))}>{e.kind}</span>
                {e.institution && <span style={{ color: C.text }}>{e.institution}</span>}
                <span style={{ color: C.muted }}>{eventDetail(e.detail)}</span>
                <span style={{ color: C.muted, marginLeft: "auto", whiteSpace: "nowrap" }}>{fmt(e.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// Compact, human description of an event's detail payload.
function eventDetail(detail) {
  if (!detail || typeof detail !== "object") return "";
  const bits = [];
  if (detail.inserted != null) bits.push(`${detail.inserted} token${detail.inserted === 1 ? "" : "s"}`);
  if (detail.duplicatesFound != null) bits.push(`${detail.duplicatesFound} dup salt${detail.duplicatesFound === 1 ? "" : "s"}`);
  if (detail.created != null) bits.push(`${detail.created} new`);
  if (detail.decision) bits.push(detail.decision);
  if (detail.canonicalRuli) bits.push(`keep ${detail.canonicalRuli}`);
  return bits.join(" · ");
}

function eventTone(kind) {
  if (kind === "decide") return "approved";
  if (kind === "ruli_key_register") return "approved";
  return "pending";
}

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? "—" : d.toLocaleString();
}

const wrap = { minHeight: "100vh", background: "var(--bg)", color: C.text, maxWidth: "none", margin: 0, padding: "48px max(28px, calc((100% - 1000px) / 2))", display: "grid", gap: 16, alignContent: "start" };
const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "6px 10px", color: "var(--muted)", fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const tdc = { padding: "8px 10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
const errBox = { background: "var(--err-bg)", color: "var(--err-text)", borderRadius: 8, padding: "10px 14px" };
const input = { padding: "10px 12px", fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 8, flex: "1 1 150px", minWidth: 0, background: "var(--field-bg)", color: C.text };
function btn(on) { return { background: on ? C.accent : "var(--disabled)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 500, cursor: on ? "pointer" : "default" }; }
const ghost = { background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", color: C.text };
const ghostLink = { ...ghost, textDecoration: "none", display: "inline-block" };
function pill(status) {
  const map = { pending: ["var(--accent-soft)", C.accent], approved: ["rgba(46,204,113,.15)", "#2ecc71"], merged: ["rgba(46,204,113,.15)", "#2ecc71"], denied: ["var(--err-bg)", "var(--err-text)"] };
  const [bg, color] = map[status] || ["var(--code-bg)", C.muted];
  return { background: bg, color, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 };
}
