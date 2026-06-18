"use client";

import { useState, useEffect, useCallback } from "react";
import CopyableId from "../components/CopyableId";

// Interim admin portal: gated by ADMIN_SECRET (typed once, kept in this
// tab's sessionStorage). Once Google SSO is wired, this whole gate is
// replaced by an admin-role session check.

const C = {
  border: "#e3e6ea", muted: "#6b7280", accent: "#2563eb", card: "#fff",
  errBg: "#fef2f2", errText: "#b91c1c", okBg: "#ecfdf5", okText: "#047857", codeBg: "#f3f4f6",
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
export default function AdminPage() {
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
        <h1 style={{ fontSize: 30, fontWeight: 600 }}>Admin</h1>
        <p style={{ color: C.muted }}>Enter the admin secret to manage ingest credentials.</p>
        <div style={{ display: "flex", gap: 8, maxWidth: 480 }}>
          <input
            type="password" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_SECRET" style={input}
          />
          <button
            onClick={() => { localStorage.setItem("adminToken", token); setAuthed(true); }}
            disabled={!token} style={btn(!!token)}
          >Enter</button>
        </div>
      </main>
    );
  }
  return <Portal token={token} onSignOut={() => { localStorage.removeItem("adminToken"); setAuthed(false); }} />;
}

function Portal({ token, onSignOut }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suggCount, setSuggCount] = useState(0);

  const api = useCallback(async (path, method = "GET", body) => {
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [overview, sugg] = await Promise.all([
        api("/api/admin/overview"),
        api("/api/admin/alias-suggestions").catch(() => ({ count: 0 })),
      ]);
      setData(overview);
      setSuggCount(sugg.count ?? 0);
    }
    catch (e) { setError(String(e.message)); if (/unauthorized/i.test(e.message)) onSignOut(); }
    finally { setLoading(false); }
  }, [api, onSignOut]);

  useEffect(() => { load(); }, [load]);

  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 600, margin: 0 }}>Admin · ingest</h1>
          {suggCount > 0 && (
            <span style={{
              background: "#ef4444", color: "#fff", fontWeight: 700,
              fontSize: 13, borderRadius: 999, padding: "2px 9px", lineHeight: 1.5,
            }}>
              {suggCount} pending
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/admin/access" style={{ ...ghost, textDecoration: "none", color: "#1a1d21", display: "inline-block" }}>Users &amp; access</a>
          <a href="/admin/validation" style={{ ...ghost, textDecoration: "none", color: "#1a1d21", display: "inline-block" }}>Validation rules</a>
          <a href="/validation" style={{ ...ghost, textDecoration: "none", color: "#1a1d21", display: "inline-block" }}>Validation layer</a>
          <button onClick={load} style={ghost}>Refresh</button>
          <button onClick={onSignOut} style={ghost}>Sign out</button>
        </div>
      </div>

      {error && <Box bg={C.errBg} fg={C.errText}>{error}</Box>}
      {loading && <p style={{ color: C.muted }}>Loading…</p>}

      <RuliKeyCard api={api} />

      {data && (
        <>
          <PendingSuggestionsSection api={api} onReload={load} />
          <KeysSection data={data} api={api} reload={load} />
          <SheetsSection data={data} api={api} reload={load} />
          <DownloadSection />
        </>
      )}
    </main>
  );
}

