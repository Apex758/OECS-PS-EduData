"use client";

import { useState, useEffect } from "react";
import ValidationRules from "@/app/components/ValidationRules";

// Admin · Validation rules. Full editor for the active validation rules:
// per-field allowed values, accepted header names, and editable value
// mappings (Male->M). Same ADMIN_SECRET gate as the rest of /admin.

const C = {
  border: "var(--border)", muted: "var(--muted)", accent: "var(--accent)",
  card: "var(--card)", text: "var(--text)",
};

function useAdminTokenKeyguard() {
  useEffect(() => {
    let willReload = false;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") willReload = true;
    };
    const onUnload = () => { if (willReload) localStorage.removeItem("adminToken"); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
}

export default function ValidationPage() {
  useAdminTokenKeyguard();
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    const t = localStorage.getItem("adminToken");
    if (t) { setToken(t); setAuthed(true); }
  }, []);

  if (!authed) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 30, fontWeight: 600, color: C.text }}>Admin · validation</h1>
        <p style={{ color: C.muted }}>Enter the admin secret.</p>
        <div style={{ display: "flex", gap: 8, maxWidth: 480 }}>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_SECRET" style={input} />
          <button onClick={() => { localStorage.setItem("adminToken", token); setAuthed(true); }} disabled={!token} style={btn(!!token)}>Enter</button>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 30, fontWeight: 600, margin: 0, color: C.text }}>Admin · validation rules</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin/access" style={ghostLink}>← Access</a>
          <button onClick={() => { localStorage.removeItem("adminToken"); setAuthed(false); }} style={ghost}>Sign out</button>
        </div>
      </div>

      <p style={{ color: C.muted, margin: 0 }}>
        The active validation rules per field — allowed values, the header names accepted for
        each field, and the value mappings (e.g. “Male” → “M”) that normalize rejected values.
        Mappings you add or approve apply automatically on every future upload.
      </p>

      <section style={card}>
        <ValidationRules token={token} />
      </section>
    </main>
  );
}

const wrap = { maxWidth: 1000, margin: "0 auto", padding: "48px 28px", display: "grid", gap: 20 };
const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 22 };
const input = { padding: "10px 12px", fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 8, flex: "1 1 150px", minWidth: 0, background: "var(--field-bg)", color: C.text };
function btn(on) { return { background: on ? C.accent : "var(--disabled)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 15, fontWeight: 500, cursor: on ? "pointer" : "default" }; }
const ghost = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 13px", fontSize: 13, cursor: "pointer", color: C.text };
const ghostLink = { ...ghost, textDecoration: "none", display: "inline-block" };
