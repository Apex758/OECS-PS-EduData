"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Admin · User & Access management. Same interim gate as /admin
// (ADMIN_SECRET in this tab's sessionStorage). Edits app_users + scope, the
// minister drill-down flag, and bulk-registers users from a filled template.

const C = {
  border: "#e3e6ea", muted: "#6b7280", accent: "#2563eb", card: "#fff",
  errBg: "#fef2f2", errText: "#b91c1c", okBg: "#ecfdf5", okText: "#047857", codeBg: "#f3f4f6",
};
const ROLES = ["teacher", "minister", "admin"];


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
export default function AccessPage() {
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
        <h1 style={{ fontSize: 30, fontWeight: 600 }}>Admin · access</h1>
        <p style={{ color: C.muted }}>Enter the admin secret to manage users and access.</p>
        <div style={{ display: "flex", gap: 8, maxWidth: 480 }}>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_SECRET" style={input} />
          <button onClick={() => { localStorage.setItem("adminToken", token); setAuthed(true); }}
            disabled={!token} style={btn(!!token)}>Enter</button>
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
    try { setData(await api("/api/admin/users")); }
    catch (e) { setError(String(e.message)); if (/admin only/i.test(e.message)) onSignOut(); }
    finally { setLoading(false); }
  }, [api, onSignOut]);

  useEffect(() => { load(); }, [load]);

  async function exportUsers() {
    const res = await fetch("/api/admin/users/export", { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "users.json"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 30, fontWeight: 600, margin: 0 }}>Admin · access</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/admin" style={ghostLink}>← Ingest</a>
          <a href="/admin/validation" style={ghostLink}>Validation rules →</a>
          <button onClick={load} style={ghost}>Refresh</button>
          <button onClick={onSignOut} style={ghost}>Sign out</button>
        </div>
      </div>

      {error && <Box bg={C.errBg} fg={C.errText}>{error}</Box>}
      {loading && <p style={{ color: C.muted }}>Loading…</p>}

      {data && (
        <>
          <ImportCard api={api} reload={load} />
          <UsersCard data={data} api={api} reload={load} exportUsers={exportUsers} />
          <DrillDownCard api={api} />
        </>
      )}
    </main>
  );
}

function UsersCard({ data, api, reload, exportUsers }) {
  return (
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ ...h2, margin: 0 }}>Registered users ({data.users.length})</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/api/admin/users/template" style={ghostLink}>Download template</a>
          <button onClick={exportUsers} style={ghost}>Export users.json</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: C.muted }}>
              <th style={th}>Email</th><th style={th}>Name</th><th style={th}>Role</th>
              <th style={th}>Territory</th><th style={th}>Schools</th>
              <th style={th}>Drill-down</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => <UserRow key={u.id} u={u} data={data} api={api} reload={reload} />)}
            <NewUserRow data={data} api={api} reload={reload} />
          </tbody>
        </table>
      </div>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>
        Drill-down applies to ministers only: ON = see individual students; OFF = aggregate
        counts only (enforced by row-level security). Schools: space/comma separated codes
        (teachers). Available: {data.schools.map((s) => s.code).join(", ")}.
      </p>
    </section>
  );
}