function PendingSuggestionsSection({ api, onReload }) {
  const [suggestions, setSuggestions] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { suggestions: rows } = await api("/api/admin/alias-suggestions");
      setSuggestions(rows);
    } catch (e) { setErr(String(e.message)); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  async function act(id, action) {
    let note;
    if (action === "reject") {
      note = window.prompt("Reason for declining (optional — the uploader sees this):", "");
      if (note === null) return; // cancelled
    }
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      await api("/api/admin/alias-suggestions", "POST", { id, action, note });
      await load();
      onReload(); // refresh badge count
    } catch (e) {
      setErr(String(e.message));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  }

  if (!suggestions) return null;

  return (
    <section style={{ ...card, borderColor: suggestions.length ? "#fca5a5" : C.border }}>
      <h2 style={h2}>
        Alias suggestions
        {suggestions.length > 0 && (
          <span style={{
            marginLeft: 10, background: "#ef4444", color: "#fff",
            fontSize: 13, fontWeight: 700, borderRadius: 999, padding: "1px 8px",
          }}>
            {suggestions.length}
          </span>
        )}
      </h2>
      {err && <Box bg={C.errBg} fg={C.errText}>{err}</Box>}
      {suggestions.length === 0 ? (
        <p style={{ color: C.muted, margin: 0, fontSize: 14 }}>No pending suggestions.</p>
      ) : (
        <>
          <p style={{ color: C.muted, marginTop: 0, fontSize: 14 }}>
            Uploaders mapped unrecognized values to canonical options.
            Approve to add the mapping to validation rules for everyone going forward.
          </p>
          <Table head={["Field", "Uploaded value", "Mapped to", "Institution", "Submitted", ""]}>
            {suggestions.map((s) => (
              <tr key={s.id} style={tr}>
                <td style={td}><b>{s.field}</b></td>
                <td style={td}>
                  <code style={{ background: C.codeBg, padding: "1px 6px", borderRadius: 5, fontSize: 13 }}>
                    {s.variant}
                  </code>
                </td>
                <td style={{ ...td, fontWeight: 600, color: C.accent }}>{s.canonical}</td>
                <td style={{ ...td, color: C.muted }}>{s.institution || "—"}</td>
                <td style={{ ...td, color: C.muted }}>{new Date(s.submitted_at).toLocaleString()}</td>
                <td style={{ ...td, display: "flex", gap: 6 }}>
                  <button
                    disabled={!!busy[s.id]}
                    onClick={() => act(s.id, "approve")}
                    style={{ ...btn(true), padding: "6px 14px", fontSize: 13 }}
                  >
                    {busy[s.id] === "approve" ? "Approving…" : "Approve"}
                  </button>
                  <button
                    disabled={!!busy[s.id]}
                    onClick={() => act(s.id, "reject")}
                    style={{ ...danger, padding: "6px 12px", fontSize: 13 }}
                  >
                    {busy[s.id] === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </section>
  );
}

function schoolLabel(data, schoolId) {
  const s = data.schools.find((x) => x.id === schoolId);
  return s ? `${s.code} — ${s.name}` : `#${schoolId}`;
}

function KeysSection({ data, api, reload }) {
  const [schoolCode, setSchoolCode] = useState("");
  const [label, setLabel] = useState("");
  const [rawKey, setRawKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function create() {
    setBusy(true); setErr(null); setRawKey(null);
    try {
      const out = await api("/api/admin/keys", "POST", { schoolCode, label });
      setRawKey(out.rawKey); setLabel(""); await reload();
    } catch (e) { setErr(String(e.message)); } finally { setBusy(false); }
  }
  async function revoke(id) {
    if (!confirm("Revoke this key? Anything using it stops working.")) return;
    try { await api("/api/admin/keys/revoke", "POST", { keyId: id }); await reload(); }
    catch (e) { setErr(String(e.message)); }
  }

  return (
    <section style={card}>
      <h2 style={h2}>API keys</h2>

      <div style={row}>
        <select value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} style={input}>
          <option value="">Select school…</option>
          {data.schools.map((s) => <option key={s.id} value={s.code}>{s.code} — {s.name}</option>)}
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label (e.g. office PC)" style={input} />
        <button onClick={create} disabled={!schoolCode || busy} style={btn(!!schoolCode && !busy)}>
          {busy ? "Issuing…" : "Issue key"}
        </button>
      </div>
      {err && <Box bg={C.errBg} fg={C.errText}>{err}</Box>}
      {rawKey && (
        <Box bg={C.okBg} fg={C.okText}>
          Copy now — shown once:
          <CopyableId value={rawKey} chars={Infinity} color={C.okText} accentColor={C.okText} fontSize={13} />
        </Box>
      )}

      <Table head={["School", "Label", "Status", "Last used", ""]}>
        {data.keys.map((k) => (
          <tr key={k.id} style={tr}>
            <td style={td}>{schoolLabel(data, k.school_id)}</td>
            <td style={td}>{k.label || "—"}</td>
            <td style={{ ...td, color: k.revoked ? C.errText : C.okText }}>{k.revoked ? "revoked" : "active"}</td>
            <td style={{ ...td, color: C.muted }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</td>
            <td style={td}>{!k.revoked && <button onClick={() => revoke(k.id)} style={danger}>Revoke</button>}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function SheetsSection({ data, api, reload }) {
  const [schoolCode, setSchoolCode] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [range, setRange] = useState("A:Z");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function add() {
    setBusy(true); setErr(null);
    try {
      await api("/api/admin/sheets", "POST", { schoolCode, spreadsheetId, range });
      setSpreadsheetId(""); await reload();
    } catch (e) { setErr(String(e.message)); } finally { setBusy(false); }
  }
  async function toggle(id, enabled) {
    try { await api("/api/admin/sheets/toggle", "POST", { sheetId: id, enabled }); await reload(); }
    catch (e) { setErr(String(e.message)); }
  }

  return (
    <section style={card}>
      <h2 style={h2}>Google Sheets</h2>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 14 }}>
        School must share the sheet (Viewer) with the service account. Cron pulls enabled rows daily.
      </p>

      <div style={row}>
        <select value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} style={input}>
          <option value="">Select school…</option>
          {data.schools.map((s) => <option key={s.id} value={s.code}>{s.code} — {s.name}</option>)}
        </select>
        <input value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} placeholder="spreadsheet id" style={input} />
        <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="A:Z" style={{ ...input, maxWidth: 110 }} />
        <button onClick={add} disabled={!schoolCode || !spreadsheetId || busy} style={btn(!!schoolCode && !!spreadsheetId && !busy)}>
          {busy ? "Adding…" : "Register"}
        </button>
      </div>
      {err && <Box bg={C.errBg} fg={C.errText}>{err}</Box>}

      <Table head={["School", "Spreadsheet", "Range", "Enabled", "Last sync", "Status", ""]}>
        {data.sheets.map((sh) => (
          <tr key={sh.id} style={tr}>
            <td style={td}>{schoolLabel(data, sh.school_id)}</td>
            <td style={td}><CopyableId value={sh.spreadsheet_id} fontSize={12} color={C.muted} accentColor={C.accent} /></td>
            <td style={td}>{sh.range_a1}</td>
            <td style={{ ...td, color: sh.enabled ? C.okText : C.muted }}>{sh.enabled ? "yes" : "no"}</td>
            <td style={{ ...td, color: C.muted }}>{sh.last_synced_at ? new Date(sh.last_synced_at).toLocaleString() : "—"}</td>
            <td style={{ ...td, color: C.muted, maxWidth: 220 }}>{sh.last_status || "—"}</td>
            <td style={td}>
              <button onClick={() => toggle(sh.id, !sh.enabled)} style={ghost}>{sh.enabled ? "Disable" : "Enable"}</button>
            </td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function DownloadSection() {
  const ENTITIES = ["staff", "student", "institution"];
  const [entity, setEntity] = useState("staff");
  return (
    <section style={card}>
      <h2 style={h2}>Downloads</h2>
      <p style={{ color: C.muted, marginTop: 0, fontSize: 14 }}>
        Download anonymized records or RULI mapping files.
      </p>
      <div style={row}>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} style={{ ...input, flex: "0 1 180px" }}>
          {ENTITIES.map((e) => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>
        <a href={`/api/download?entity=${entity}&type=records`} download style={ghost}>
          Download records
        </a>
        <a href={`/api/download?entity=${entity}&type=mapping`} download style={ghost}>
          Download RULI mapping
        </a>
      </div>
    </section>
  );
}

// ---- tiny presentational helpers ----
function Box({ bg, fg, children }) {
  return <div style={{ background: bg, color: fg, border: `1px solid ${bg}`, borderRadius: 8, padding: "10px 14px", margin: "12px 0", fontSize: 14 }}>{children}</div>;
}

// Per-exe RULI Mapper keys. READ-ONLY: each institution's standalone GENERATES
// its own unique key and self-registers it via /api/validation/ruli-key. This
// card lists the registered exes (keys masked).
function RuliKeyCard({ api }) {
  const [keys, setKeys] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    api("/api/admin/ruli-key")
      .then((r) => setKeys(r.keys || []))
      .catch((e) => setErr(String(e.message)));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : "—");

  return (
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px" }}>RULI Mapper keys</h2>
        <button onClick={load} style={ghost}>Refresh</button>
      </div>
      <p style={{ color: C.muted, margin: "0 0 12px", fontSize: 14 }}>
        Each institution’s standalone generates its own key and registers it with the validation
        layer. The app authenticates every push against this set. Keys are generated in the exe — not here.
      </p>
      {err && <Box bg={C.errBg} fg={C.errText}>{err}</Box>}
      {keys && keys.length === 0 && !err && (
        <Box bg={C.codeBg || "var(--code-bg)"} fg={C.muted}>
          No exes registered yet — open the RULI Mapper exe (Settings → Upload key to validation layer).
        </Box>
      )}
      {keys && keys.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={thCell}>Key</th>
                <th style={thCell}>Institution</th>
                <th style={thCell}>Registered</th>
                <th style={thCell}>Last used</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td style={{ ...tdCell, fontFamily: "monospace" }}>{k.keyHint}</td>
                  <td style={tdCell}>{k.institution || <span style={{ color: C.muted }}>—</span>}</td>
                  <td style={{ ...tdCell, color: C.muted, whiteSpace: "nowrap" }}>{fmt(k.created_at)}</td>
                  <td style={{ ...tdCell, color: C.muted, whiteSpace: "nowrap" }}>{fmt(k.last_used_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const thCell = { textAlign: "left", padding: "6px 10px", color: "var(--muted)", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const tdCell = { padding: "8px 10px", borderBottom: "1px solid var(--border)" };
function Table({ head, children }) {
  return (
    <div style={{ overflowX: "auto", marginTop: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead><tr style={{ textAlign: "left", color: C.muted }}>{head.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const wrap = { maxWidth: 1100, margin: "0 auto", padding: "48px 28px", display: "grid", gap: 20 };
const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 22 };
const h2 = { fontSize: 20, fontWeight: 600, margin: "0 0 14px" };
const row = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const input = { padding: "10px 12px", fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 8, flex: "1 1 180px", minWidth: 0 };
const th = { padding: "10px 14px 10px 0", fontWeight: 500 };
const td = { padding: "11px 14px 11px 0" };
const tr = { borderTop: `1px solid ${C.border}` };
const codeInline = { display: "block", marginTop: 6, fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" };
function btn(on) { return { background: on ? C.accent : "#9ca3af", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 15, fontWeight: 500, cursor: on ? "pointer" : "default" }; }
const ghost = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: "pointer" };
const danger = { background: "#fff", border: "1px solid #fecaca", color: C.errText, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" };
