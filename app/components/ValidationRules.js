"use client";

import { useState, useEffect, useCallback } from "react";

// Shared, theme-aware view of the active validation rules. Used by the admin
// validation page (full edit) and by the main page's collapsible dropdown
// (read-only unless an admin token is passed). All colors read CSS theme vars
// so it works in both light and dark.
//
// Props:
//   token   : admin secret -> enables add/delete of value mappings + shows them
//   compact : tighter spacing for the embedded dropdown
export default function ValidationRules({ token: forcedToken = null, compact = false }) {
  const [schema, setSchema] = useState(null);
  const [aliases, setAliases] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Token: a parent (the admin page) can force one; otherwise read the shared
  // adminToken from localStorage so unlocking anywhere (e.g. the Access-RLS
  // drill-down panel) auto-enables editing here too. The drill-down unlock
  // dispatches "admin-token-change"; we also listen to cross-tab "storage".
  const [token, setTokenState] = useState(forcedToken || "");
  const [keyInput, setKeyInput] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (forcedToken) { setTokenState(forcedToken); return; }
    const sync = () => setTokenState(localStorage.getItem("adminToken") || "");
    sync();
    window.addEventListener("admin-token-change", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("admin-token-change", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [forcedToken]);

  function unlock() {
    if (!keyInput) return;
    localStorage.setItem("adminToken", keyInput);
    window.dispatchEvent(new Event("admin-token-change"));
    setTokenState(keyInput);
    setKeyInput("");
  }

  const hasToken = !!token;       // admin key present -> editing is allowed
  const canEdit = hasToken && editing;  // actually showing edit controls

  const api = useCallback(async (path, method = "GET", body) => {
    const res = await fetch(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const sc = await api("/api/admin/schema");
      setSchema(sc.entities);
      // Mappings are admin-gated; only fetch them when we have a token.
      if (token) setAliases((await api("/api/admin/value-aliases")).aliases);
      else setAliases([]);
    } catch (e) { setError(String(e.message)); }
    finally { setLoading(false); }
  }, [api, token]);

  useEffect(() => { load(); }, [load]);

  async function addAlias(payload) {
    try { await api("/api/admin/value-aliases", "POST", payload); load(); }
    catch (e) { setError(e.message); throw e; }
  }
  async function del(id) {
    try { await api(`/api/admin/value-aliases?id=${id}`, "DELETE"); load(); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <p style={{ color: V.muted, margin: 0 }}>Loading…</p>;

  const entities = schema ? Object.entries(schema).filter(([, e]) => e.fields.length) : [];
  const byField = {};
  for (const a of aliases) (byField[`${a.entity}|${a.field}`] ||= []).push(a);

  return (
    <div style={{ display: "grid", gap: compact ? 14 : 20 }}>
      {error && <div style={{ background: "var(--err-bg)", color: V.errText, borderRadius: 8, padding: "10px 14px" }}>{error}</div>}
      {!hasToken && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: V.muted, fontSize: 13 }}>Read-only. Enter the admin key to edit value mappings:</span>
          <input
            type="password" placeholder="Admin key" value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
            style={{ ...input, flex: "0 1 200px" }}
          />
          <button onClick={unlock} disabled={!keyInput} style={btn(!!keyInput)}>Unlock</button>
        </div>
      )}
      {hasToken && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => setEditing((e) => !e)}
            style={editing
              ? { ...btn(true) }
              : { ...btn(false), background: "transparent", color: V.text, border: `1px solid ${V.border}`, cursor: "pointer" }}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      )}
      {!entities.length && <p style={{ color: V.muted, margin: 0 }}>No rules defined.</p>}
      {entities.map(([entity, e]) => (
        <section key={entity}>
          <h2 style={h2}>{entity} fields ({e.fields.length})</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {e.fields.map((f) => (
              <FieldRow
                key={f.field}
                entity={entity}
                field={f}
                aliases={byField[`${entity}|${f.field}`] || []}
                hasToken={hasToken}
                canEdit={canEdit}
                onAdd={addAlias}
                onDelete={del}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FieldRow({ entity, field, aliases, hasToken, canEdit, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState("");
  const [canonical, setCanonical] = useState(field.values?.[0] || "");
  const [busy, setBusy] = useState(false);

  const isEnum = field.type === "enum";

  async function add() {
    if (!variant.trim() || !canonical.trim()) return;
    setBusy(true);
    try {
      await onAdd({ entity, field: field.field, variant: variant.trim(), canonical: canonical.trim() });
      setVariant(""); setCanonical(field.values?.[0] || "");
    } catch { /* surfaced by parent */ }
    finally { setBusy(false); }
  }

  return (
    <div style={{ border: `1px solid ${V.border}`, borderRadius: 8, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={rowHeader}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ color: V.muted, width: 12 }}>{open ? "▾" : "▸"}</span>
          <code style={{ fontSize: 14, fontWeight: 600, color: V.text }}>{field.field}</code>
          {field.required && <span style={pill("var(--accent-soft)", V.accent)}>required</span>}
          <span style={pill(V.codeBg, V.muted)}>{field.type}</span>
        </span>
        <span style={{ color: V.muted, fontSize: 12, whiteSpace: "nowrap" }}>
          {field.headerAliases.length} variation{field.headerAliases.length === 1 ? "" : "s"}
          {hasToken && ` · ${aliases.length} mapping${aliases.length === 1 ? "" : "s"}`}
        </span>
      </button>

      {open && (
        <div style={{ padding: "14px 16px", borderTop: `1px solid ${V.border}`, background: V.card, display: "grid", gap: 14 }}>
          {isEnum && (
            <Detail label="Allowed values">
              {field.values.map((v) => <code key={v} style={chip}>{v}</code>)}
            </Detail>
          )}
          {!isEnum && (
            <Detail label="Type / constraints">
              <span style={{ fontSize: 13, color: V.muted }}>
                {field.type}
                {field.constraints.min != null && ` · min ${field.constraints.min}`}
                {field.constraints.max != null && ` · max ${field.constraints.max}`}
                {field.constraints.minLen != null && ` · minLen ${field.constraints.minLen}`}
                {field.constraints.maxLen != null && ` · maxLen ${field.constraints.maxLen}`}
              </span>
            </Detail>
          )}

          <Detail label="Accepted header names">
            <code style={chip}>{field.field}</code>
            {field.headerAliases.map((h) => <code key={h} style={chip}>{h}</code>)}
            <span style={{ fontSize: 12, color: V.muted, alignSelf: "center" }}>(defined in code · read-only)</span>
          </Detail>

          {canEdit && (
            <Detail label={`Value mappings (${aliases.length})`}>
              {aliases.length === 0
                ? <span style={{ fontSize: 13, color: V.muted, alignSelf: "center" }}>None yet.</span>
                : (
                  <div style={{ display: "grid", gap: 6, width: "100%" }}>
                    {aliases.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <code style={chip}>{a.variant}</code>
                        <span style={{ color: V.muted }}>→</span>
                        <code style={chip}>{a.canonical}</code>
                        <button onClick={() => onDelete(a.id)} style={danger}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
            </Detail>
          )}

          {canEdit && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input style={{ ...input, flex: "1 1 140px" }} placeholder="variant (e.g. Male)" value={variant} onChange={(e) => setVariant(e.target.value)} />
              <span style={{ color: V.muted }}>→</span>
              {isEnum ? (
                <select style={{ ...input, flex: "0 1 140px" }} value={canonical} onChange={(e) => setCanonical(e.target.value)}>
                  {field.values.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input style={{ ...input, flex: "1 1 140px" }} placeholder="canonical" value={canonical} onChange={(e) => setCanonical(e.target.value)} />
              )}
              <button onClick={add} disabled={busy || !variant.trim() || !canonical.trim()} style={btn(!busy && !!variant.trim() && !!canonical.trim())}>
                {busy ? "Adding…" : "Add mapping"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: V.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

// All theme-aware (CSS vars) so the component renders correctly in light + dark.
const V = {
  border: "var(--border)", muted: "var(--muted)", accent: "var(--accent)",
  card: "var(--card)", cardAlt: "var(--card-alt)", codeBg: "var(--code-bg)",
  errText: "var(--err-text)", text: "var(--text)",
};
const h2 = { fontSize: 18, fontWeight: 600, margin: "0 0 12px", color: V.text };
const input = { padding: "9px 11px", fontSize: 14, border: `1px solid ${V.border}`, borderRadius: 8, background: "var(--field-bg)", color: V.text, minWidth: 0 };
const rowHeader = { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: V.cardAlt, border: "none", padding: "11px 14px", cursor: "pointer", textAlign: "left", color: V.text };
const chip = { background: V.codeBg, border: `1px solid ${V.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 13, color: V.text };
const danger = { background: "transparent", border: `1px solid var(--err-border)`, color: V.errText, borderRadius: 8, padding: "6px 11px", fontSize: 13, cursor: "pointer" };
function btn(on) { return { background: on ? V.accent : "var(--disabled)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 500, cursor: on ? "pointer" : "default" }; }
function pill(bg, color) { return { background: bg, color, borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 600 }; }