function UserRow({ u, data, api, reload }) {
  const [d, setD] = useState({
    name: u.name || "", role: u.role, country_iso: u.country_iso || "",
    schools: (u.schools || []).join(" "), can_drill_students: u.can_drill_students,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api("/api/admin/users", "PUT", {
        email: u.email, name: d.name, role: d.role,
        country_iso: d.country_iso || null,
        schools: d.schools.split(/[;,\s]+/).filter(Boolean),
        can_drill_students: d.can_drill_students,
      });
      setMsg("saved"); reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function del() {
    if (!confirm(`Delete ${u.email}?`)) return;
    setBusy(true);
    try { await api(`/api/admin/users?email=${encodeURIComponent(u.email)}`, "DELETE"); reload(); }
    catch (e) { setMsg(e.message); setBusy(false); }
  }

  return (
    <tr style={tr}>
      <td style={td}>{u.email}{u.is_demo && <span style={tag}>demo</span>}</td>
      <td style={td}><input style={cell} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></td>
      <td style={td}>
        <select style={cell} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </td>
      <td style={td}>
        <select style={cell} value={d.country_iso} onChange={(e) => setD({ ...d, country_iso: e.target.value })}>
          <option value="">—</option>
          {data.countries.map((c) => <option key={c.iso_code} value={c.iso_code}>{c.iso_code}</option>)}
        </select>
      </td>
      <td style={td}><input style={{ ...cell, minWidth: 110 }} value={d.schools}
        onChange={(e) => setD({ ...d, schools: e.target.value })} placeholder={d.role === "teacher" ? "JM-S1" : ""} /></td>
      <td style={td}>
        {d.role === "minister"
          ? <input type="checkbox" checked={d.can_drill_students}
              onChange={(e) => setD({ ...d, can_drill_students: e.target.checked })} />
          : <span style={{ color: C.muted }}>—</span>}
      </td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        <button onClick={save} disabled={busy} style={ghost}>Save</button>{" "}
        <button onClick={del} disabled={busy} style={danger}>Delete</button>
        {msg && <span style={{ marginLeft: 6, fontSize: 12, color: msg === "saved" ? C.okText : C.errText }}>{msg}</span>}
      </td>
    </tr>
  );
}

function NewUserRow({ data, api, reload }) {
  const [d, setD] = useState({ email: "", name: "", role: "teacher", country_iso: "", schools: "", can_drill_students: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function add() {
    setBusy(true); setMsg(null);
    try {
      await api("/api/admin/users", "PUT", {
        email: d.email, name: d.name, role: d.role, country_iso: d.country_iso || null,
        schools: d.schools.split(/[;,\s]+/).filter(Boolean), can_drill_students: d.can_drill_students,
      });
      setD({ email: "", name: "", role: "teacher", country_iso: "", schools: "", can_drill_students: true });
      reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  return (
    <tr style={{ ...tr, background: C.codeBg }}>
      <td style={td}><input style={cell} value={d.email} placeholder="new@email" onChange={(e) => setD({ ...d, email: e.target.value })} /></td>
      <td style={td}><input style={cell} value={d.name} placeholder="Name" onChange={(e) => setD({ ...d, name: e.target.value })} /></td>
      <td style={td}>
        <select style={cell} value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </td>
      <td style={td}>
        <select style={cell} value={d.country_iso} onChange={(e) => setD({ ...d, country_iso: e.target.value })}>
          <option value="">—</option>
          {data.countries.map((c) => <option key={c.iso_code} value={c.iso_code}>{c.iso_code}</option>)}
        </select>
      </td>
      <td style={td}><input style={{ ...cell, minWidth: 110 }} value={d.schools} placeholder="JM-S1" onChange={(e) => setD({ ...d, schools: e.target.value })} /></td>
      <td style={td}>{d.role === "minister"
        ? <input type="checkbox" checked={d.can_drill_students} onChange={(e) => setD({ ...d, can_drill_students: e.target.checked })} />
        : <span style={{ color: C.muted }}>—</span>}</td>
      <td style={td}>
        <button onClick={add} disabled={busy || !d.email} style={btn(!!d.email && !busy)}>Add</button>
        {msg && <span style={{ marginLeft: 6, fontSize: 12, color: C.errText }}>{msg}</span>}
      </td>
    </tr>
  );
}

function ImportCard({ api, reload }) {
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : "";

  async function upload(file) {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/admin/users/import", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult(json); reload();
    } catch (e) { setError(String(e.message)); } finally { setBusy(false); }
  }

  return (
    <section style={card}>
      <h2 style={h2}>Bulk register (drag in a filled template)</h2>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]); }}
        style={{ border: `2px dashed ${drag ? C.accent : C.border}`, background: drag ? "#eff6ff" : "#fafbfc",
          borderRadius: 10, padding: "26px 20px", textAlign: "center", cursor: "pointer" }}
      >
        <div style={{ fontWeight: 500 }}>{busy ? "Importing…" : "Drop a CSV/XLSX of users here, or click to browse"}</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Columns: email, name, role, country_iso, school_codes, can_drill.{" "}
          <a href="/api/admin/users/template">Download template</a>
        </div>
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" style={{ display: "none" }}
          onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {error && <Box bg={C.errBg} fg={C.errText}>{error}</Box>}
      {result && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <b>{result.imported}</b> imported, <b>{result.failed}</b> failed.
          {result.results.filter((r) => !r.ok).length > 0 && (
            <ul style={{ margin: "8px 0 0", color: C.errText }}>
              {result.results.filter((r) => !r.ok).map((r) => <li key={r.row}>row {r.row} ({r.email}): {r.error}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// Sliding on/off toggle switch (knob moves left -> right).
function Switch({ on, onChange, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        position: "relative", width: 44, height: 24, borderRadius: 999, border: "none",
        padding: 0, flexShrink: 0, cursor: disabled ? "default" : "pointer",
        background: on ? C.accent : "#cbd5e1", opacity: disabled ? 0.5 : 1,
        transition: "background .15s ease", verticalAlign: "middle",
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20,
        borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        transition: "left .15s ease",
      }} />
    </button>
  );
}

const DRILL_LEVELS = ["primary", "secondary", "tertiary"];
const DRILL_LABEL = { primary: "Primary schools", secondary: "Secondary schools", tertiary: "Tertiary institutions" };

// Admin · per-institution / per-level row-level-security drill-down.
// ON  = ministers/teachers for that school may see individual students.
// OFF = they see per-school totals only (RLS hides the student rows).
function DrillDownCard({ api }) {
  const [schools, setSchools] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setSchools((await api("/api/admin/drilldown")).schools); }
    catch (e) { setError(String(e.message)); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function setOne(schoolId, canDrill) {
    setBusy(true); setError(null);
    setSchools((prev) => prev.map((s) => s.id === schoolId ? { ...s, can_drill: canDrill } : s));
    try { await api("/api/admin/drilldown", "POST", { schoolId, canDrill }); }
    catch (e) { setError(String(e.message)); await load(); } finally { setBusy(false); }
  }
  async function setLevel(level, canDrill) {
    setBusy(true); setError(null);
    setSchools((prev) => prev.map((s) => s.level === level ? { ...s, can_drill: canDrill } : s));
    try { await api("/api/admin/drilldown", "POST", { level, canDrill }); }
    catch (e) { setError(String(e.message)); await load(); } finally { setBusy(false); }
  }

  // Group by level, known levels first then anything else.
  const groups = new Map();
  for (const s of schools || []) {
    const lvl = s.level || "other";
    if (!groups.has(lvl)) groups.set(lvl, []);
    groups.get(lvl).push(s);
  }
  const levels = [...groups.keys()].sort((a, b) => {
    const ia = DRILL_LEVELS.indexOf(a), ib = DRILL_LEVELS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <section style={card}>
      <h2 style={h2}>Row-level access · drill-down</h2>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>
        ON = ministers/teachers for that institution may drill down to individual
        students. OFF = per-school totals only (enforced by row-level security; admins
        always see everything). Toggle a whole level, or one institution.
      </p>
      {error && <Box bg={C.errBg} fg={C.errText}>{error}</Box>}
      {!schools && !error && <p style={{ color: C.muted }}>Loading…</p>}

      <div style={{ display: "grid", gap: 22 }}>
        {levels.map((lvl) => {
          const group = groups.get(lvl);
          const allOn = group.every((s) => s.can_drill);
          return (
            <div key={lvl}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "0 0 8px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontWeight: 600, fontSize: 16, color: C.accent }}>
                  {DRILL_LABEL[lvl] || lvl}{" "}
                  <span style={{ color: C.muted, fontWeight: 400, fontSize: 13 }}>({group.length})</span>
                </span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted }}>
                  All {allOn ? "on" : "off"}
                  <Switch on={allOn} disabled={busy} label={`Toggle drill-down for all ${lvl}`}
                    onChange={(v) => setLevel(lvl, v)} />
                </label>
              </div>
              <div>
                {group.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 12, padding: "10px 0", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>
                        {s.code} · {s.country} · {s.students} students
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                      color: s.can_drill ? C.okText : C.muted, whiteSpace: "nowrap" }}>
                      {s.can_drill ? "drill-down" : "aggregate"}
                      <Switch on={s.can_drill} disabled={busy} label={`Toggle drill-down for ${s.name}`}
                        onChange={(v) => setOne(s.id, v)} />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Box({ bg, fg, children }) {
  return <div style={{ background: bg, color: fg, border: `1px solid ${bg}`, borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>{children}</div>;
}

const wrap = { maxWidth: 1100, margin: "0 auto", padding: "48px 28px", display: "grid", gap: 20 };
const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 22 };
const h2 = { fontSize: 20, fontWeight: 600, margin: "0 0 14px" };
const input = { padding: "10px 12px", fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 8, flex: "1 1 180px", minWidth: 0 };
const cell = { padding: "6px 8px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 6, width: "100%", minWidth: 70, boxSizing: "border-box" };
const th = { padding: "10px 14px 10px 0", fontWeight: 500 };
const td = { padding: "9px 10px 9px 0", verticalAlign: "middle" };
const tr = { borderTop: `1px solid ${C.border}` };
const tag = { marginLeft: 6, fontSize: 11, background: C.codeBg, color: C.muted, padding: "1px 6px", borderRadius: 6 };
function btn(on) { return { background: on ? C.accent : "#9ca3af", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 500, cursor: on ? "pointer" : "default" }; }
const ghost = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 13px", fontSize: 13, cursor: "pointer" };
const ghostLink = { ...ghost, textDecoration: "none", color: "#1a1d21", display: "inline-block" };
const danger = { background: "#fff", border: "1px solid #fecaca", color: C.errText, borderRadius: 8, padding: "6px 11px", fontSize: 13, cursor: "pointer" };
