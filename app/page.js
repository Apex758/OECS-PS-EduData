"use client";

import { useState, useEffect, useCallback, useRef, Fragment, createContext, useContext } from "react";
import { useSession } from "next-auth/react";
import {
  ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis,
  PieChart, Pie, Cell, BarChart, Bar as RBar, XAxis, YAxis,
  AreaChart, Area, Tooltip, CartesianGrid,
} from "recharts";
import CopyableId from "./components/CopyableId";
import ValidationRules from "./components/ValidationRules";
import CalculationDocs from "./components/CalculationDocs";
import { processFileOffline, isEnrolmentWorkbookFile } from "@/lib/client/processUpload";
import { pushToApprovalLayer } from "@/lib/client/pushPayload";
import { ensureDemoPersona, isInstitutionSession, sessionMatches } from "@/lib/client/ensureDemoPersona";
import { getMappingByRuli, vaultSize, clearVault } from "@/lib/client/piiVault";
import {
  Clock, Lock, Globe, Check, X as XIcon,
  Circle, CircleDot, CircleCheck, CircleX, Loader2,
} from "lucide-react";

// All values are CSS vars defined in layout.js THEME_CSS, so flipping
// <html data-theme> re-themes everything with no component changes.
const COLORS = {
  border: "var(--border)",
  muted: "var(--muted)",
  accent: "var(--accent)",
  accentSoft: "var(--accent-soft)",
  card: "var(--card)",
  cardAlt: "var(--card-alt)",
  errBg: "var(--err-bg)",
  errText: "var(--err-text)",
  codeBg: "var(--code-bg)",
  errBorder: "var(--err-border)",
  good: "var(--good)",
  bad: "var(--bad)",
  text: "var(--text)",
  fieldBg: "var(--field-bg)",
  dropBg: "var(--drop-bg)",
  dropBgActive: "var(--drop-bg-active)",
  disabled: "var(--disabled)",
};

const WARN_BLUE = "#5b9bd5";

const DARK_PALETTES = [
  {
    name:"Night",
    // bg/card: deep + lighter charcoal layers; card-alt: azure-mist tint; accent: electric blue; text: cool off-white
    vars:{
      "--bg":"#0f1012",        // deep charcoal — darkest layer
      "--card":"#181c21",      // lighter charcoal — cards float above
      "--card-alt":"#141f2e",  // azure mist tint — alt sections feel distinct
      "--code-bg":"#1c2430",   // deeper azure mist for data/code blocks
      "--text":"#c8d5e8",      // cool off-white — readable
      "--muted":"#7a8390",     // cool charcoal grey
      "--border":"#252a32",    // charcoal border
      "--accent":"#1675f9",    // electric blue — punchy highlight
      "--accent-soft":"#00112a",
      "--field-bg":"#161a20",
      "--drop-bg":"#0c0e12",
      "--drop-bg-active":"#1a2a40",
      "--disabled":"#2c3440",
      "--err-bg":"#1a0e0e","--err-text":"#f87171","--err-border":"#3a1818",
      "--good":"#4ade80","--bad":"#f87171",
      "--shadow":"1px 2px 4px rgba(0,0,0,0.5),2px 8px 24px rgba(0,0,0,0.35),4px 16px 48px rgba(0,0,0,0.22)",
    },
    series:["#1675f9","#5b9bd5","#c8d5e8","#c084fc","#4ade80","#1574fa"],
  },
];

const LIGHT_PALETTES = [
  {
    name:"Frost",
    vars:{"--bg":"#e8edf5","--text":"#10161e","--border":"#bccadd","--muted":"#58667a","--accent":"#2d405a","--accent-soft":"#dae2ee","--card":"#ffffff","--card-alt":"#e0e9f5","--err-bg":"#fef2f2","--err-text":"#b91c1c","--err-border":"#fecaca","--code-bg":"#d4deed","--good":"#2d5a3d","--bad":"#c0384c","--field-bg":"#f8fbfe","--drop-bg":"#f8fbfe","--drop-bg-active":"#d4dfee","--disabled":"#b0bac8","--shadow":"1px 2px 4px rgba(20,60,120,0.08),2px 8px 16px rgba(20,60,120,0.05),4px 16px 32px rgba(20,60,120,0.03)"},
    series:["#2d405a","#3c5d8b","#4a9eff","#c084fc","#e05c7a","#0b6cf5"],
  },
];

const VIEW_STORAGE_KEY = "oecsDashboardView";

const VIEW_MODES = [
  { value: "institution", label: "Institution" },
  { value: "ministry", label: "Ministry" },
  { value: "admin", label: "OECS" },
  { value: "validation", label: "Validation layer" },
];

function readStoredView() {
  if (typeof sessionStorage === "undefined") return "institution";
  const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
  if (stored === "institution" || stored === "ministry" || stored === "admin") return stored;
  return "institution";
}

function persistView(next) {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(VIEW_STORAGE_KEY, next);
}

const PaletteCtx = createContext(DARK_PALETTES[0].series);

// Clear cached admin token on Ctrl/Cmd+R (manual reload) but NOT on server-
// restart-triggered reloads, which have no corresponding keydown event.
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
export default function Home() {
  useAdminTokenKeyguard();
  const [tab, setTab] = useState("upload");
  const [view, setView] = useState("institution");
  const [demoCountry, setDemoCountry] = useState("LC");
  const countries = useCountriesConfig();
  useDemoPersona(view, demoCountry, countries);

  useEffect(() => {
    const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "validation") {
      window.location.href = "/validation";
      return;
    }
    setView(readStoredView());
  }, []);

  const switchView = useCallback((next) => {
    if (next === "validation") {
      persistView("validation");
      window.location.href = "/validation";
      return;
    }
    if (next === view) return;
    persistView(next);
    clearVault();
    setView(next);
    window.dispatchEvent(new Event("oecs:ui-refresh"));
  }, [view]);
  const [theme, setTheme] = useState("light");
  const [darkPalette, setDarkPalette] = useState("Night");
  const [lightPalette, setLightPalette] = useState("Frost");

  const paletteName = theme === "dark" ? darkPalette : lightPalette;
  const setPaletteName = theme === "dark" ? setDarkPalette : setLightPalette;
  const activePalettes = theme === "dark" ? DARK_PALETTES : LIGHT_PALETTES;
  const palette = activePalettes.find(p => p.name === paletteName) ?? activePalettes[0];

  useEffect(() => {
    if (view !== "admin" && (tab === "access" || tab === "validation" || tab === "calculations")) setTab("dashboard");
    if (view !== "ministry" && tab === "approvals") setTab("dashboard");
    if (view !== "institution" && tab === "upload") setTab("dashboard");
  }, [view, tab]);

  useEffect(() => {
    const t = localStorage.getItem("theme") || "light";
    const pd = localStorage.getItem("palette_dark") || "Night";
    const pl = localStorage.getItem("palette_light") || "Frost";
    setTheme(t);
    setDarkPalette(pd);
    setLightPalette(pl);
  }, []);

  useEffect(() => {
    Object.entries(palette.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    localStorage.setItem(theme === "dark" ? "palette_dark" : "palette_light", paletteName);
  }, [theme, paletteName, palette]);

  return (
    <PaletteCtx.Provider value={palette.series}>
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 40px", backgroundColor: "var(--bg)" }}>
        <header style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <img src="/oecs.png" alt="OECS" style={{ height: 36, width: "auto" }} />
              OECS Post-Secondary EduData
            </h1>
            <p style={{ color: COLORS.muted, margin: "8px 0 0", fontSize: 15 }}>
              Drop staff & enrolment files together — each is auto-sorted to the right flow
            </p>
          </div>
          {/* View-as switcher (demo) — top-right, always available */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, marginTop: 6 }}>
          <ViewModeSelect value={view} onChange={switchView} />
          <span style={{ fontSize: 12, color: COLORS.muted }}>Demo: {demoPersonaLabel(view, demoCountry, countries)}</span>
          </div>
        </header>

        <nav style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
          {view === "institution" && (
            <TabButton active={tab === "upload"} onClick={() => setTab("upload")}>
              Upload
            </TabButton>
          )}
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
            Dashboard
          </TabButton>
          <TabButton active={tab === "enrolment"} onClick={() => setTab("enrolment")}>
            Enrolment
          </TabButton>
          {view === "ministry" && (
            <TabButton active={tab === "approvals"} onClick={() => setTab("approvals")}>
              Approvals
            </TabButton>
          )}
          {view === "admin" && (
            <TabButton active={tab === "access"} onClick={() => setTab("access")}>
              Access (RLS)
            </TabButton>
          )}
          {view === "admin" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <TabButton active={tab === "validation"} onClick={() => setTab("validation")}>
                Validation
              </TabButton>
              <TabButton active={tab === "calculations"} onClick={() => setTab("calculations")}>
                Calculations
              </TabButton>
            </div>
          )}
        </nav>

        {view === "institution" && (
          <div style={{ display: tab === "upload" ? "block" : "none" }} key={view}>
            <UploadPanel view={view} />
          </div>
        )}
        {tab === "dashboard" && (
          <Dashboard view={view} demoCountry={demoCountry} setDemoCountry={setDemoCountry} countries={countries} />
        )}
        {tab === "enrolment" && (
          <EnrolmentDashboard view={view} demoCountry={demoCountry} setDemoCountry={setDemoCountry} countries={countries} />
        )}
        {tab === "approvals" && view === "ministry" && (
          <ApprovalsPanel demoCountry={demoCountry} setDemoCountry={setDemoCountry} countries={countries} />
        )}
        {tab === "access" && <AccessDemo />}
        {tab === "validation" && <ValidationRules />}
        {tab === "calculations" && <CalculationDocs />}
      </main>
      <ThemeAndPaletteControls
        theme={theme}
        onFlipTheme={() => setTheme(t => t === "dark" ? "light" : "dark")}
        paletteName={paletteName}
        onPaletteChange={setPaletteName}
      />
    </PaletteCtx.Provider>
  );
}

function ThemeAndPaletteControls({ theme, onFlipTheme, paletteName, onPaletteChange }) {
  const dark = theme === "dark";
  const palettes = dark ? DARK_PALETTES : LIGHT_PALETTES;
  return (
    <div style={{
      position: "fixed", right: 20, bottom: 20, zIndex: 50,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8,
    }}>
      {palettes.length > 1 && (
      <select
        value={paletteName}
        onChange={e => onPaletteChange(e.target.value)}
        style={{
          background: "var(--card)", border: "1px solid var(--border)",
          color: "var(--text)", borderRadius: 10, padding: "7px 12px",
          fontSize: 13, fontWeight: 500, cursor: "pointer", outline: "none",
          boxShadow: "var(--shadow)", appearance: "none",
          paddingRight: 28, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
        }}
      >
        {palettes.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
      </select>
      )}
      <button
        onClick={onFlipTheme}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          width: 44, height: 44, borderRadius: "50%",
          border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "var(--shadow)",
        }}
      >
        {dark ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: "10px 16px",
        fontSize: 16,
        fontWeight: 600,
        cursor: "pointer",
        color: active ? COLORS.accent : COLORS.muted,
        borderBottom: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 24,
        boxShadow: "var(--shadow)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Which record type a signed-in role uploads. Everyone uploads teaching
// staff (instrument T10); the entity is derived from role, not chosen.
const ROLE_ENTITY = {
  teacher:  "staff",
  minister: "staff",
  admin:    "staff",
};

// Which "room" a role's submissions belong to — gates the notification bell so
// each role sees only its own approvals/rejections. Defaults to institution.
const ROLE_SCOPE = {
  teacher:  "institution",
  minister: "ministry",
  admin:    "admin",
};

// Reverse of ROLE_SCOPE: which role the dashboard view demos.
const VIEW_ROLE = {
  institution: "teacher",
  ministry:    "minister",
  admin:       "admin",
};

// Demo personas — auto-signed-in when switching Institution / Ministry / Admin.
const DEMO_INSTITUTION_EMAIL = "lecturer.lc@demo.local";
const DEMO_ADMIN_EMAIL = "admin@demo.local";

function demoEmailForView(view, countryIso = "LC", countries = []) {
  if (view === "admin") return DEMO_ADMIN_EMAIL;
  if (view === "ministry") {
    const c = countries.find((x) => x.iso === countryIso) || countries[0];
    return c?.ministerEmail || `minister.${String(countryIso).toLowerCase()}@demo.local`;
  }
  return DEMO_INSTITUTION_EMAIL;
}

function demoPersonaLabel(view, countryIso = "LC", countries = []) {
  if (view === "admin") return "OECS";
  if (view === "ministry") {
    const c = countries.find((x) => x.iso === countryIso) || countries[0];
    if (!c) return "Minister";
    return `${c.name} Minister · ${c.approvalRequired ? "L2 approval on" : "L2 auto-approve"}`;
  }
  return "Sir Arthur Lewis (LC-CC)";
}

function demoAllowedRoles(view) {
  if (view === "institution") return ["teacher", "admin"];
  if (view === "ministry") return ["minister"];
  return ["admin"];
}

function useDemoPersona(view, demoCountry, countries) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if (view === "ministry" && !countries.length) return;
    const email = demoEmailForView(view, demoCountry, countries);
    const allowedRoles = demoAllowedRoles(view);
    if (sessionMatches(session, email, allowedRoles)) return;
    ensureDemoPersona(email, { allowedRoles }).catch(() => {});
  }, [view, demoCountry, countries, status, session?.user?.email, session?.user?.role, session?.user?.id]);
}

function useCountriesConfig() {
  const [countries, setCountries] = useState([]);
  useEffect(() => {
    fetch("/api/countries-config")
      .then((r) => r.json())
      .then((d) => setCountries(d.countries || []))
      .catch(() => setCountries([]));
  }, []);
  return countries;
}

function useUiRefresh(onRefresh) {
  useEffect(() => {
    const handler = () => onRefresh();
    window.addEventListener("oecs:ui-refresh", handler);
    return () => window.removeEventListener("oecs:ui-refresh", handler);
  }, [onRefresh]);
}

function buildDbScopeQuery(view, { demoCountry, adminCountry, adminSchool }) {
  const p = new URLSearchParams();
  if (view === "ministry" && demoCountry) p.set("country", demoCountry);
  if (view === "admin") {
    if (adminCountry && adminCountry !== "__all__") p.set("country", adminCountry);
    if (adminSchool && adminSchool !== "__all__") p.set("school", adminSchool);
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

// Entities a user can upload. staff feeds the SDG dashboard; student +
// institution validate/store against the OECS RMR rules (lib/validationRules.js).
const UPLOAD_ENTITIES = ["staff", "enrolment", "student", "institution"];

function canPushToApprovalLayer(entry) {
  if (!entry?.result || entry.pushed) return false;
  const r = entry.result;
  if (r.entity === "staff" && r.clientProcessed && r._accepted?.length > 0) return true;
  if (r.entity === "enrolment" && r.readyToPush && r._accepted?.length > 0) return true;
  return false;
}

function UploadPanel({ view = "institution" }) {
  const { data: session, status: sessionStatus } = useSession();
  // Role demoed is driven by the dashboard view toggle.
  const role = VIEW_ROLE[view] || "teacher";
  const scope = ROLE_SCOPE[role] || "institution";
  const institutionReady = sessionStatus !== "loading" && isInstitutionSession(session);
  // Record type is auto-detected from the file's columns server-side (no
  // dropdown). "auto" tells /api/process to identify staff/student/institution.
  const [entity] = useState("auto");

  // Each entry: { id, file, status: 'pending'|'processing'|'done'|'error', result, error }
  const [queue, setQueue] = useState([]);
  const [preview, setPreview] = useState(null); // entry being previewed in modal
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pushingId, setPushingId] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteFlash, setPasteFlash] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const inputRef = useRef(null);
  const nextId = useRef(0);

  function isAccepted(f) {
    return /\.(csv|xlsx|xls)$/i.test(f.name) || f.type === "text/csv" || f.type.includes("spreadsheet");
  }

  function enqueue(fileList) {
    const valid = [...fileList].filter(isAccepted);
    if (!valid.length) return;
    setQueue((q) => [
      ...q,
      ...valid.map((f) => ({ id: nextId.current++, file: f, status: "pending", result: null, error: null })),
    ]);
  }

  // Queue a Google Sheets link as a "virtual file" so it flows through the
  // same processAll/queue UI. Starts in 'verifying' (spinner): we hit
  // /api/sheet-meta to confirm it's readable and fetch the real title, then
  // flip to 'pending' (check + title) ready for Process. processAll branches
  // on kind. file.size = 0.
  async function enqueueSheet(url) {
    const u = String(url || "").trim();
    if (!u) return;
    const id = nextId.current++;
    setQueue((q) => [
      ...q,
      { id, kind: "sheet", url: u, file: { name: "Google Sheet", size: 0 }, status: "verifying", verified: false, result: null, error: null },
    ]);
    setSheetUrl("");
    setPasteOpen(false);
    try {
      const res = await fetch("/api/sheet-meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setQueue((q) => q.map((e) => e.id === id
          ? { ...e, status: "pending", verified: true, file: { name: j.title || "Google Sheet", size: 0 } }
          : e));
      } else {
        setQueue((q) => q.map((e) => e.id === id ? { ...e, status: "error", error: j.error || "could not verify sheet" } : e));
      }
    } catch (err) {
      setQueue((q) => q.map((e) => e.id === id ? { ...e, status: "error", error: String(err) } : e));
    }
  }

  // Paste button: read the clipboard and auto-add the link (no input bar). If
  // clipboard access is blocked/empty, fall back to the manual input.
  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText())?.trim();
      if (text && /docs\.google\.com\/spreadsheets|^[a-zA-Z0-9-_]{20,}$/.test(text)) {
        setPasteFlash(true);
        setTimeout(() => setPasteFlash(false), 2000);
        enqueueSheet(text);
        return;
      }
    } catch { /* clipboard blocked -> manual input */ }
    setPasteOpen(true);
  }

  function removeEntry(id) {
    setQueue((q) => q.filter((e) => e.id !== id));
  }

  function clearDone() {
    setQueue((q) => q.filter((e) => e.status === "pending" || e.status === "processing"));
    clearVault();
    window.dispatchEvent(new Event("oecs:ui-refresh"));
  }

  async function processAll() {
    setProcessing(true);
    const pending = queue.filter((e) => e.status === "pending");
    for (const entry of pending) {
      setQueue((q) => q.map((e) => e.id === entry.id ? { ...e, status: "processing" } : e));
      try {
        if (entry.kind === "sheet") {
          setQueue((q) => q.map((e) => e.id === entry.id ? {
            ...e, status: "error",
            error: "Export the sheet to CSV/XLSX and upload the file — PII must not be read on the server.",
          } : e));
          continue;
        }

        let json;
        if (await isEnrolmentWorkbookFile(entry.file)) {
          const fd = new FormData();
          fd.append("file", entry.file);
          fd.append("entity", "enrolment");
          const res = await fetch("/api/process", { method: "POST", body: fd });
          json = await res.json();
          if (!res.ok) {
            setQueue((q) => q.map((e) => e.id === entry.id ? {
              ...e, status: "error",
              error: json.error + (json.errors ? ": " + json.errors.join(", ") : ""),
            } : e));
            continue;
          }
        } else {
          json = await processFileOffline(entry.file, { entity });
          if (json.error) {
            setQueue((q) => q.map((e) => e.id === entry.id ? {
              ...e, status: "error",
              error: json.error + (json.errors ? ": " + json.errors.join(", ") : ""),
            } : e));
            continue;
          }
        }

        setQueue((q) => q.map((e) => e.id === entry.id ? {
          ...e, status: "done", result: json, pushed: false,
        } : e));
      } catch (err) {
        setQueue((q) => q.map((e) => e.id === entry.id ? { ...e, status: "error", error: String(err) } : e));
      }
    }
    setProcessing(false);
  }

  async function pushEntry(entry) {
    if (!canPushToApprovalLayer(entry)) return;
    setPushingId(entry.id);
    setQueue((q) => q.map((e) => e.id === entry.id ? { ...e, pushError: null } : e));
    try {
      await ensureDemoPersona(DEMO_INSTITUTION_EMAIL, { allowedRoles: ["teacher", "admin"] });
      const out = await pushToApprovalLayer(entry);
      setQueue((q) => q.map((e) => e.id === entry.id ? {
        ...e,
        pushed: true,
        pushResult: out,
      } : e));
      window.dispatchEvent(new Event("oecs:ui-refresh"));
    } catch (err) {
      setQueue((q) => q.map((e) => e.id === entry.id ? {
        ...e,
        pushError: String(err.message || err),
      } : e));
    } finally {
      setPushingId(null);
    }
  }

  const pendingCount = queue.filter((e) => e.status === "pending").length;
  const doneCount = queue.filter((e) => e.status === "done").length;
  const errorCount = queue.filter((e) => e.status === "error").length;

  const STATUS_ICON = { pending: Circle, verifying: Loader2, processing: CircleDot, done: CircleCheck, error: CircleX };
  const STATUS_COLOR = { pending: COLORS.muted, verifying: COLORS.accent, processing: COLORS.accent, done: COLORS.good, error: COLORS.bad };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <Card>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: queue.length > 0 ? "minmax(0, 1.5fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "stretch" }}>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); enqueue(e.dataTransfer.files); }}
              style={{
                position: "relative",
                border: `2px dashed ${dragOver ? COLORS.accent : COLORS.border}`,
                background: dragOver ? COLORS.dropBgActive : COLORS.dropBg,
                borderRadius: 10,
                padding: "20px",
                height: "calc(100vh - 430px)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                cursor: "pointer",
                transition: "border-color .15s, background .15s",
              }}
            >
              {/* Google Sheets paste — top-right, accent-tinted so it stands out
                  from the drop zone. Clicks here must not trigger the file browser. */}
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ position: "absolute", top: 12, right: 12, cursor: "default" }}
              >
                {!pasteOpen ? (
                  <button
                    type="button"
                    onClick={pasteFromClipboard}
                    title="Paste a Google Sheets link from your clipboard"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: pasteFlash ? COLORS.good : COLORS.accent, color: "#fff", border: "none",
                      borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600,
                      cursor: "pointer", transition: "background .15s",
                    }}
                  >
                    {pasteFlash ? (
                      <>
                        <Check size={15} strokeWidth={2.5} />
                        Link pasted
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Paste Sheets link
                      </>
                    )}
                  </button>
                ) : (
                  <div style={{
                    display: "flex", flexDirection: "column", gap: 6,
                    background: COLORS.card, border: `1px solid ${COLORS.border}`,
                    borderRadius: 8, padding: 8, boxShadow: "var(--shadow)", textAlign: "left",
                  }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        autoFocus
                        value={sheetUrl}
                        onChange={(e) => setSheetUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") enqueueSheet(sheetUrl);
                          if (e.key === "Escape") { setPasteOpen(false); setSheetUrl(""); }
                        }}
                        placeholder="https://docs.google.com/spreadsheets/d/…"
                        style={{
                          width: 280, border: "none", outline: "none", background: "transparent",
                          color: "var(--text)", fontSize: 13, padding: "4px 6px",
                        }}
                      />
                      <button type="button" onClick={() => enqueueSheet(sheetUrl)}
                        style={{ background: COLORS.accent, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Add
                      </button>
                      <button type="button" onClick={() => { setPasteOpen(false); setSheetUrl(""); }}
                        style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 16, padding: "0 4px" }} aria-label="Cancel">×</button>
                    </div>
                    <span style={{ fontSize: 11, color: COLORS.muted }}>
                      Sheet must be shared: Share → “Anyone with the link” → Viewer.
                    </span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>Drop CSV / XLSX files here or click to browse</div>
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 4 }}>
                Validate runs offline in your browser — PII stays in session storage until you push records.
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                multiple
                onChange={(e) => enqueue(e.target.files)}
                style={{ display: "none" }}
              />
            </div>

            {queue.length > 0 && (
            <div style={{ display: "grid", gap: 6, alignContent: "start", height: "100%", minHeight: 0, overflowY: "auto" }}>
              {queue.map((entry) => (
                <div key={entry.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8,
                  background: COLORS.cardAlt, border: `1px solid ${COLORS.border}`,
                }}>
                  <span style={{ color: STATUS_COLOR[entry.status], width: 16, display: "inline-flex", justifyContent: "center" }}>
                    {(() => {
                      // Verified-but-not-yet-processed sheet -> green check.
                      const verifiedReady = entry.status === "pending" && entry.verified;
                      const I = verifiedReady ? CircleCheck : STATUS_ICON[entry.status];
                      const spinning = entry.status === "verifying";
                      return <I size={15} strokeWidth={2.5} className={spinning ? "spin" : undefined}
                        color={verifiedReady ? COLORS.good : undefined} />;
                    })()}
                  </span>
                  {entry.kind !== "sheet" && entry.file?.size > 0 ? (
                    <button
                      onClick={() => setPreview(entry)}
                      title="Click to preview file contents"
                      style={{
                        flex: 1, textAlign: "left", background: "none", border: "none",
                        padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 500,
                        color: COLORS.accent, textDecoration: "underline", textDecorationStyle: "dotted",
                        textUnderlineOffset: 3,
                      }}
                    >{entry.file.name}</button>
                  ) : (
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{entry.file.name}</span>
                  )}
                  <span style={{ fontSize: 12, color: COLORS.muted }}>
                    {entry.kind === "sheet" ? "Sheet" : `${(entry.file.size / 1024).toFixed(1)} KB`}
                  </span>
                  {entry.status === "done" && entry.result && (
                    <span style={{ fontSize: 12, color: COLORS.good }}>
                      {entry.result.accepted} accepted{entry.result.rejected?.length > 0 ? ` · ${entry.result.rejected.length} rejected` : ""}
                      {entry.pushed ? " · submitted" : canPushToApprovalLayer(entry) ? " · ready to submit" : entry.result.clientProcessed ? " · stripped locally" : entry.result.readyToPush ? " · validated" : ""}
                    </span>
                  )}
                  {entry.status === "error" && (
                    <span style={{ fontSize: 12, color: COLORS.bad, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.error}>
                      {entry.error}
                    </span>
                  )}
                  {/* Any non-processing entry can be removed individually — incl. done,
                      so one file can be dropped without clearing and re-uploading the rest.
                      Its result view is derived from done entries, so it disappears too. */}
                  {entry.status !== "processing" && (
                    <button
                      onClick={() => removeEntry(entry.id)}
                      style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 16, padding: "0 2px" }}
                      aria-label="Remove"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, color: COLORS.muted }}>
              Record type is detected automatically. Validate stays offline; use <strong>Submit for Approval</strong> when ready for ministry review.
              {vaultSize() > 0 ? ` ${vaultSize()} identity mapping(s) in this tab's session storage.` : ""}
            </span>
            <button
              onClick={processAll}
              disabled={processing || pendingCount === 0}
              style={{
                width: "100%",
                background: processing || pendingCount === 0 ? "rgba(143, 213, 114, 1)" : COLORS.accent,
                color: processing || pendingCount === 0 ? "rgba(0, 0, 0, 1)" : "#fff", border: "none", borderRadius: 8,
                padding: "16px 20px", fontSize: 16, fontWeight: 600,
                cursor: processing || pendingCount === 0 ? "default" : "pointer",
              }}
            >
              {processing ? "Validating…" : pendingCount > 0 ? `Validate · ${pendingCount} source${pendingCount > 1 ? "s" : ""}` : "Validate"}
            </button>
            {(doneCount > 0 || errorCount > 0) && (
              <button onClick={clearDone} style={ghostButton}>Clear finished</button>
            )}
            {queue.length > 0 && !processing && (
              <span style={{ fontSize: 13, color: COLORS.muted, marginLeft: 4 }}>
                {doneCount > 0 && `${doneCount} done`}
                {doneCount > 0 && errorCount > 0 && " · "}
                {errorCount > 0 && `${errorCount} failed`}
              </span>
            )}
          </div>
        </div>
      </Card>

      {queue.filter((e) => e.status === "done" && e.result).map((entry) => (
        <div key={entry.id}>
          <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.muted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {entry.file.name}
          </p>
          {view === "institution" && canPushToApprovalLayer(entry) && (
            <Card style={{ marginBottom: 12, borderColor: COLORS.accent }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Submit for Approval</div>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: COLORS.muted }}>
                    Send validated {entry.result.entity} data for campus L1 and country L2 review. Nothing is sent to the server until you click the button below.
                  </p>
                  {entry.pushError && (
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.bad }}>{entry.pushError}</p>
                  )}
                  {!institutionReady && sessionStatus !== "loading" && !entry.pushed && (
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.muted }}>
                      Signing in as Sir Arthur Lewis (LC-CC)…
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => pushEntry(entry)}
                  disabled={entry.pushed || pushingId === entry.id || !navigator.onLine || !institutionReady}
                  title={
                    !institutionReady ? "Waiting for institution sign-in…"
                    : !navigator.onLine ? "Connect to the internet to submit"
                    : undefined
                  }
                  style={{
                    background: entry.pushed || pushingId === entry.id || !navigator.onLine || !institutionReady ? COLORS.disabled : COLORS.accent,
                    color: "#fff", border: "none", borderRadius: 8,
                    padding: "12px 20px", fontSize: 14, fontWeight: 600,
                    cursor: entry.pushed || pushingId === entry.id || !navigator.onLine || !institutionReady ? "default" : "pointer",
                  }}
                >
                  {pushingId === entry.id ? "Submitting…" : entry.pushed ? "Submitted for Approval" : "Submit for Approval"}
                </button>
              </div>
            </Card>
          )}
          {entry.pushResult && (
            <Card style={{
              marginBottom: 16,
              border: `2px solid ${entry.pushResult.status === "pending_l2" ? COLORS.accent : COLORS.good}`,
              background: entry.pushResult.status === "pending_l2" ? COLORS.accentSoft : "color-mix(in srgb, var(--good) 18%, var(--card))",
            }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <CircleCheck size={32} strokeWidth={2.5} color={entry.pushResult.status === "pending_l2" ? COLORS.accent : COLORS.good} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                    {entry.pushResult.status === "pending_l2"
                      ? "Submitted for Approval — awaiting minister sign-off (L2)"
                      : "Submitted for Approval — visible to OECS"}
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 15, color: COLORS.text, lineHeight: 1.5 }}>
                    Submitted <strong>{entry.pushResult.recordsInserted}</strong> record(s)
                    {entry.pushResult.recordsSkipped ? ` · ${entry.pushResult.recordsSkipped} skipped (duplicate)` : ""}
                    {entry.pushResult.aggregations ? ` · ${entry.pushResult.aggregations} SDG aggregate(s) computed` : ""}
                    {entry.pushResult.duplicatesFound ? ` · ${entry.pushResult.duplicatesFound} cross-institution duplicate flag(s)` : ""}
                  </p>
                  {entry.pushResult.submissionId != null && (
                    <p style={{ margin: 0, fontSize: 14, color: COLORS.muted }}>
                      Submission ID: <CopyableId value={String(entry.pushResult.submissionId)} />
                    </p>
                  )}
                  {entry.pushResult.status === "pending_l2" && (
                    <p style={{ margin: "10px 0 0", fontSize: 14, color: COLORS.text }}>
                      Switch to <strong>Ministry</strong> view → <strong>Approvals</strong> tab to review and approve this submission.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}
          <ResultView result={entry.result} scope={scope} />
        </div>
      ))}

      {preview && <FilePreviewModal entry={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// Reads the queued File in-browser with SheetJS and renders each worksheet
// behind a tab strip — lets the uploader eyeball the raw workbook before
// processing. CSVs come through as a single sheet.
function FilePreviewModal({ entry, onClose }) {
  const [sheets, setSheets] = useState(null); // [{ name, rows: string[][] }]
  const [active, setActive] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = await entry.file.arrayBuffer();
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array" });
        const parsed = wb.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false })
            .map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? "" : String(c))) : [])),
        }));
        if (!cancelled) setSheets(parsed);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [entry]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Lock background page scroll while the modal is open so wheel/touch
    // scrolling targets the modal, not the page behind it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const sheet = sheets?.[active];
  const maxCols = sheet ? sheet.rows.reduce((m, r) => Math.max(m, r.length), 0) : 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 12, boxShadow: "var(--shadow)",
          width: "min(1100px, 95vw)", maxHeight: "90vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${COLORS.border}` }}>
          <span style={{ fontSize: 15, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.file.name}
          </span>
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            {(entry.file.size / 1024).toFixed(1)} KB
          </span>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>

        {/* tab strip */}
        {sheets && sheets.length > 0 && (
          <div style={{ display: "flex", gap: 2, padding: "8px 12px 0", overflowX: "auto", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
            {sheets.map((s, i) => (
              <button
                key={s.name + i}
                onClick={() => setActive(i)}
                style={{
                  background: i === active ? COLORS.card : COLORS.cardAlt,
                  border: `1px solid ${COLORS.border}`,
                  borderBottom: i === active ? `1px solid ${COLORS.card}` : `1px solid ${COLORS.border}`,
                  borderRadius: "8px 8px 0 0", padding: "7px 14px", marginBottom: -1,
                  fontSize: 13, fontWeight: i === active ? 600 : 500,
                  color: i === active ? COLORS.accent : COLORS.muted,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{s.name}</button>
            ))}
          </div>
        )}

        {/* body */}
        <div style={{ overflow: "auto", overscrollBehavior: "contain", padding: 0, minHeight: 120, flex: 1 }}>
          {error && <div style={{ padding: 20, color: COLORS.errText, fontSize: 14 }}>Could not read file: {error}</div>}
          {!error && !sheets && <div style={{ padding: 20, color: COLORS.muted, fontSize: 14 }}>Reading file…</div>}
          {!error && sheet && (
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "max-content", minWidth: "100%" }}>
              <tbody>
                {sheet.rows.length === 0 && (
                  <tr><td style={{ padding: 16, color: COLORS.muted }}>Empty sheet.</td></tr>
                )}
                {sheet.rows.map((row, ri) => (
                  <tr key={ri} style={ri === 0 ? { background: COLORS.cardAlt } : undefined}>
                    <td style={{ ...previewCell, color: COLORS.muted, textAlign: "right", position: "sticky", left: 0, background: COLORS.cardAlt, userSelect: "none" }}>{ri + 1}</td>
                    {Array.from({ length: maxCols }).map((_, ci) => (
                      <td key={ci} style={{ ...previewCell, fontWeight: ri === 0 ? 600 : 400 }}>{row[ci] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const previewCell = {
  border: "1px solid var(--border)",
  padding: "4px 8px",
  whiteSpace: "nowrap",
  maxWidth: 320,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function ResultView({ result, scope }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <NormalizationCard result={result} scope={scope} />

      {result.rejected.length > 0 && (
        <Card style={{ minWidth: 0 }}>
          <h3 style={{ ...cardTitle, color: COLORS.errText }}>
            Rejected rows ({result.rejected.length})
          </h3>
          <p style={{ color: COLORS.muted, margin: "0 0 12px", fontSize: 14 }}>
            Red cells need fixing — each row says what and how.
          </p>
          <RejectedTable columns={rejectedColumns(result.rejected)} rejected={result.rejected} />
        </Card>
      )}

      {(result.suggestedAliases || []).length > 0 && (
        <Card style={{ minWidth: 0 }}>
          <SuggestionsSection result={result} scope={scope} standalone />
        </Card>
      )}
    </div>
  );
}

// Unrecognized enum values that the uploader can map themselves and submit
// for admin review. No admin token needed here — the admin approves later in
// /admin, which promotes the mapping to a permanent global rule.
function SuggestionsSection({ result, scope, standalone = false }) {
  const initial = result.suggestedAliases || [];
  const alreadyPending = new Set(result.alreadyPending || []);

  const [items, setItems] = useState(() =>
    initial.map((s) => ({
      ...s,
      // Pre-mark anything the server says is already pending for this uploader.
      submitted: alreadyPending.has(`${s.field}=${s.value}`) ? "pending" : null,
    }))
  );
  useEffect(() => {
    const ap = new Set(result.alreadyPending || []);
    setItems(
      (result.suggestedAliases || []).map((s) => ({
        ...s,
        submitted: ap.has(`${s.field}=${s.value}`) ? "pending" : null,
      }))
    );
  }, [result]);

  if (!initial.length) return null;

  async function submit(s, canonical, idx) {
    if (!canonical) return;
    setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, busy: true, error: null } : x)));
    try {
      const res = await fetch("/api/alias-suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: s.entity,
          field: s.field,
          variant: s.value,
          canonical,
          institution: s.institution || null,
          scope: scope || "institution",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, submitted: canonical, busy: false } : x)));
    } catch (e) {
      setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, busy: false, error: e.message } : x)));
    }
  }

  return (
    <div style={standalone ? {} : { marginTop: 16, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
      <div style={standalone ? cardTitle : { fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
        Needs your input — map these to fix the red rows ({initial.length})
      </div>
      <p style={{ color: COLORS.muted, margin: "0 0 12px", fontSize: 13 }}>
        Not in the allowed list. Pick the correct option and submit — you can
        re-upload immediately and your mapping applies. Once an admin approves it
        becomes a permanent rule for everyone.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((s, idx) => (
          <div key={`${s.field}=${s.value}`} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>
              <b>{s.field}</b> = <code style={{ background: COLORS.codeBg, padding: "1px 6px", borderRadius: 5 }}>{s.value}</code> →
            </span>
            {s.submitted ? (
              <span style={{
                fontSize: 13, fontWeight: 600, color: "#0e4592",
                background: "#c7defe", border: "1px solid #8abafd",
                borderRadius: 6, padding: "3px 10px",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                <Clock size={14} strokeWidth={2.5} />
                Awaiting admin approval
                {s.submitted !== "pending" && ` (mapped to ${s.submitted})`}
              </span>
            ) : (
              <SubmitControl s={s} idx={idx} onSubmit={submit} />
            )}
            {s.error && <span style={{ color: COLORS.errText, fontSize: 13 }}>{s.error}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SubmitControl({ s, idx, onSubmit }) {
  const [val, setVal] = useState(s.options?.[0] || "");
  return (
    <>
      <select
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{ ...inputStyle, padding: "7px 10px", fontSize: 14, maxWidth: 160 }}
      >
        {(s.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onSubmit(s, val, idx)}
        disabled={s.busy || !val}
        style={{
          ...ghostButton,
          background: COLORS.accent, color: "#fff", border: "none",
          opacity: s.busy ? 0.6 : 1,
          cursor: s.busy ? "default" : "pointer",
        }}
      >
        {s.busy ? "Submitting…" : "Submit for review"}
      </button>
    </>
  );
}

// Shows how the uploader's headers + values were normalized to canonical
// form -- the proof that any school's format lands in the same schema.
function NormalizationCard({ result, scope }) {
  const headers = result.headerAliasesApplied || [];
  const values = result.valueAliasesApplied || [];
  const dates = result.dateNormalizationApplied || [];
  const warnings = result.headerWarnings || [];
  const hasNorm = headers.length || values.length || dates.length || warnings.length;

  const stats = (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", flexShrink: 0 }}>
      <Stat label="Total" value={result.total} />
      <Stat label="Accepted" value={result.accepted} />
      <Stat label="Rejected" value={result.rejected.length} />
    </div>
  );

  // Nothing to normalize -> stats-only card. (The map-to-fix verification UI
  // now renders as its own card under the rejected rows, per school.)
  if (!hasNorm) {
    return (
      <Card>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{stats}</div>
      </Card>
    );
  }

  // remaps repeat per row -> collapse to unique entries.
  const uniq = (arr, keyOf) => {
    const seen = new Set();
    return arr.filter((x) => {
      const k = keyOf(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const valuesUniq = uniq(values, (v) => `${v.field}|${v.from}|${v.to}`);
  const datesUniq = uniq(dates, (d) => `${d.field}|${d.from}|${d.to}`);

  return (
    <Card>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0, order: 1 }}>
      <h3 style={cardTitle}>Normalization applied</h3>
      {headers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Headers → canonical fields</div>
          <div style={{ display: "grid", gap: 4 }}>
            {headers.map((h, i) => (
              <code key={i} style={codeBlockStyle}>{h.from} → {h.to}</code>
            ))}
          </div>
        </div>
      )}
      {valuesUniq.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Values → canonical values</div>
          <div style={{ display: "grid", gap: 4 }}>
            {valuesUniq.map((v, i) => (
              <code key={i} style={codeBlockStyle}>{v.field}: "{v.from}" → "{v.to}"</code>
            ))}
          </div>
        </div>
      )}
      {datesUniq.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Dates → ISO (YYYY-MM-DD)</div>
          <div style={{ display: "grid", gap: 4 }}>
            {datesUniq.map((d, i) => (
              <code key={i} style={codeBlockStyle}>{d.field}: "{d.from}" → "{d.to}"</code>
            ))}
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: COLORS.errText }}>Warnings</div>
          <div style={{ display: "grid", gap: 4 }}>
            {warnings.map((w, i) => (
              <span key={i} style={{ fontSize: 13, color: COLORS.muted }}>• {w}</span>
            ))}
          </div>
        </div>
      )}
        </div>
        <div style={{ order: 2 }}>{stats}</div>
      </div>
    </Card>
  );
}

// Uploader's notification bell (Dashboard only). Polls for this uploader's
// reviewed alias suggestions; a popup shows approved mappings (with a template
// download) and rejected ones (with the admin's reason). Dismissing marks them
// acknowledged so they stop appearing.
// scope = current "View as" room (institution | ministry | admin). The bell
// shows only that room's notifications, so each role sees its own.
function UploaderNotifications({ entity = "staff", scope = "institution" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/alias-suggestions/notifications?scope=${encodeURIComponent(scope)}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok) setItems(j.notifications || []);
    } catch { /* ignore — best effort */ }
  }, [scope]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // poll while the dashboard is open
    return () => clearInterval(t);
  }, [load]);

  // Close popup when the room changes so stale items don't linger.
  useEffect(() => { setOpen(false); }, [scope]);

  // Close on click/tap outside the bell+popup, and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function dismiss(ids) {
    try {
      await fetch("/api/alias-suggestions/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ids ? { scope, ids } : { scope }),
      });
    } catch { /* ignore */ }
    setItems((arr) => (ids ? arr.filter((x) => !ids.includes(x.id)) : []));
  }

  const count = items.length;
  const approved = items.filter((i) => i.status === "approved");

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        style={{
          ...ghostButton, position: "relative", padding: "8px 12px",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6, minWidth: 18, height: 18,
            background: "#ef4444", color: "#fff", borderRadius: 999,
            fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center",
            justifyContent: "center", padding: "0 5px",
          }}>{count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 60,
          width: 360, maxHeight: 420, overflowY: "auto",
          background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 12, boxShadow: "var(--shadow)", padding: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Notifications</span>
            {count > 0 && (
              <button type="button" onClick={() => dismiss(null)} style={{ ...ghostButton, padding: "4px 10px", fontSize: 12 }}>
                Dismiss all
              </button>
            )}
          </div>

          {count === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: 14, margin: "6px 0" }}>No new notifications.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {items.map((n) => {
                const ok = n.status === "approved";
                return (
                  <div key={n.id} style={{
                    border: `1px solid ${ok ? "#bbf7d0" : COLORS.errBorder}`,
                    background: ok ? "#f0fdf4" : COLORS.errBg,
                    borderRadius: 9, padding: "10px 12px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: ok ? "#15803d" : COLORS.errText, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {ok ? <Check size={14} strokeWidth={3} /> : <XIcon size={14} strokeWidth={3} />}
                        {ok ? "Approved" : "Declined"}
                      </span>
                      <button type="button" onClick={() => dismiss([n.id])}
                        style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 15, lineHeight: 1, padding: 0 }}
                        aria-label="Dismiss">×</button>
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      <b>{n.field}</b>: <code style={{ background: COLORS.codeBg, padding: "1px 5px", borderRadius: 4 }}>{n.variant}</code> → <b>{n.canonical}</b>
                    </div>
                    {ok ? (
                      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
                        Now a permanent rule for everyone. Re-upload to apply.
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: COLORS.errText, marginTop: 4 }}>
                        {n.review_note ? n.review_note : "Declined by an administrator."}
                      </div>
                    )}
                  </div>
                );
              })}

              {approved.length > 0 && (
                <a href={`/api/alias-suggestions/template?entity=${entity}`} download
                  style={{ ...ghostButton, textAlign: "center", marginTop: 2 }}>
                  Download validation template
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// SDG indicators rendered as radial gauges (the three % metrics). Parity
// (4.5.1) is shown as a ratio card instead of a gauge.
const SDG_GAUGE_CODES = ["4.c.1", "4.c.7", "4.c.6"];

function Dashboard({ view, demoCountry, setDemoCountry, countries }) {
  const [stats, setStats] = useState(null);
  const [sdg, setSdg] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [selInst, setSelInst] = useState(null);
  const [selTerr, setSelTerr] = useState(null);
  const [dashTab, setDashTab] = useState("stats");
  const [adminCountry, setAdminCountry] = useState("__all__");
  const [adminSchool, setAdminSchool] = useState("__all__");
  const [schools, setSchools] = useState([]);

  useEffect(() => {
    if (view !== "admin") return;
    const country = adminCountry === "__all__" ? "" : adminCountry;
    fetch(`/api/schools-config${country ? `?country=${encodeURIComponent(country)}` : ""}`)
      .then((r) => r.json())
      .then((d) => setSchools(d.schools || []))
      .catch(() => setSchools([]));
    setAdminSchool("__all__");
  }, [view, adminCountry]);

  const scopeQuery = buildDbScopeQuery(view, { demoCountry, adminCountry, adminSchool });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchOpts = { credentials: "include" };
      const [sRes, gRes] = await Promise.all([
        fetch(`/api/stats${scopeQuery}`, fetchOpts),
        fetch(`/api/sdg${scopeQuery}`, fetchOpts),
      ]);
      const sJson = await sRes.json();
      const gJson = await gRes.json().catch(() => null);
      if (!sRes.ok) setError(sJson.error || "Failed to load stats");
      else {
        const vault = view === "institution" ? getMappingByRuli() : {};
        const vaultKeys = Object.keys(vault);
        const entities = (sJson.entities || []).map((e) => {
          const merged = { ...(e.mappingByRuli || {}), ...vault };
          return {
            ...e,
            mappingByRuli: merged,
            mapped: vaultKeys.length > 0
              ? (e.rows || []).filter((r) => merged[r.RULI]).length
              : (e.mapped ?? 0),
          };
        });
        setStats({ ...sJson, entities, sessionMappings: vaultKeys.length });
        setSdg(gRes.ok ? gJson : null);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [scopeQuery, view]);

  const clearAll = useCallback(async () => {
    const pw = window.prompt("Clear ALL database records, submissions, and validation rules?\n\nEnter password to confirm:");
    if (pw === null) return;
    if (pw !== "OECS") {
      setError("Incorrect password — database was not cleared.");
      return;
    }
    setClearing(true);
    setError(null);
    try {
      const res = await fetch("/api/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "OECS" }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Failed to clear database");
      else if (json.dbError) {
        setError(`Files cleared, but validation rules were NOT — database unreachable: ${json.dbError}. Approved/pending aliases still active. Check DATABASE_URL.`);
        await load();
      } else {
        clearVault();
        window.dispatchEvent(new Event("oecs:ui-refresh"));
        await load();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setClearing(false);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useUiRefresh(load);

  if (loading) return <Card><span style={{ color: COLORS.muted }}>Loading…</span></Card>;
  if (error) return <Card style={{ background: COLORS.errBg, borderColor: COLORS.errBorder }}><span style={{ color: COLORS.errText }}>{error}</span></Card>;

  const hasData = stats && stats.entities.length > 0;
  const dbConfigured = stats?.dbConfigured !== false;
  const sessionMappings = stats?.sessionMappings || 0;
  const totalMapped = hasData ? stats.entities.reduce((n, e) => n + (e.mapped || 0), 0) : sessionMappings;

  const byInstitution = sdg?.byInstitution || [];
  const byTerritory = sdg?.byTerritory || [];
  const globalAgg = sdg ? { count: sdg.count, indicators: sdg.indicators, distributions: sdg.distributions } : null;

  // Selected scope (fall back to the first available group).
  const instKey = selInst ?? byInstitution[0]?.key ?? null;
  const terrKey = selTerr ?? byTerritory[0]?.key ?? null;
  const instAgg = byInstitution.find((g) => g.key === instKey) || byInstitution[0] || globalAgg;
  const terrAgg = byTerritory.find((g) => g.key === terrKey) || byTerritory[0] || globalAgg;
  const terrInstitutions = byInstitution.filter((g) => (g.territory || "Unspecified") === terrKey);

  const SUBTITLE = {
    institution: "One institution — staff, qualifications, CPD, attrition.",
    ministry: "One territory — institutions compared on SDG 4.c.",
    admin: "OECS-wide — ministry-approved submissions only.",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>Overview</h2>
          <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 14 }}>{SUBTITLE[view]}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <UploaderNotifications entity="staff" scope={view} />
          <button onClick={load} style={ghostButton}>Refresh</button>
          {view === "admin" && (
            <button
              onClick={clearAll}
              disabled={clearing || !dbConfigured}
              style={{ ...dangerButton, opacity: clearing || !dbConfigured ? 0.5 : 1, cursor: clearing || !dbConfigured ? "default" : "pointer" }}
            >
              {clearing ? "Clearing…" : "Clear database"}
            </button>
          )}
        </div>
      </div>

      {(view === "ministry" || view === "admin") && (
        <Card>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            {view === "ministry" && (
              <Field label="Country (from database)">
                <select
                  value={demoCountry}
                  onChange={(e) => setDemoCountry(e.target.value)}
                  style={{ ...inputStyle, minWidth: 260 }}
                >
                  {countries.map((c) => (
                    <option key={c.iso} value={c.iso}>{c.name} ({c.iso})</option>
                  ))}
                </select>
              </Field>
            )}
            {view === "admin" && (
              <>
                <Field label="Country">
                  <select value={adminCountry} onChange={(e) => setAdminCountry(e.target.value)} style={{ ...inputStyle, minWidth: 220 }}>
                    <option value="__all__">All countries</option>
                    {countries.map((c) => (
                      <option key={c.iso} value={c.iso}>{c.name} ({c.iso})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Institution">
                  <select value={adminSchool} onChange={(e) => setAdminSchool(e.target.value)} style={{ ...inputStyle, minWidth: 280 }}>
                    <option value="__all__">All institutions{adminCountry !== "__all__" ? " in country" : ""}</option>
                    {schools.map((s) => (
                      <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <span style={{ fontSize: 13, color: COLORS.muted, paddingBottom: 8 }}>
              {view === "admin"
                ? "OECS sees data only after minister L2 approval. Pending campus submissions are hidden."
                : "Ministry and OECS views load persisted data from the database only."}
            </span>
          </div>
        </Card>
      )}

      {!hasData ? (
        <Card>
          <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>
            {view === "institution" && sessionMappings > 0
              ? `${sessionMappings} identity mapping(s) in this tab's session storage. Submit for Approval from the Upload tab to populate aggregates (requires Supabase in .env).`
              : view !== "institution"
                ? `No ministry-approved staff records in the database for this scope. Data appears after a minister approves the campus submission (L2).`
                : dbConfigured
                  ? "No staff records yet. Upload a teaching-staff file, validate offline, then submit for approval."
                  : "No server data yet — and no database configured (that's fine). Upload a file and validate offline; add Supabase to .env only when you're ready to submit for approval."}
          </p>
        </Card>
      ) : (
        <>
          {/* Institution / territory selectors */}
          {(byInstitution.length > 1 || byTerritory.length > 1) && (
          <Card>
            {byInstitution.length > 1 && (
              <div style={{ display: "grid", gridTemplateRows: view === "institution" ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ marginTop: 12 }}>
                    <Field label="Institution">
                      <select value={instKey ?? ""} onChange={(e) => setSelInst(e.target.value)} style={inputStyle}>
                        {byInstitution.map((g) => <option key={g.key} value={g.key}>{g.key} ({g.count})</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            )}
            {byTerritory.length > 1 && (
              <div style={{ display: "grid", gridTemplateRows: view === "ministry" ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ marginTop: 12 }}>
                    <Field label="Territory">
                      <select value={terrKey ?? ""} onChange={(e) => setSelTerr(e.target.value)} style={inputStyle}>
                        {byTerritory.map((g) => <option key={g.key} value={g.key}>{g.key} ({g.count} staff · {g.institutions?.length ?? 0} institutions)</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            )}
          </Card>
          )}

          {view === "institution" && instAgg && (
            <>
              <nav style={{ display: "flex", gap: 4, borderBottom: `1px solid ${COLORS.border}`, justifyContent: "flex-end" }}>
                <TabButton active={dashTab === "stats"} onClick={() => setDashTab("stats")}>Stats</TabButton>
                <TabButton active={dashTab === "records"} onClick={() => setDashTab("records")}>Records</TabButton>
              </nav>
              {dashTab === "stats" && (
                <IndicatorView agg={instAgg} anon={{ total: instAgg.count, mapped: instAgg.count, coverage: 100 }} entities={stats.entities} />
              )}
              {dashTab === "records" && (
                <InstitutionRecords stats={stats} institution={instKey} />
              )}
            </>
          )}

          {view === "ministry" && (
            <RollupView title={`${terrKey ?? "Territory"} — territory rollup`} agg={terrAgg} rows={terrInstitutions} rowLabel="Institution" entities={stats.entities} rlsOn={true} />
          )}

          {view === "admin" && (
            <>
              <OecsAggregationsPanel />
              <AdminSuggestionsPanel />
              <AdminCompleteness byTerritory={byTerritory} byInstitution={byInstitution} totalStaff={stats.totalRecords} mapped={totalMapped} />
              <RollupView title="OECS-wide rollup" agg={globalAgg} rows={byTerritory} rowLabel="Territory" entities={stats.entities} rlsOn={false} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---- Dashboard chart pieces (recharts) --------------------------------

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 12,
};

function SdgChip({ code, colour }) {
  return (
    <span style={{
      alignSelf: "start", justifySelf: "start", fontSize: 11, fontWeight: 700, color: "#fff",
      background: colour, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      SDG {code}
    </span>
  );
}

function ChartEmpty({ text = "No data." }) {
  return <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.muted, fontSize: 14 }}>{text}</div>;
}

function ChartLegend({ items }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginTop: 10 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.muted }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Single-value radial gauge with the figure overlaid in the centre.
function RadialGauge({ value, display, color }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div style={{ position: "relative", width: "100%", height: 150 }}>
      <ResponsiveContainer>
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value: v, fill: color }]} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background={{ fill: "var(--card-alt)" }} dataKey="value" cornerRadius={20} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 26, fontWeight: 700 }}>{display}</span>
      </div>
    </div>
  );
}

// KPI card: a percentage SDG indicator as a gauge.
function KpiGauge({ ind }) {
  const val = ind.value ?? 0;
  // Attrition (4.c.6) is "lower is better"; the rest are "higher is better".
  const color = ind.code === "4.c.6"
    ? (val <= 10 ? COLORS.good : val <= 20 ? WARN_BLUE : COLORS.bad)
    : ind.colour;
  return (
    <Card style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <SdgChip code={ind.code} colour={ind.colour} />
      <RadialGauge value={val} display={ind.value == null ? "—" : `${ind.value}%`} color={color} />
      <div style={{ fontSize: 14, fontWeight: 600, textAlign: "center" }}>{ind.title}</div>
      <div style={{ fontSize: 12, color: COLORS.muted, textAlign: "center" }}>{ind.detail}</div>
    </Card>
  );
}

// KPI card: gender parity shown as a ratio (gauge doesn't suit a ratio).
function KpiParity({ ind }) {
  return (
    <Card style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <SdgChip code={ind.code} colour={ind.colour} />
      <div style={{ height: 150, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em" }}>{ind.value == null ? "—" : ind.value}</span>
        <span style={{ fontSize: 12, color: COLORS.muted }}>ratio · 1.0 = balanced</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, textAlign: "center" }}>{ind.title}</div>
      <div style={{ fontSize: 12, color: COLORS.muted, textAlign: "center" }}>{ind.detail}</div>
    </Card>
  );
}


// Qualification mix -> concentric radial bars, one ring per level.
// `fill` makes the chart grow to fill a stretched card (left column of row 1).
function RadialMix({ data, fill, height = 220 }) {
  const series = useContext(PaletteCtx);
  if (!data?.length) return <ChartEmpty />;
  const max = Math.max(1, ...data.map((d) => d.value));
  const rows = data.map((d, i) => ({ name: d.label, value: d.value, fill: series[i % series.length] }));
  return (
    <div style={fill ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined}>
      <div style={fill ? { flex: 1, minHeight: 240 } : { height }}>
        <ResponsiveContainer>
          <RadialBarChart innerRadius="20%" outerRadius="100%" data={rows} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, max]} tick={false} />
            <RadialBar background={{ fill: "var(--card-alt)" }} dataKey="value" cornerRadius={6} />
            <Tooltip contentStyle={tooltipStyle} cursor={false} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={rows.map((r) => ({ label: `${r.name} (${r.value})`, color: r.fill }))} />
    </div>
  );
}

// Gender split -> donut.
const GENDER_COLORS = { Female: "#f472b6", Male: "#60a5fa" };
function GenderDonut({ data, height = 220 }) {
  const series = useContext(PaletteCtx);
  if (!data?.length) return <ChartEmpty text="No sex column supplied." />;
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={GENDER_COLORS[d.label] || series[i % series.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={data.map((d) => ({ label: `${d.label} (${d.value})`, color: GENDER_COLORS[d.label] || COLORS.muted }))} />
    </div>
  );
}

// Classification -> horizontal bars.
function ClassBars({ data }) {
  const series = useContext(PaletteCtx);
  if (!data?.length) return <ChartEmpty />;
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fill: COLORS.muted, fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis type="category" dataKey="label" width={52} tick={{ fill: COLORS.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "var(--card-alt)" }} contentStyle={tooltipStyle} />
          <RBar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
            {data.map((d, i) => <Cell key={i} fill={series[i % series.length]} />)}
          </RBar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// CPD + experience -> two area charts, side by side on the full-width row.
function BandsArea({ cpd, exp, grid, height, stack }) {
  const series = useContext(PaletteCtx);
  return (
    <div style={stack
      ? { display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }
      : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
      <MiniArea title="CPD hours (past year)" data={cpd} color={series[0]} grid={grid} height={height} fill={stack} />
      <MiniArea title="Years of experience" data={exp} color={series[3]} grid={grid} height={height} fill={stack} />
    </div>
  );
}

function TrainingCard({ cpd, exp, height, stack }) {
  const [grid, setGrid] = useState(false);
  return (
    <Card style={{ minWidth: 0, display: stack ? "flex" : undefined, flexDirection: stack ? "column" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Training &amp; experience</div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>CPD hours · years teaching</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: !grid ? COLORS.text : COLORS.muted, transition: "color .15s" }}>Clean</span>
          <Switch on={grid} onChange={setGrid} label="Chart grid" />
          <span style={{ fontSize: 12, fontWeight: 500, color: grid ? COLORS.text : COLORS.muted, transition: "color .15s" }}>Grid</span>
        </div>
      </div>
      <BandsArea cpd={cpd} exp={exp} grid={grid} height={height} stack={stack} />
    </Card>
  );
}

function MiniArea({ title, data, color, grid, height = 140, fill }) {
  if (!data?.length) return null;
  const id = "grad" + title.replace(/\W/g, "");
  const gridFade = { opacity: grid ? 1 : 0, transition: "opacity 0.35s ease" };
  return (
    <div style={fill ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined}>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>{title}</div>
      <div style={fill ? { flex: 1, minHeight: 120 } : { height }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} style={gridFade} />
            <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 11 }}
              axisLine={grid ? { stroke: "var(--border)" } : false} tickLine={false} />
            <YAxis allowDecimals={false} width={32} style={gridFade}
              tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const subHead = {
  fontSize: 12, fontWeight: 600, margin: "0 0 10px", color: COLORS.muted,
  textTransform: "uppercase", letterSpacing: "0.04em",
};

// Raw count bars (no chart lib) for the details dropdown.
function MiniBars({ items }) {
  const series = useContext(PaletteCtx);
  if (!items?.length) return <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>No data.</p>;
  const max = Math.max(1, ...items.map((it) => it.value));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((it, i) => (
        <div key={it.label} style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>{it.label}</span>
            <span style={{ color: COLORS.muted }}>{it.value}</span>
          </div>
          <div style={{ height: 8, background: COLORS.cardAlt, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: "100%", background: series[i % series.length], borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// One SDG indicator as a labelled value + explanatory note.
function SdgDetailCard({ ind }) {
  const shown = ind.value == null
    ? "—"
    : ind.unit === "%" ? `${ind.value}%`
    : ind.unit === "ratio" ? ind.value
    : `${ind.value} ${ind.unit}`;
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14, display: "grid", gap: 4 }}>
      <SdgChip code={ind.code} colour={ind.colour} />
      <div style={{ fontSize: 22, fontWeight: 700 }}>{shown}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{ind.title}</div>
      <div style={{ fontSize: 12, color: COLORS.muted }}>{ind.note}</div>
    </div>
  );
}

// Collapsible panel: the secondary detail moved out of the main view --
// SDG indicator definitions, raw count summaries, per-record-type table.
function DetailsDropdown({ indicators, dist, entities }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ minWidth: 0 }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
      >
        <span style={{ color: COLORS.muted, fontSize: 13, display: "inline-block", transition: "transform 0.25s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Summaries &amp; details</span>
      </div>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ marginTop: 18, display: "grid", gap: 22 }}>
            {indicators.length > 0 && (
              <div>
                <h4 style={subHead}>SDG indicator definitions</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {indicators.map((ind) => <SdgDetailCard key={ind.code} ind={ind} />)}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
              <div>
                <h4 style={subHead}>Qualification counts</h4>
                <MiniBars items={dist.byQualification} />
              </div>
              <div>
                <h4 style={subHead}>Classification counts</h4>
                <MiniBars items={dist.byClassification} />
              </div>
            </div>

            {entities?.length > 0 && (
              <div>
                <h4 style={subHead}>By record type</h4>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: COLORS.muted }}>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Records</th>
                      <th style={thStyle}>Mapped</th>
                      <th style={thStyle}>Last updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities.map((e) => (
                      <tr key={e.entity} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                        <td style={tdStyle}>{cap(e.entity)}</td>
                        <td style={tdStyle}>{e.records}</td>
                        <td style={tdStyle}>{e.mapped}</td>
                        <td style={{ ...tdStyle, color: COLORS.muted }}>{e.lastUpdated ? new Date(e.lastUpdated).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---- Role-altitude dashboard views ------------------------------------

// The headline gauge strip (3 % gauges + parity), reused by every altitude.
function KpiStrip({ agg, vertical }) {
  const indicators = agg?.indicators || [];
  const gauges = SDG_GAUGE_CODES.map((c) => indicators.find((i) => i.code === c)).filter(Boolean);
  const parity = indicators.find((i) => i.code === "4.5.1");
  if (!gauges.length && !parity) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: vertical ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, alignContent: vertical ? "start" : undefined }}>
      {gauges.map((ind) => <KpiGauge key={ind.code} ind={ind} />)}
      {parity && <KpiParity ind={parity} />}
    </div>
  );
}

// Full single-scope view: gauges + (optional) anonymization strip + charts +
// details dropdown. `agg` = { count, indicators, distributions }.
function IndicatorView({ agg, anon, entities }) {
  const dist = agg?.distributions || {};
  const indicators = agg?.indicators || [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 240px) minmax(0, 1fr)", gap: 20, alignItems: "stretch" }}>
        {/* KPI indicators: one narrow column spanning both chart rows */}
        <KpiStrip agg={agg} vertical />
        <div style={{ display: "grid", gap: 20, minWidth: 0, gridTemplateRows: "auto auto 1fr" }}>
          {/* Row 1: small/square qualification mix + gender split */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
            <Card style={{ minWidth: 0 }}>
              <ChartHeader title="Qualification mix" subtitle="staff by highest qualification — SDG 4.c.1" />
              <RadialMix data={dist.byQualification} height={170} />
            </Card>
            <Card style={{ minWidth: 0 }}>
              <ChartHeader title="Gender split" subtitle="teaching staff — SDG 4.5.1" />
              <GenderDonut data={dist.byGender} height={170} />
            </Card>
          </div>
          {/* Row 1.5: classification, full width of the right side */}
          <Card style={{ minWidth: 0 }}>
            <ChartHeader title="Classification" subtitle="staff by role" />
            <ClassBars data={dist.byClassification} />
          </Card>
          {/* Row 2: taller training & experience */}
          <TrainingCard cpd={dist.cpdBands} exp={dist.experienceBands} stack />
        </div>
      </div>
      <DetailsDropdown indicators={indicators} dist={dist} entities={entities} />
    </div>
  );
}

// The staff records table for ONE institution (institution view only).
function InstitutionRecords({ stats, institution }) {
  const e = stats.entities.find((x) => x.entity === "staff") || stats.entities[0];
  if (!e) return null;
  const rows = (e.rows || []).filter((r) => (r.institution || "Unspecified") === institution);
  return (
    <Card style={{ minWidth: 0 }}>
      <h3 style={{ ...cardTitle, marginBottom: 12 }}>Staff records — {institution}</h3>
      <RecordsTable columns={e.columns} rows={rows} mappingByRuli={e.mappingByRuli} />
    </Card>
  );
}

// Ministry / admin rollup: rollup gauges + a drill-down comparison table.
function RollupView({ title, agg, rows, rowLabel, entities, rlsOn = true }) {
  return (
    <>
      <h3 style={{ ...cardTitle, marginBottom: 0 }}>{title}</h3>
      <KpiStrip agg={agg} />
      <Card style={{ minWidth: 0 }}>
        <ChartHeader title={`${rowLabel} comparison`} subtitle="SDG 4.c per row · click to drill in" />
        <ComparisonTable rows={rows} rowLabel={rowLabel} entities={entities} rlsOn={rlsOn} />
      </Card>
    </>
  );
}

// Colour an indicator value good/warn/bad by simple thresholds.
function indColor(code, v) {
  if (v == null) return COLORS.muted;
  if (code === "4.c.6") return v <= 10 ? COLORS.good : v <= 20 ? WARN_BLUE : COLORS.bad;       // attrition: low good
  if (code === "4.5.1") { const d = Math.abs(v - 1); return d <= 0.1 ? COLORS.good : d <= 0.3 ? WARN_BLUE : COLORS.bad; }
  return v >= 75 ? COLORS.good : v >= 50 ? WARN_BLUE : COLORS.bad;                               // 4.c.1 / 4.c.7: high good
}
function indVal(row, code) {
  const i = (row.indicators || []).find((x) => x.code === code);
  return i ? i.value : null;
}
function ValChip({ code }) {
  return function Chip({ row }) {
    const v = indVal(row, code);
    const c = indColor(code, v);
    const text = v == null ? "—" : code === "4.5.1" ? String(v) : `${v}%`;
    return <span style={{ fontWeight: 700, color: c }}>{text}</span>;
  };
}

const COMP_COLS = [
  { code: "4.c.1", label: "Qualified" },
  { code: "4.c.7", label: "CPD" },
  { code: "4.c.6", label: "Attrition" },
  { code: "4.5.1", label: "Parity" },
];

// One comparison row's drop-down: mirrors the Institution view's Stats/Records
// tabs. Defaults to Stats (the summary gauges/charts) so a drill-in lands on the
// aggregate first, then Records for the individual staff.
function RowDetail({ row, entities, rlsOn }) {
  const [tab, setTab] = useState("stats");
  return (
    <div style={{ padding: "14px 16px 18px 0", display: "grid", gap: 14, minWidth: 0 }}>
      <nav style={{ display: "flex", gap: 4, borderBottom: `1px solid ${COLORS.border}` }}>
        <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>Stats</TabButton>
        <TabButton active={tab === "records"} onClick={() => setTab("records")}>Records</TabButton>
      </nav>
      {tab === "records" && <RowRecords entities={entities} row={row} mask={rlsOn} />}
      {tab === "stats" && <KpiStrip agg={row} />}
    </div>
  );
}

// Staff records belonging to a comparison row — an institution (match by key)
// or a territory (match against its institutions[]). Mirrors InstitutionRecords
// but row-shape agnostic. mask=true masks every value (RLS blocks this room);
// capped at 10 visible rows, then scrolls.
function RowRecords({ entities, row, mask }) {
  const e = entities?.find((x) => x.entity === "staff") || entities?.[0];
  if (!e) return <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>No records.</p>;
  const names = row.institutions?.length ? new Set(row.institutions) : null;
  const rows = (e.rows || []).filter((r) => {
    const inst = r.institution || "Unspecified";
    return names ? names.has(inst) : inst === row.key;
  });
  if (!rows.length) return <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>No staff records for {row.key}.</p>;
  return <RecordsTable columns={e.columns} rows={rows} mappingByRuli={e.mappingByRuli} mask={mask} maxRows={10} />;
}

// Expandable comparison: one row per institution/territory; expand -> RowDetail.
// rlsOn follows the viewer's access: true masks individual records in the drill
// (this room can't read another institution's people), false reveals them
// (admin has been granted access). Aggregate Stats stay visible either way.
function ComparisonTable({ rows, rowLabel, entities, rlsOn = true }) {
  const [openKey, setOpenKey] = useState(null);
  if (!rows?.length) return <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>Nothing to compare.</p>;
  return (
    <>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ textAlign: "left", color: COLORS.muted }}>
            <th style={{ ...thStyle, width: 28 }} aria-label="Expand" />
            <th style={thStyle}>{rowLabel}</th>
            <th style={thStyle}>Staff</th>
            {COMP_COLS.map((c) => <th key={c.code} style={thStyle}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = openKey === row.key;
            return (
              <Fragment key={row.key}>
                <tr onClick={() => setOpenKey(open ? null : row.key)} style={{ borderTop: `1px solid ${COLORS.border}`, cursor: "pointer" }}>
                  <td style={{ ...tdStyle, color: COLORS.muted, paddingRight: 0 }}>
                    <span style={{ display: "inline-block", transition: "transform 0.25s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                  </td>
                  <td style={tdStyle}>{row.key}</td>
                  <td style={tdStyle}>{row.count}</td>
                  {COMP_COLS.map((c) => {
                    const Chip = ValChip({ code: c.code });
                    return <td key={c.code} style={tdStyle}><Chip row={row} /></td>;
                  })}
                </tr>
                <tr style={{ background: open ? COLORS.codeBg : "transparent", transition: "background 0.25s ease" }}>
                  <td style={{ padding: 0 }} />
                  <td colSpan={2 + COMP_COLS.length} style={{ padding: 0 }}>
                    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
                      <div style={{ overflow: "hidden" }}>
                        {open && <RowDetail row={row} entities={entities} rlsOn={rlsOn} />}
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

// Admin notification + review queue, shown at the top of the Admin (OECS)
// dashboard view. Uploader-submitted alias suggestions land here; approving
// promotes the mapping into value_aliases (global, permanent), rejecting
// marks it rejected. Gated by the same adminToken the drill-down panel uses.
function AdminSuggestionsPanel() {
  const [token, setToken] = useState(null);
  const [tokenInput, setTokenInput] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = localStorage.getItem("adminToken");
      if (t) setToken(t);
    }
  }, []);

  const load = useCallback(async (tok) => {
    setError(null);
    try {
      const r = await fetch("/api/admin/alias-suggestions", { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSuggestions(j.suggestions);
    } catch (e) { setError(String(e.message)); }
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  async function act(id, action) {
    // On reject, let the admin attach a reason the uploader will see (blank =
    // a generic "declined" message).
    let note;
    if (action === "reject") {
      note = window.prompt("Reason for declining (optional — the uploader sees this):", "");
      if (note === null) return; // cancelled
    }
    setBusy((b) => ({ ...b, [id]: action }));
    setError(null);
    try {
      const r = await fetch("/api/admin/alias-suggestions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ id, action, note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await load(token);
    } catch (e) { setError(String(e.message)); }
    finally { setBusy((b) => { const n = { ...b }; delete n[id]; return n; }); }
  }

  // Locked: prompt for the admin key (mirrors DrillDownPanel).
  if (!token) {
    return (
      <Card>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Alias suggestions</div>
        <p style={{ color: COLORS.muted, margin: "0 0 10px", fontSize: 14 }}>
          Unlock with the admin key to review uploader-submitted value mappings.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="password" placeholder="Admin key" value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && tokenInput) { localStorage.setItem("adminToken", tokenInput); window.dispatchEvent(new Event("admin-token-change")); setToken(tokenInput); } }}
            style={{ flex: 1, padding: "7px 10px", fontSize: 14, borderRadius: 7,
              border: `1px solid ${COLORS.border}`, background: COLORS.fieldBg, color: COLORS.text }}
          />
          <button type="button" disabled={!tokenInput}
            onClick={() => { localStorage.setItem("adminToken", tokenInput); window.dispatchEvent(new Event("admin-token-change")); setToken(tokenInput); }}
            style={{ padding: "7px 14px", fontSize: 14, borderRadius: 7, border: "none",
              background: tokenInput ? COLORS.accent : COLORS.disabled, color: "#fff",
              cursor: tokenInput ? "pointer" : "default" }}>
            Unlock
          </button>
        </div>
      </Card>
    );
  }

  if (!suggestions) {
    return <Card><span style={{ color: COLORS.muted, fontSize: 14 }}>Loading suggestions…</span></Card>;
  }

  const count = suggestions.length;
  return (
    <Card style={{ minWidth: 0, borderColor: count ? "#fca5a5" : COLORS.border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: count ? 14 : 0 }}>
        <h3 style={{ ...cardTitle, margin: 0 }}>Alias suggestions</h3>
        {count > 0 && (
          <span style={{ background: "#ef4444", color: "#fff", fontWeight: 700,
            fontSize: 12, borderRadius: 999, padding: "2px 9px" }}>
            {count} pending
          </span>
        )}
        <button type="button" onClick={() => load(token)} style={{ ...ghostButton, marginLeft: "auto", padding: "5px 12px" }}>Refresh</button>
      </div>
      {error && <p style={{ color: COLORS.errText, fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
      {count === 0 ? (
        <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>No pending suggestions.</p>
      ) : (
        <>
          <p style={{ color: COLORS.muted, margin: "0 0 12px", fontSize: 14 }}>
            Uploaders mapped these unrecognized values. Approve to add the mapping to
            validation rules for everyone going forward.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: COLORS.muted }}>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Uploaded value</th>
                  <th style={thStyle}>Mapped to</th>
                  <th style={thStyle}>Institution</th>
                  <th style={thStyle}>Submitted</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                    <td style={tdStyle}><b>{s.field}</b></td>
                    <td style={tdStyle}>
                      <code style={{ background: COLORS.codeBg, padding: "1px 6px", borderRadius: 5 }}>{s.variant}</code>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: COLORS.accent }}>{s.canonical}</td>
                    <td style={{ ...tdStyle, color: COLORS.muted }}>{s.institution || "—"}</td>
                    <td style={{ ...tdStyle, color: COLORS.muted, whiteSpace: "nowrap" }}>{new Date(s.submitted_at).toLocaleString()}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" disabled={!!busy[s.id]} onClick={() => act(s.id, "approve")}
                          style={{ border: "none", background: COLORS.accent, color: "#fff",
                            borderRadius: 7, padding: "6px 13px", fontSize: 13, fontWeight: 500,
                            cursor: busy[s.id] ? "default" : "pointer", opacity: busy[s.id] ? 0.6 : 1 }}>
                          {busy[s.id] === "approve" ? "Approving…" : "Approve"}
                        </button>
                        <button type="button" disabled={!!busy[s.id]} onClick={() => act(s.id, "reject")}
                          style={{ ...dangerButton, padding: "6px 12px", fontSize: 13,
                            cursor: busy[s.id] ? "default" : "pointer", opacity: busy[s.id] ? 0.6 : 1 }}>
                          {busy[s.id] === "reject" ? "Rejecting…" : "Reject"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// Admin headline: reporting completeness across the OECS.
function AdminCompleteness({ byTerritory, byInstitution, totalStaff, mapped }) {
  const metrics = [
    { label: "Territories reporting", value: byTerritory.length },
    { label: "Institutions reporting", value: byInstitution.length },
    { label: "Staff records", value: totalStaff },
    { label: "Anonymized", value: `${mapped}/${totalStaff}` },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
      {metrics.map((m) => (
        <Card key={m.label}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{m.value}</div>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>{m.label}</div>
        </Card>
      ))}
    </div>
  );
}

// mask=true: row-level security blocks this viewer — keep the table shape but
// replace every value (incl. RULI) with asterisks and disable row expansion, so
// nobody outside the record's room can read it.
// maxRows: cap visible height to N rows; beyond that the body scrolls vertically.
function RecordsTable({ columns, rows, mappingByRuli, mask = false, maxRows = null }) {
  const [openRuli, setOpenRuli] = useState(null);

  if (!rows || rows.length === 0) {
    return <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>No rows.</p>;
  }
  const MASK = "*****";
  // RLS blocks this viewer: don't render every row as asterisks (wastes space).
  // Show just a few masked rows so it reads as "locked", then a hidden-count note.
  const MASK_PREVIEW = 3;
  const visibleRows = mask ? rows.slice(0, MASK_PREVIEW) : rows;
  const scroll = !mask && maxRows != null && rows.length > maxRows;
  const stickyTh = scroll
    ? { position: "sticky", top: 0, background: COLORS.card, zIndex: 1 }
    : null;
  return (
    <div style={{ overflowX: "auto", overflowY: scroll ? "auto" : "visible", maxHeight: scroll ? maxRows * 46 + 46 : undefined }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ textAlign: "left", color: COLORS.muted }}>
            <th style={{ ...thStyle, width: 28, ...stickyTh }} aria-label="Expand" />
            {columns.map((c) => (
              <th key={c} style={{ ...thStyle, whiteSpace: "nowrap", ...stickyTh }}>{fmtHeader(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => {
            const ruli = row.RULI;
            const open = !mask && openRuli === ruli;
            const mapping = mappingByRuli?.[ruli];
            return (
              <Fragment key={ruli ?? i}>
                <tr
                  onClick={mask ? undefined : () => setOpenRuli(open ? null : ruli)}
                  style={{ borderTop: `1px solid ${COLORS.border}`, cursor: mask ? "default" : "pointer" }}
                >
                  <td style={{ ...tdStyle, color: COLORS.muted, paddingRight: 0 }}>
                    {!mask && (
                      <span style={{ display: "inline-block", transition: "transform 0.25s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                    )}
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c}
                      style={{
                        ...tdStyle,
                        fontFamily: c === "RULI" || mask ? "monospace" : "inherit",
                        color: c === "RULI" || mask ? COLORS.muted : "var(--text)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {mask ? (
                        MASK
                      ) : c === "RULI" ? (
                        <CopyableId value={row[c]} />
                      ) : row[c] === undefined || row[c] === "" ? (
                        "—"
                      ) : (
                        String(row[c])
                      )}
                    </td>
                  ))}
                </tr>
                {!mask && (
                  <tr style={{ background: open ? COLORS.codeBg : "transparent", transition: "background 0.25s ease" }}>
                    <td style={{ padding: 0 }} />
                    <td colSpan={columns.length} style={{ padding: 0 }}>
                      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
                        <div style={{ overflow: "hidden" }}>
                          <div style={{ padding: "14px 16px 18px 0" }}>
                            <MappingDetail ruli={ruli} mapping={mapping} />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Private RULI -> identity mapping, revealed when a record row is expanded.
function MappingDetail({ ruli, mapping }) {
  if (!mapping) {
    return (
      <span style={{ color: COLORS.muted, fontSize: 14 }}>
        No mapping in this tab&apos;s session storage — identity mappings are not stored on the server.
      </span>
    );
  }
  // mapping shape: { RULI, salt, <entity>: { ...sensitive fields } }
  const sensitive = mapping.staff ?? mapping.student ?? {};
  const fields = Object.keys(sensitive);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.accent }}>
        Staff mapping
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 15 }}>
        <span style={{ color: COLORS.muted }}>RULI</span>
        <CopyableId value={ruli} color="var(--text)" />
        <span style={{ color: COLORS.muted }}>salt</span>
        <CopyableId value={mapping.salt} color="var(--text)" />
        {fields.map((k) => (
          <Fragment key={k}>
            <span style={{ color: COLORS.muted }}>{k}</span>
            <span>{sensitive[k] === "" || sensitive[k] == null ? "—" : String(sensitive[k])}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// Collect every column present across rejected rows' original data, so the
// upload-result view (which has no precomputed column list) can render a table.
function rejectedColumns(rejected) {
  const cols = [];
  for (const r of rejected || []) {
    for (const k of Object.keys(r?.data ?? {})) {
      if (!cols.includes(k)) cols.push(k);
    }
  }
  return cols;
}

// One error may be a structured object { field, label, message, hint } (new)
// or a plain string (legacy / batch errors). Normalize either to {field,hint}.
function normalizeError(e) {
  if (e && typeof e === "object") {
    return { field: e.field || null, label: e.label, message: e.message, hint: e.hint };
  }
  // legacy string "field: message" -> pull the field prefix if present
  const s = String(e);
  const m = s.match(/^([a-z0-9_]+):\s*(.*)$/i);
  return m ? { field: m[1], hint: s } : { field: null, hint: s };
}

// Rows that FAILED validation. The exact cells that failed are highlighted in
// red; a side column explains, in plain language, what is wrong and how to fix
// it -- written so a teacher / school clerk can act on it without help.
function RejectedTable({ columns, rejected }) {
  if (!rejected || rejected.length === 0) {
    return <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>No rejected rows.</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr style={{ textAlign: "left", color: COLORS.muted }}>
            <th style={{ ...thStyle, whiteSpace: "nowrap" }}>Row</th>
            {columns.map((c) => (
              <th key={c} style={{ ...thStyle, whiteSpace: "nowrap" }}>{fmtHeader(c)}</th>
            ))}
            <th style={{ ...thStyle, minWidth: 280 }}>What's wrong &amp; how to fix it</th>
          </tr>
        </thead>
        <tbody>
          {rejected.map((r, i) => {
            const errs = (r.errors || []).map(normalizeError);
            const badFields = new Set(errs.map((e) => e.field).filter(Boolean));
            return (
              <tr key={i} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ ...tdStyle, color: COLORS.muted }}>{r.row}</td>
                {columns.map((c) => {
                  const bad = badFields.has(c);
                  return (
                    <td
                      key={c}
                      style={{
                        ...tdStyle,
                        whiteSpace: "nowrap",
                        background: bad ? COLORS.errBg : "transparent",
                        color: bad ? COLORS.errText : COLORS.text,
                        fontWeight: bad ? 600 : 400,
                        boxShadow: bad ? `inset 0 0 0 1px ${COLORS.errBorder}` : "none",
                      }}
                    >
                      {r.data?.[c] === undefined || r.data?.[c] === "" ? "—" : String(r.data[c])}
                    </td>
                  );
                })}
                <td style={tdStyle}>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                    {errs.map((e, j) => (
                      <li key={j} style={{ color: COLORS.text, fontSize: 14 }}>
                        {e.label && (
                          <span style={{ color: COLORS.errText, fontWeight: 600 }}>{e.label}: </span>
                        )}
                        {e.hint}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================================
// MINISTER APPROVALS  --  L2 queue for pending submissions
// =====================================================================
function ApprovalsPanel({ demoCountry, setDemoCountry, countries }) {
  const minister = countries.find((m) => m.iso === demoCountry) || countries[0];
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [previewAggs, setPreviewAggs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions/pending", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load pending submissions");
      setPending(json.pending || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, demoCountry]);

  async function previewSubmission(id) {
    setPreviewId(id);
    setPreviewAggs([]);
    try {
      const res = await fetch(`/api/submissions/pending?submissionId=${id}`, { credentials: "include" });
      const json = await res.json();
      setPreviewAggs(json.aggregations || []);
    } catch {
      setPreviewAggs([]);
    }
  }

  async function act(id, action) {
    setBusyId(id);
    setError(null);
    try {
      let reason = "";
      if (action === "reject") {
        reason = window.prompt("Rejection reason (optional):") ?? "";
      }
      const res = await fetch(`/api/submissions/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `${action} failed`);
      if (previewId === id) { setPreviewId(null); setPreviewAggs([]); }
      await load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <h3 style={{ ...cardTitle, marginBottom: 4 }}>Country approvals (L2)</h3>
            <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>
              Campus submissions (L1 auto-approved) awaiting ministerial sign-off before OECS visibility.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Country">
              <select
                value={demoCountry}
                onChange={(e) => setDemoCountry(e.target.value)}
                style={{ ...inputStyle, minWidth: 240 }}
              >
                {countries.map((m) => (
                  <option key={m.iso} value={m.iso}>
                    {m.name} ({m.iso}) · {m.approvalRequired ? "L2 required" : "auto-approve"}
                  </option>
                ))}
              </select>
            </Field>
            <button type="button" onClick={load} style={ghostButton}>Refresh</button>
          </div>
        </div>
        {!minister?.approvalRequired && minister && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: COLORS.muted }}>
            {minister.name} has L2 approval turned off — campus submissions go straight to OECS after L1. Switch to a country with L2 required to demo the minister approval queue.
          </p>
        )}
      </Card>
      {error && (
        <Card style={{ background: COLORS.errBg, borderColor: COLORS.errBorder }}>
          <span style={{ color: COLORS.errText }}>{error}</span>
        </Card>
      )}
      {loading ? (
        <Card><span style={{ color: COLORS.muted }}>Loading pending submissions…</span></Card>
      ) : pending.length === 0 ? (
        <Card>
          <p style={{ color: COLORS.muted, margin: 0 }}>
            {minister?.approvalRequired
              ? "No submissions pending L2 approval for this country."
              : "No L2 queue for this country — submissions are approved automatically after campus submit."}
          </p>
        </Card>
      ) : (
        <Card style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: COLORS.muted }}>
                <th style={thStyle}>Campus</th>
                <th style={thStyle}>Entity</th>
                <th style={thStyle}>Submitted</th>
                <th style={thStyle}>Aggregates</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((s) => (
                <Fragment key={s.id}>
                  <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
                    <td style={tdStyle}>{s.school_name || s.school_code}</td>
                    <td style={tdStyle}>{s.entity}</td>
                    <td style={tdStyle}>{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}</td>
                    <td style={tdStyle}>{s.aggregation_count ?? 0}</td>
                    <td style={{ ...tdStyle, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" style={ghostButton} onClick={() => previewSubmission(s.id)}>
                        {previewId === s.id ? "Hide" : "Preview"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        style={{ ...ghostButton, color: COLORS.good, borderColor: COLORS.good }}
                        onClick={() => act(s.id, "approve")}
                      >
                        {busyId === s.id ? "…" : "Approve L2"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        style={{ ...ghostButton, color: COLORS.bad, borderColor: COLORS.bad }}
                        onClick={() => act(s.id, "reject")}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                  {previewId === s.id && previewAggs.length > 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: "8px 12px 16px" }}>
                        <AggregationsPreviewTable rows={previewAggs} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function AggregationsPreviewTable({ rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: COLORS.muted }}>
          <th style={thStyle}>SDG</th>
          <th style={thStyle}>Numerator</th>
          <th style={thStyle}>Denominator</th>
          <th style={thStyle}>Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <td style={tdStyle}>{r.sdg}</td>
            <td style={tdStyle}>{r.numerator ?? "—"}</td>
            <td style={tdStyle}>{r.denominator ?? "—"}</td>
            <td style={tdStyle}>{r.result ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OecsAggregationsPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/aggregations", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load aggregations");
      setRows(json.rows || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ ...cardTitle, marginBottom: 4 }}>OECS approved aggregates</h3>
          <p style={{ color: COLORS.muted, margin: 0, fontSize: 13 }}>
            SDG rows from fully approved campus submissions — country and campus attached.
          </p>
        </div>
        <button type="button" onClick={load} style={ghostButton}>Refresh</button>
      </div>
      {error && <p style={{ color: COLORS.bad, fontSize: 13 }}>{error}</p>}
      {loading ? (
        <span style={{ color: COLORS.muted }}>Loading…</span>
      ) : rows.length === 0 ? (
        <p style={{ color: COLORS.muted, margin: 0 }}>No approved aggregates yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: COLORS.muted }}>
              <th style={thStyle}>SDG</th>
              <th style={thStyle}>Country</th>
              <th style={thStyle}>Campus</th>
              <th style={thStyleNum}>Numerator</th>
              <th style={thStyleNum}>Denominator</th>
              <th style={thStyleNum}>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={tdStyle}>{r.sdg}</td>
                <td style={tdStyle}>{r.countryName || r.country || "—"}</td>
                <td style={tdStyle}>{r.campus || "—"}</td>
                <td style={tdStyleNum}>{r.numerator ?? "—"}</td>
                <td style={tdStyleNum}>{r.denominator ?? "—"}</td>
                <td style={tdStyleNum}>{r.result ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// =====================================================================
// ACCESS (RLS) — admin key gate + drill-down toggles
// =====================================================================
function AccessDemo() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <DrillDownPanel onRefresh={() => {}} />
    </div>
  );
}

// Picks the view shape by the resolved scope:
//   institution (teacher) -> one/few schools, each as classes -> students
//   ministry    (minister)-> all country schools as a drillable table
//   all         (admin)   -> every school, same drillable table
function HierarchyView({ hierarchy }) {
  if (!hierarchy || !hierarchy.schools?.length) {
    return (
      <Card>
        <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>
          Nothing visible — blocked by row-level security.
        </p>
      </Card>
    );
  }
  if (hierarchy.scope === "institution") {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        {hierarchy.schools.map((s) => (
          <InstitutionView key={s.code} school={s} />
        ))}
      </div>
    );
  }
  return <MinistryView schools={hierarchy.schools} aggregateOnly={hierarchy.aggregateOnly} />;
}

// Institution = a single school. Header + its classes, each expandable to
// the students in that class.
function InstitutionView({ school }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ ...cardTitle, marginBottom: 0 }}>{school.name}</h3>
        <span style={{ color: COLORS.muted, fontSize: 15 }}>
          {school.code} · {school.level ?? "—"} · {school.country}
        </span>
      </div>
      <p style={{ color: COLORS.muted, margin: "0 0 16px", fontSize: 15 }}>
        {school.stats.students} students · {school.stats.classes} classes ·{" "}
        {school.stats.male}M / {school.stats.female}F
      </p>
      {school.drillable === false
        ? <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>
            Students hidden for this institution — aggregate counts only (row-level security).
          </p>
        : <ClassList classes={school.classes} />}
    </Card>
  );
}

// Ministry = every school in the territory, grouped into the primary /
// secondary hierarchy. Each school row expands to its classes -> students.
const LEVEL_ORDER = ["primary", "secondary", "tertiary"];
const LEVEL_LABEL = {
  primary: "Primary schools",
  secondary: "Secondary schools",
  tertiary: "Tertiary institutions",
};

function MinistryView({ schools, aggregateOnly }) {
  const [openCode, setOpenCode] = useState(null);
  const total = schools.reduce((n, s) => n + s.stats.students, 0);

  // Group by level, ordered primary -> prep -> secondary, unknowns last.
  const groups = new Map();
  for (const s of schools) {
    const lvl = s.level || "other";
    if (!groups.has(lvl)) groups.set(lvl, []);
    groups.get(lvl).push(s);
  }
  const levels = [...groups.keys()].sort((a, b) => {
    const ia = LEVEL_ORDER.indexOf(a), ib = LEVEL_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <Card>
      <h3 style={cardTitle}>
        Schools in territory{" "}
        <span style={{ color: COLORS.muted, fontWeight: 400 }}>
          ({schools.length} schools · {total} students)
        </span>
      </h3>
      {aggregateOnly && (
        <div style={{ background: "#ebf3ff", border: "1px solid #8abafd", color: "#0e4592",
          borderRadius: 8, padding: "10px 14px", fontSize: 14, margin: "0 0 16px" }}>
          Drill-down restricted by admin — per-school totals only, no individual students.
          (RLS hides the student rows.)
        </div>
      )}
      <div style={{ display: "grid", gap: 22 }}>
        {levels.map((lvl) => {
          const group = groups.get(lvl);
          const gStudents = group.reduce((n, s) => n + s.stats.students, 0);
          return (
            <div key={lvl}>
              <h4 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 8px", color: COLORS.accent }}>
                {LEVEL_LABEL[lvl] || cap(lvl)}{" "}
                <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: 14 }}>
                  ({group.length} schools · {gStudents} students)
                </span>
              </h4>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: COLORS.muted }}>
                      <th style={{ ...thStyle, width: 28 }} aria-label="Expand" />
                      <th style={thStyle}>School</th>
                      <th style={thStyle}>Code</th>
                      <th style={thStyle}>Students</th>
                      <th style={thStyle}>Classes</th>
                      <th style={thStyle}>M / F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((s) => {
                      const open = openCode === s.code;
                      return (
                        <Fragment key={s.code}>
                          <tr
                            onClick={() => setOpenCode(open ? null : s.code)}
                            style={{ borderTop: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                          >
                            <td style={{ ...tdStyle, color: COLORS.muted, paddingRight: 0 }}>
                              <span style={{ display: "inline-block", transition: "transform 0.25s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                            </td>
                            <td style={tdStyle}>{s.name}{s.drillable === false && <span title="Drill-down restricted by admin" style={{ marginLeft: 6, fontSize: 12, color: COLORS.muted, display: "inline-flex", alignItems: "center", gap: 4 }}><Lock size={11} strokeWidth={2.5} /> aggregate</span>}</td>
                            <td style={{ ...tdStyle, color: COLORS.muted }}>{s.code}</td>
                            <td style={tdStyle}>{s.stats.students}</td>
                            <td style={tdStyle}>{s.stats.classes ?? "—"}</td>
                            <td style={tdStyle}>{s.stats.male} / {s.stats.female}</td>
                          </tr>
                          <tr style={{ background: open ? COLORS.codeBg : "transparent", transition: "background 0.25s ease" }}>
                            <td style={{ padding: 0 }} />
                            <td colSpan={5} style={{ padding: 0 }}>
                              <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
                                <div style={{ overflow: "hidden" }}>
                                  <div style={{ padding: "14px 16px 18px 0" }}>
                                    {s.drillable === false
                                      ? <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>
                                          Students hidden for this institution — aggregate counts only (row-level security).
                                        </p>
                                      : <ClassList classes={s.classes} />}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Sliding on/off switch (knob moves left→right). Shared by DrillDownPanel.
function Switch({ on, onChange, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={!!on} aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      style={{
        position: "relative", width: 44, height: 24, borderRadius: 999,
        border: "none", padding: 0, flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        background: on ? COLORS.accent : COLORS.disabled,
        opacity: disabled ? 0.5 : 1,
        transition: "background .15s ease",
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20,
        borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.35)",
        transition: "left .15s ease",
      }} />
    </button>
  );
}

const DD_LEVEL_ORDER = ["primary", "secondary", "tertiary"];
const DD_LEVEL_LABEL = {
  primary: "Primary schools",
  secondary: "Secondary schools",
  tertiary: "Tertiary institutions",
};

// Admin-only accordion: territory → level → school, each with a drill-down toggle.
// Starts fully collapsed — expand each tier to see the next.
function DrillDownPanel({ onRefresh }) {
  const [token, setToken] = useState(null);
  const [tokenInput, setTokenInput] = useState("");
  const [schools, setSchools] = useState(null);
  const [ddError, setDdError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Accordion open state: Set of country codes + "country:level" keys.
  const [openKeys, setOpenKeys] = useState(new Set());

  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = localStorage.getItem("adminToken");
      if (t) setToken(t);
    }
  }, []);

  const load = useCallback(async (tok) => {
    setDdError(null);
    try {
      const r = await fetch("/api/admin/drilldown", { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSchools(j.schools);
    } catch (e) { setDdError(String(e.message)); }
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  async function post(body) {
    setBusy(true); setDdError(null);
    try {
      const r = await fetch("/api/admin/drilldown", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await load(token);
      onRefresh();
    } catch (e) { setDdError(String(e.message)); }
    finally { setBusy(false); }
  }

  function toggleKey(k) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  const rowStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, padding: "10px 14px", cursor: "pointer", userSelect: "none",
  };

  if (!token) {
    return (
      <Card>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Drill-down controls</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="password" placeholder="Admin key" value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && tokenInput) { localStorage.setItem("adminToken", tokenInput); window.dispatchEvent(new Event("admin-token-change")); setToken(tokenInput); } }}
            style={{ flex: 1, padding: "7px 10px", fontSize: 14, borderRadius: 7,
              border: `1px solid ${COLORS.border}`, background: COLORS.fieldBg, color: COLORS.text }}
          />
          <button type="button" disabled={!tokenInput}
            onClick={() => { localStorage.setItem("adminToken", tokenInput); window.dispatchEvent(new Event("admin-token-change")); setToken(tokenInput); }}
            style={{ padding: "7px 14px", fontSize: 14, borderRadius: 7, border: "none",
              background: tokenInput ? COLORS.accent : COLORS.disabled, color: "#fff",
              cursor: tokenInput ? "pointer" : "default" }}>
            Unlock
          </button>
        </div>
      </Card>
    );
  }

  if (!schools) {
    return <Card><span style={{ color: COLORS.muted, fontSize: 14 }}>Loading…</span></Card>;
  }

  // Build country → level → schools map.
  const byCountry = new Map();
  for (const s of schools) {
    const c = s.country || "Unknown";
    if (!byCountry.has(c)) byCountry.set(c, new Map());
    const lvl = s.level || "other";
    if (!byCountry.get(c).has(lvl)) byCountry.get(c).set(lvl, []);
    byCountry.get(c).get(lvl).push(s);
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {/* Card header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          Drill-down controls
          <span style={{ fontWeight: 400, fontSize: 13, color: COLORS.muted, marginLeft: 8 }}>
            row-level security
          </span>
        </span>
        {ddError && <span style={{ color: COLORS.errText, fontSize: 13 }}>{ddError}</span>}
      </div>

      {/* Countries */}
      {[...byCountry.entries()].map(([country, levelMap]) => {
        const cSchools = [...levelMap.values()].flat();
        const cAllOn = cSchools.every((s) => s.can_drill);
        const cOpen = openKeys.has(country);
        const levels = [...levelMap.keys()].sort((a, b) => {
          const ia = DD_LEVEL_ORDER.indexOf(a), ib = DD_LEVEL_ORDER.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });

        return (
          <div key={country} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            {/* Territory row */}
            <div style={{ ...rowStyle, background: COLORS.cardAlt }}
              onClick={() => toggleKey(country)}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 15 }}>
                <span style={{ fontSize: 12, color: COLORS.muted, display: "inline-block", transition: "transform 0.25s ease", transform: cOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                <Globe size={15} strokeWidth={2.25} style={{ color: COLORS.muted, flexShrink: 0 }} />
                {country}
                <span style={{ fontWeight: 400, fontSize: 13, color: COLORS.muted }}>
                  {cSchools.length} schools
                </span>
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                color: cAllOn ? COLORS.good : COLORS.muted }}
                onClick={(e) => e.stopPropagation()}>
                {cAllOn ? "all on" : "some off"}
                <Switch on={cAllOn} disabled={busy} label={`Toggle all in ${country}`}
                  onChange={(v) => post({ country_iso: country, canDrill: v })} />
              </label>
            </div>

            {/* Levels (visible when country expanded) */}
            <div style={{ display: "grid", gridTemplateRows: cOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
              <div style={{ overflow: "hidden" }}>
                {levels.map((lvl) => {
                  const group = levelMap.get(lvl);
                  const lvlAllOn = group.every((s) => s.can_drill);
                  const lvlKey = `${country}:${lvl}`;
                  const lvlOpen = openKeys.has(lvlKey);

                  return (
                    <div key={lvl} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      {/* Level row */}
                      <div style={{ ...rowStyle, paddingLeft: 32, background: COLORS.card }}
                        onClick={() => toggleKey(lvlKey)}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8,
                          fontWeight: 500, fontSize: 14, color: COLORS.accent }}>
                          <span style={{ fontSize: 11, color: COLORS.muted, display: "inline-block", transition: "transform 0.25s ease", transform: lvlOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                          {DD_LEVEL_LABEL[lvl] || lvl}
                          <span style={{ fontWeight: 400, color: COLORS.muted, fontSize: 12 }}>
                            ({group.length})
                          </span>
                        </span>
                        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12,
                          color: lvlAllOn ? COLORS.good : COLORS.muted }}
                          onClick={(e) => e.stopPropagation()}>
                          all {lvlAllOn ? "on" : "off"}
                          <Switch on={lvlAllOn} disabled={busy} label={`Toggle all ${lvl} in ${country}`}
                            onChange={(v) => {
                              setSchools((prev) => prev.map((x) =>
                                group.find((g) => g.id === x.id) ? { ...x, can_drill: v } : x));
                              Promise.all(group.map((s) =>
                                fetch("/api/admin/drilldown", {
                                  method: "POST",
                                  headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
                                  body: JSON.stringify({ schoolId: s.id, canDrill: v }),
                                })
                              )).then(() => { load(token); onRefresh(); });
                            }} />
                        </label>
                      </div>

                      {/* Schools (visible when level expanded) */}
                      <div style={{ display: "grid", gridTemplateRows: lvlOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
                        <div style={{ overflow: "hidden" }}>
                          {group.map((s) => (
                            <div key={s.id} style={{ display: "flex", alignItems: "center",
                              justifyContent: "space-between", gap: 12,
                              padding: "9px 16px 9px 52px",
                              borderTop: `1px solid ${COLORS.border}`, background: COLORS.codeBg }}>
                              <div style={{ minWidth: 0 }}>
                                <span style={{ fontSize: 14 }}>{s.name}</span>
                                <span style={{ fontSize: 12, color: COLORS.muted, marginLeft: 8 }}>
                                  {s.code} · {s.students} students
                                </span>
                              </div>
                              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12,
                                color: s.can_drill ? COLORS.good : COLORS.muted, whiteSpace: "nowrap" }}
                                onClick={(e) => e.stopPropagation()}>
                                {s.can_drill ? "drill-down" : "aggregate"}
                                <Switch on={s.can_drill} disabled={busy}
                                  label={`Toggle drill-down for ${s.name}`}
                                  onChange={(v) => {
                                    setSchools((prev) => prev.map((x) => x.id === s.id ? { ...x, can_drill: v } : x));
                                    post({ schoolId: s.id, canDrill: v });
                                  }} />
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// Shared: list of classes, each expandable to its students (RULI/gender/age).
function ClassList({ classes }) {
  const [openClass, setOpenClass] = useState(null);
  if (!classes || classes.length === 0) {
    return <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>No classes.</p>;
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {classes.map((cl) => {
        const open = openClass === cl.name;
        return (
          <div key={cl.name} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
            <button
              onClick={() => setOpenClass(open ? null : cl.name)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "none",
                border: "none",
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              <span>
                <span style={{ display: "inline-block", marginRight: 6, transition: "transform 0.25s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                {cl.name}
              </span>
              <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: 14 }}>
                {cl.students.length} students
              </span>
            </button>
            <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
              <div style={{ overflow: "hidden" }}>
                <div style={{ borderTop: `1px solid ${COLORS.border}`, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: COLORS.muted }}>
                        <th style={{ ...thStyle, paddingLeft: 14 }}>RULI</th>
                        <th style={thStyle}>Gender</th>
                        <th style={thStyle}>Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cl.students.map((st) => (
                        <tr key={st.ruli} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                          <td style={{ ...tdStyle, paddingLeft: 14 }}>
                            <CopyableId value={st.ruli} />
                          </td>
                          <td style={tdStyle}>{st.gender ?? "—"}</td>
                          <td style={tdStyle}>{st.age ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ViewModeSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="View as"
      style={{ ...inputStyle, minWidth: 220, fontWeight: 500, padding: "9px 12px" }}
    >
      {VIEW_MODES.map((m) => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 14, color: COLORS.muted }}>{label}</div>
    </div>
  );
}

// Background section: institution-level safety + facilities facts (items
// 1.13–1.18) -> SDG 4.a.1 (facilities) / 4.a.3 (safety). Recomputes the
// headline shares from the scoped institution fact rows so it respects the
// View-as selection. Renders nothing when no institution reported facts.
const BG_PINK = "#ec4899";
const BG_RED = "#ef4444";
function BackgroundPanel({ institutions }) {
  const insts = institutions || [];
  const n = insts.length;
  if (!n) return null;
  const yes = (f) => insts.filter((i) => i[f] === "Y").length;
  const pct = (c) => Math.round((c / n) * 1000) / 10;
  const drills = insts.reduce((s, i) => s + (Number(i.emergencyDrills) || 0), 0);
  const cards = [
    { code: "4.a.1", colour: BG_PINK, title: "Disability-accessible", value: `${pct(yes("disabilityAccess"))}%`, detail: `${yes("disabilityAccess")} of ${n}` },
    { code: "4.a.1", colour: BG_PINK, title: "OECS NREN", value: `${pct(yes("nrenMember"))}%`, detail: `${yes("nrenMember")} of ${n}` },
    { code: "4.a.3", colour: BG_RED, title: "Disaster plan", value: `${pct(yes("disasterPlan"))}%`, detail: `${yes("disasterPlan")} of ${n}` },
    { code: "4.a.3", colour: BG_RED, title: "Emergency drills", value: drills, detail: `across ${n} inst.` },
  ];
  const yn = (v) => (v === "Y" ? "Yes" : v === "N" ? "No" : "—");
  return (
    <Card style={{ minWidth: 0, overflowX: "auto" }}>
      <h3 style={cardTitle}>Safety &amp; facilities — SDG 4.a.1 / 4.a.3</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.title} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, display: "grid", gap: 4 }}>
            <SdgChip code={c.code} colour={c.colour} />
            <div style={{ fontSize: 26, fontWeight: 700, color: c.colour }}>{c.value}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>{c.detail}</div>
          </div>
        ))}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: COLORS.muted }}>
            <th style={enrolTh}>Institution</th>
            <th style={enrolTh}>Disaster plan</th>
            <th style={enrolThNum}>Drills</th>
            <th style={enrolTh}>Disability access</th>
            <th style={enrolTh}>NREN</th>
            <th style={enrolThNum}>Research staff (M/F)</th>
          </tr>
        </thead>
        <tbody>
          {insts.map((i) => (
            <tr key={i.institution} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={enrolTd}>{i.institution}</td>
              <td style={enrolTd}>{yn(i.disasterPlan)}</td>
              <td style={enrolTdNum}>{i.emergencyDrills ?? "—"}</td>
              <td style={enrolTd}>{yn(i.disabilityAccess)}</td>
              <td style={enrolTd}>{yn(i.nrenMember)}</td>
              <td style={enrolTdNum}>{(i.researchStaffM ?? "—")} / {(i.researchStaffF ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// Finance section: institution-level revenue/expenditure/equity/salary (T13)
// -> SDG 4.5.3 (equity), 4.5.4 (expenditure per student), 4.c.5 (salary ratio).
// Recomputes scoped headline figures from the fact rows. Renders nothing when
// no institution reported finance.
const FIN_PURPLE = "#8b5cf6";
const FIN_BLUE = "#0ea5e9";
const FIN_GREEN = "#3fb950";
function FinancePanel({ institutions }) {
  const insts = institutions || [];
  const n = insts.length;
  if (!n) return null;
  const numv = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const withEquity = insts.filter((i) => i.equityMechanism === "Y").length;
  const totalExp = insts.reduce((s, i) => s + numv(i.totalExpenditure), 0);
  const totalEnrolled = insts.reduce((s, i) => s + numv(i.enrolled), 0);
  const perStudent = totalEnrolled > 0 ? Math.round(totalExp / totalEnrolled) : null;
  const ratios = insts
    .map((i) => (numv(i.comparatorSalary) > 0 ? numv(i.avgTeacherSalary) / numv(i.comparatorSalary) : (Number(i.salaryRatio) || null)))
    .filter((v) => Number.isFinite(v) && v > 0);
  const avgRatio = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100 : null;
  const money = (v) => (v == null ? "—" : Number(v).toLocaleString());
  const cards = [
    { code: "4.5.3", colour: FIN_PURPLE, title: "Equity funding mechanism", value: `${Math.round((withEquity / n) * 1000) / 10}%`, detail: `${withEquity} of ${n} institutions` },
    { code: "4.5.4", colour: FIN_BLUE, title: "Expenditure per student", value: money(perStudent), detail: "recurrent exp. ÷ enrolled" },
    { code: "4.c.5", colour: FIN_GREEN, title: "Teacher salary ratio", value: avgRatio == null ? "—" : avgRatio, detail: ratios.length ? `avg of ${ratios.length}` : "no salary data" },
  ];
  return (
    <Card style={{ minWidth: 0, overflowX: "auto" }}>
      <h3 style={cardTitle}>Finance — SDG 4.5.3 / 4.5.4 / 4.c.5</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.title} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, display: "grid", gap: 4 }}>
            <SdgChip code={c.code} colour={c.colour} />
            <div style={{ fontSize: 26, fontWeight: 700, color: c.colour }}>{c.value}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>{c.detail}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: COLORS.muted, margin: "0 0 12px" }}>
        SDG 4.5.6 (% of GDP) and 4.5.5 (ODA share) need external GDP / national-ODA inputs the instrument doesn’t collect — only the local expenditure side is shown.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: COLORS.muted }}>
            <th style={enrolTh}>Institution</th>
            <th style={enrolThNum}>Expenditure</th>
            <th style={enrolThNum}>Enrolled</th>
            <th style={enrolTh}>Equity</th>
            <th style={enrolThNum}>Teacher salary</th>
            <th style={enrolThNum}>Ratio</th>
          </tr>
        </thead>
        <tbody>
          {insts.map((i) => (
            <tr key={i.institution} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={enrolTd}>{i.institution}</td>
              <td style={enrolTdNum}>{money(i.totalExpenditure)}</td>
              <td style={enrolTdNum}>{i.enrolled ?? "—"}</td>
              <td style={enrolTd}>{i.equityMechanism === "Y" ? "Yes" : i.equityMechanism === "N" ? "No" : "—"}</td>
              <td style={enrolTdNum}>{money(i.avgTeacherSalary)}</td>
              <td style={enrolTdNum}>{i.comparatorSalary > 0 ? (Math.round((i.avgTeacherSalary / i.comparatorSalary) * 100) / 100) : (i.salaryRatio ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// System section: territory-level GER (4.3.2) + expenditure % GDP (4.5.6).
// Both need an external denominator (population / GDP) from referenceData, so
// values are flagged illustrative. Recomputes OECS aggregates from the scoped
// territory rows. Renders nothing when no territory has reference data.
const SYS_BLUE = "#4f8cf7";
const SYS_INDIGO = "#1675f9";
const SYS_TEAL = "#14b8a6";
function SystemPanel({ territories }) {
  const terrs = territories || [];
  if (!terrs.length) return null;
  const withPop = terrs.filter((t) => t.population != null);
  const withGdp = terrs.filter((t) => t.gdp != null);
  const withOda = terrs.filter((t) => t.odaTotal != null);
  const enrol = withPop.reduce((s, t) => s + (t.enrolment || 0), 0);
  const pop = withPop.reduce((s, t) => s + (t.population || 0), 0);
  const exp = withGdp.reduce((s, t) => s + (t.expenditure || 0), 0);
  const gdp = withGdp.reduce((s, t) => s + (t.gdp || 0), 0);
  const odaEdu = withOda.reduce((s, t) => s + (t.odaToEducation || 0), 0);
  const odaTot = withOda.reduce((s, t) => s + (t.odaTotal || 0), 0);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const ger = pct(enrol, pop);
  const pgdp = pct(exp, gdp);
  const odaShare = pct(odaEdu, odaTot);
  const cards = [
    { code: "4.3.2", colour: SYS_BLUE, title: "Tertiary GER", value: ger == null ? "—" : `${ger}%`, detail: pop ? `${enrol.toLocaleString()} / ${pop.toLocaleString()} cohort` : "no population reference" },
    { code: "4.5.6", colour: SYS_INDIGO, title: "Expenditure % of GDP", value: pgdp == null ? "—" : `${pgdp}%`, detail: gdp ? `${exp.toLocaleString()} / ${gdp.toLocaleString()} GDP` : "no GDP reference" },
    { code: "4.5.5", colour: SYS_TEAL, title: "ODA to education share", value: odaShare == null ? "—" : `${odaShare}%`, detail: odaTot ? `${odaEdu.toLocaleString()} / ${odaTot.toLocaleString()} ODA` : "no ODA reference" },
  ];
  return (
    <Card style={{ minWidth: 0, overflowX: "auto" }}>
      <h3 style={cardTitle}>System indicators — SDG 4.3.2 / 4.5.6 / 4.5.5</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.code} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, display: "grid", gap: 4 }}>
            <SdgChip code={c.code} colour={c.colour} />
            <div style={{ fontSize: 26, fontWeight: 700, color: c.colour }}>{c.value}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>{c.detail}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: COLORS.muted, margin: "0 0 12px" }}>
        Population, GDP &amp; ODA receipts are <b>illustrative reference inputs</b> (lib/referenceData.js), not collected by the instrument — replace with official national / OECD-DAC statistics for real reporting.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: COLORS.muted }}>
            <th style={enrolTh}>Territory</th>
            <th style={enrolThNum}>Enrolment</th>
            <th style={enrolThNum}>Cohort</th>
            <th style={enrolThNum}>GER</th>
            <th style={enrolThNum}>Expenditure</th>
            <th style={enrolThNum}>GDP</th>
            <th style={enrolThNum}>% GDP</th>
            <th style={enrolThNum}>ODA share</th>
          </tr>
        </thead>
        <tbody>
          {terrs.map((t) => (
            <tr key={t.territory} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={enrolTd}>{t.territory}</td>
              <td style={enrolTdNum}>{t.enrolment.toLocaleString()}</td>
              <td style={enrolTdNum}>{t.population == null ? "—" : t.population.toLocaleString()}</td>
              <td style={enrolTdNum}>{t.ger == null ? "—" : `${t.ger}%`}</td>
              <td style={enrolTdNum}>{t.expenditure ? t.expenditure.toLocaleString() : "—"}</td>
              <td style={enrolTdNum}>{t.gdp == null ? "—" : t.gdp.toLocaleString()}</td>
              <td style={enrolTdNum}>{t.pctGdp == null ? "—" : `${t.pctGdp}%`}</td>
              <td style={enrolTdNum}>{t.odaShare == null ? "—" : `${t.odaShare}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// =====================================================================
// ENROLMENT DASHBOARD  --  instrument T2 (no PII; aggregate counts).
// Reads /api/sdg-enrolment and renders the SDG 4.3.3 / 4.5.1 / 4.b.1
// indicators + per-division / per-programme breakdowns. Scope follows the
// View-as toggle: institution -> one institution, ministry -> one
// territory, admin -> OECS-wide.
// =====================================================================
function EnrolmentDashboard({ view, demoCountry, setDemoCountry, countries }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [recTab, setRecTab] = useState("stats");
  const [seeding, setSeeding] = useState(false);
  const [adminCountry, setAdminCountry] = useState("__all__");
  const [adminSchool, setAdminSchool] = useState("__all__");
  const [schools, setSchools] = useState([]);

  useEffect(() => {
    if (view !== "admin") return;
    const country = adminCountry === "__all__" ? "" : adminCountry;
    fetch(`/api/schools-config${country ? `?country=${encodeURIComponent(country)}` : ""}`)
      .then((r) => r.json())
      .then((d) => setSchools(d.schools || []))
      .catch(() => setSchools([]));
    setAdminSchool("__all__");
  }, [view, adminCountry]);

  const scopeQuery = buildDbScopeQuery(view, { demoCountry, adminCountry, adminSchool });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sdg-enrolment${scopeQuery}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Failed to load enrolment data");
      else setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [scopeQuery, view]);

  useUiRefresh(load);

  // Populate the DB with synthetic instrument data (Cover/Background/Enrolment).
  const seedDemo = useCallback(async () => {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Failed to generate demo data");
      else await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSeeding(false);
    }
  }, [load]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Card><span style={{ color: COLORS.muted }}>Loading…</span></Card>;
  if (error) return <Card style={{ background: COLORS.errBg, borderColor: COLORS.errBorder }}><span style={{ color: COLORS.errText }}>{error}</span></Card>;
  if (!data || (data.count === 0 && !(data.rejected || []).length)) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        {(view === "ministry" || view === "admin") && (
          <Card>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {view === "ministry" && (
                <Field label="Country (from database)">
                  <select value={demoCountry} onChange={(e) => setDemoCountry(e.target.value)} style={{ ...inputStyle, minWidth: 260 }}>
                    {countries.map((c) => (
                      <option key={c.iso} value={c.iso}>{c.name} ({c.iso})</option>
                    ))}
                  </select>
                </Field>
              )}
              {view === "admin" && (
                <>
                  <Field label="Country">
                    <select value={adminCountry} onChange={(e) => setAdminCountry(e.target.value)} style={{ ...inputStyle, minWidth: 220 }}>
                      <option value="__all__">All countries</option>
                      {countries.map((c) => (
                        <option key={c.iso} value={c.iso}>{c.name} ({c.iso})</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Institution">
                    <select value={adminSchool} onChange={(e) => setAdminSchool(e.target.value)} style={{ ...inputStyle, minWidth: 280 }}>
                      <option value="__all__">All institutions</option>
                      {schools.map((s) => (
                        <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              <button onClick={load} style={ghostButton}>Refresh</button>
            </div>
          </Card>
        )}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>
              {view !== "institution"
                ? view === "ministry"
                  ? "No enrolment in the database for this country yet. An institution must Validate and Submit for Approval first — pending L2 submissions appear here before OECS admin can see them."
                  : "No ministry-approved enrolment for this scope. Approve the campus submission at Ministry → Approvals, then refresh."
                : "No enrolment data yet. Upload an OECS instrument workbook, Validate, then Submit for Approval — the Enrolment tab only shows data after it is saved to the database."}
            </p>
            {view === "institution" && (
              <button onClick={seedDemo} disabled={seeding} style={ghostButton}>
                {seeding ? "Generating…" : "Generate demo data"}
              </button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Scope rows: ministry groups by territory, others by institution.
  const groups = view === "ministry" ? (data.byTerritory || []) : (data.byInstitution || []);
  const showAll = view === "admin";
  const selKey = sel ?? (showAll ? "__all__" : groups[0]?.key ?? "__all__");
  const agg = selKey === "__all__" ? data : (groups.find((g) => g.key === selKey) || data);

  const t = agg.totals || data.totals;
  const indicators = agg.indicators || data.indicators;
  const divisions = (agg.distributions || data.distributions).byDivision || [];
  const programmes = (agg.distributions || data.distributions).byProgramme || [];
  const maxDiv = Math.max(1, ...divisions.map((d) => d.total));

  // Raw programme rows + rejected, scoped to the selected group (for Records).
  const keyOfRow = (r) => (view === "ministry" ? (r.territory || "Unspecified") : (r.institution || "Unspecified"));
  const instTerr = {};
  for (const r of data.rows || []) instTerr[r.institution] = r.territory;
  const inScope = (key) => selKey === "__all__" || key === selKey;
  const scopeRows = (data.rows || []).filter((r) => inScope(keyOfRow(r)));
  const scopeRejected = (data.rejected || []).filter((rj) =>
    inScope(view === "ministry" ? (instTerr[rj.institution] || "Unspecified") : rj.institution)
  );
  const scopeLabel = selKey === "__all__" ? "OECS-wide" : selKey;
  const scopeYear = scopeRows[0]?.academicYear || scopeRejected[0]?.academicYear || "";

  // Background (4.a.1/4.a.3) + Finance (4.5.3/4.5.4/4.c.5), scoped like the rest.
  const scopeFacts = (list) => selKey === "__all__" ? list
    : view === "ministry" ? list.filter((i) => i.territory === selKey)
    : list.filter((i) => i.institution === selKey);
  const bgScoped = scopeFacts(data.background?.institutions || []);
  const finScoped = scopeFacts(data.finance?.institutions || []);

  // System indicators (4.3.2 GER / 4.5.6 %GDP) are territory-level. Resolve the
  // scope to a territory: ministry view picks it directly, institution view via
  // its territory, OECS-wide shows every territory.
  const scopeTerritory = selKey === "__all__" ? null
    : view === "ministry" ? selKey
    : (instTerr[selKey] || null);
  const sysAll = data.system?.territories || [];
  const sysScoped = scopeTerritory ? sysAll.filter((t) => t.territory === scopeTerritory) : sysAll;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>Enrolment (T2)</h2>
          <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 14 }}>
            Programmes, gender parity, TVET share, and ODA scholarships.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {view === "ministry" && countries.length > 0 && (
            <select value={demoCountry} onChange={(e) => setDemoCountry(e.target.value)} style={inputStyle}>
              {countries.map((c) => (
                <option key={c.iso} value={c.iso}>{c.name} ({c.iso})</option>
              ))}
            </select>
          )}
          {view === "admin" && (
            <>
              <select value={adminCountry} onChange={(e) => setAdminCountry(e.target.value)} style={inputStyle}>
                <option value="__all__">All countries</option>
                {countries.map((c) => (
                  <option key={c.iso} value={c.iso}>{c.name}</option>
                ))}
              </select>
              <select value={adminSchool} onChange={(e) => setAdminSchool(e.target.value)} style={inputStyle}>
                <option value="__all__">All institutions</option>
                {schools.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </>
          )}
          {groups.length > 0 && (
            <select value={selKey} onChange={(e) => setSel(e.target.value)} style={inputStyle}>
              {showAll && <option value="__all__">OECS-wide ({data.count})</option>}
              {groups.map((g) => (
                <option key={g.key} value={g.key}>{g.key} ({g.count})</option>
              ))}
            </select>
          )}
          <button onClick={load} style={ghostButton}>Refresh</button>
        </div>
      </div>

      {/* Stats / Records tabs */}
      <nav style={{ display: "flex", gap: 4, borderBottom: `1px solid ${COLORS.border}` }}>
        <TabButton active={recTab === "stats"} onClick={() => setRecTab("stats")}>Stats</TabButton>
        <TabButton active={recTab === "records"} onClick={() => setRecTab("records")}>
          Records{scopeRejected.length ? ` · ${scopeRejected.length} rejected` : ""}
        </TabButton>
      </nav>

      {recTab === "records" ? (
        <EnrolmentRecordsTable rows={scopeRows} rejected={scopeRejected} scopeLabel={scopeLabel} academicYear={scopeYear} />
      ) : (
      <>
      {/* Headline totals */}
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 24 }}>
          <Stat label="Programmes" value={agg.count} />
          <Stat label="Total enrolled" value={t.total} />
          <Stat label="Male" value={t.male} />
          <Stat label="Female" value={t.female} />
          <Stat label="TVET enrolled" value={t.tvet} />
          <Stat label="ODA scholarships" value={t.oda} />
        </div>
      </Card>

      {/* SDG indicator cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {indicators.map((ind) => (
          <Card key={ind.code}>
            <div style={{ display: "grid", gap: 8 }}>
              <SdgChip code={ind.code} colour={ind.colour} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>{ind.title}</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: ind.colour }}>
                {ind.value == null ? "—" : ind.value}
                <span style={{ fontSize: 15, fontWeight: 500, color: COLORS.muted, marginLeft: 4 }}>
                  {ind.value == null ? "" : ind.unit === "%" ? "%" : ind.unit === "ratio" ? "" : ""}
                </span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.muted }}>{ind.detail}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Background: safety + facilities (SDG 4.a.1 / 4.a.3) */}
      <BackgroundPanel institutions={bgScoped} />

      {/* Finance: equity + expenditure + salary (SDG 4.5.3 / 4.5.4 / 4.c.5) */}
      <FinancePanel institutions={finScoped} />

      {/* System: GER + expenditure % GDP (SDG 4.3.2 / 4.5.6), territory-level */}
      <SystemPanel territories={sysScoped} />

      {/* By division */}
      <Card>
        <h3 style={cardTitle}>Enrolment by division</h3>
        <div style={{ display: "grid", gap: 14 }}>
          {divisions.map((d) => (
            <div key={d.key} style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{d.key}</span>
                <span style={{ color: COLORS.muted }}>{d.total} ({d.male} M / {d.female} F){d.tvet > 0 ? ` · ${d.tvet} TVET` : ""}</span>
              </div>
              <Bar value={d.total} max={maxDiv} color={COLORS.accent} />
            </div>
          ))}
        </div>
      </Card>

      {/* By programme */}
      <Card style={{ minWidth: 0, overflowX: "auto" }}>
        <h3 style={cardTitle}>Programmes ({programmes.length})</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: COLORS.muted }}>
              <th style={enrolTh}>Programme</th>
              <th style={enrolThNum}>M</th>
              <th style={enrolThNum}>F</th>
              <th style={enrolThNum}>Total</th>
              <th style={enrolThNum}>TVET</th>
              <th style={enrolThNum}>ODA</th>
            </tr>
          </thead>
          <tbody>
            {programmes.map((p) => (
              <tr key={p.key} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={enrolTd}>{p.key}</td>
                <td style={enrolTdNum}>{p.male}</td>
                <td style={enrolTdNum}>{p.female}</td>
                <td style={{ ...enrolTdNum, fontWeight: 600 }}>{p.total}</td>
                <td style={enrolTdNum}>{p.tvet > 0 ? p.tvet : "—"}</td>
                <td style={enrolTdNum}>{p.oda > 0 ? p.oda : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      </>
      )}
    </div>
  );
}

// =====================================================================
// Raw programme rows (instrument T2 extraction) + rejected view.
// Collapsed: Programme | Division | Cert | Accredited | TVET | M | F | Total | ODA
// Expanded: year-of-study, attendance (FT/PT), nationality breakdowns.
// Header carries the Cover institution + Background academic year.
// =====================================================================
function EnrolmentRecordsTable({ rows, rejected, scopeLabel, academicYear }) {
  const [openIdx, setOpenIdx] = useState(null);
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const maleOf = (r) => num(r.totalFtM) + num(r.totalPtM);
  const femaleOf = (r) => num(r.totalFtF) + num(r.totalPtF);

  return (
    <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
      <div>
        <h3 style={{ ...cardTitle, margin: 0 }}>
          {scopeLabel}{academicYear ? ` — Academic Year ${academicYear}` : ""}
        </h3>
        <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 13 }}>
          {rows.length} programme{rows.length === 1 ? "" : "s"} extracted from the Enrolment sheet.
        </p>
      </div>

      <Card style={{ minWidth: 0, overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p style={{ color: COLORS.muted, margin: 0, fontSize: 14 }}>No accepted programme rows in this scope.</p>
        ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: COLORS.muted }}>
              <th style={{ ...enrolTh, width: 24 }} aria-label="Expand" />
              <th style={enrolTh}>Programme</th>
              <th style={enrolTh}>Division</th>
              <th style={enrolTh}>Certification</th>
              <th style={enrolTh}>Accredited</th>
              <th style={enrolThNum}>TVET</th>
              <th style={enrolThNum}>M</th>
              <th style={enrolThNum}>F</th>
              <th style={enrolThNum}>Total</th>
              <th style={enrolThNum}>ODA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const open = openIdx === i;
              const m = maleOf(r), f = femaleOf(r);
              return (
                <Fragment key={i}>
                  <tr
                    onClick={() => setOpenIdx(open ? null : i)}
                    style={{ borderTop: `1px solid ${COLORS.border}`, cursor: "pointer" }}
                  >
                    <td style={{ ...enrolTd, color: COLORS.muted }}>
                      <span style={{ display: "inline-block", transition: "transform 0.25s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                    </td>
                    <td style={{ ...enrolTd, fontWeight: 500 }}>{r.programme}</td>
                    <td style={enrolTd}>{r.division || "—"}</td>
                    <td style={enrolTd}>{r.certification || "—"}</td>
                    <td style={enrolTd}>{r.accredited || "—"}</td>
                    <td style={enrolTdNum}>{String(r.isTvet).toUpperCase() === "Y" ? "Y" : "—"}</td>
                    <td style={enrolTdNum}>{m}</td>
                    <td style={enrolTdNum}>{f}</td>
                    <td style={{ ...enrolTdNum, fontWeight: 600 }}>{m + f}</td>
                    <td style={enrolTdNum}>{num(r.odaScholarship) > 0 ? num(r.odaScholarship) : "—"}</td>
                  </tr>
                  <tr style={{ background: open ? COLORS.codeBg : "transparent", transition: "background 0.25s ease" }}>
                    <td style={{ padding: 0 }} />
                    <td colSpan={9} style={{ padding: 0 }}>
                      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s ease" }}>
                        <div style={{ overflow: "hidden" }}>
                          <div style={{ padding: "12px 8px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                            <BreakdownBlock title="Year of study" items={[
                              ["Year 1", r.y1m, r.y1f], ["Year 2", r.y2m, r.y2f],
                              ["Year 3", r.y3m, r.y3f], ["Year 4", r.y4m, r.y4f],
                            ]} />
                            <BreakdownBlock title="Attendance" items={[
                              ["Full-time", r.totalFtM, r.totalFtF], ["Part-time", r.totalPtM, r.totalPtF],
                            ]} />
                            <BreakdownBlock title="Nationality" items={[
                              ["OECS", r.oecsNatM, r.oecsNatF],
                              ["Other CARICOM", r.otherCaricomM, r.otherCaricomF],
                              ["Other", r.otherNatM, r.otherNatF],
                            ]} />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
        )}
      </Card>

      {rejected.length > 0 && <EnrolmentRejected rejected={rejected} />}
    </div>
  );
}

// One labelled M/F/Total breakdown column inside an expanded programme row.
function BreakdownBlock({ title, items }) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {items.map(([label, m, f]) => (
            <tr key={label}>
              <td style={{ padding: "3px 8px 3px 0", color: COLORS.muted }}>{label}</td>
              <td style={{ ...enrolTdNum, padding: "3px 8px" }}>{num(m)} M</td>
              <td style={{ ...enrolTdNum, padding: "3px 8px" }}>{num(f)} F</td>
              <td style={{ ...enrolTdNum, padding: "3px 0", fontWeight: 600 }}>{num(m) + num(f)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Programme rows that failed validation (lib/validateEnrolment.js).
function EnrolmentRejected({ rejected }) {
  return (
    <Card style={{ minWidth: 0, overflowX: "auto", background: COLORS.errBg, borderColor: COLORS.errBorder }}>
      <h3 style={{ ...cardTitle, color: COLORS.errText }}>Rejected rows ({rejected.length})</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: COLORS.muted }}>
            <th style={enrolTh}>Programme</th>
            <th style={enrolTh}>Institution</th>
            <th style={enrolTh}>Errors</th>
          </tr>
        </thead>
        <tbody>
          {rejected.map((rj, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${COLORS.errBorder}` }}>
              <td style={{ ...enrolTd, fontWeight: 500 }}>{rj.data?.programme || "—"}</td>
              <td style={enrolTd}>{rj.institution || "—"}</td>
              <td style={enrolTd}>
                {(rj.errors || []).map((e, j) => (
                  <div key={j} style={{ color: COLORS.errText }}>
                    <b>{e.field}</b>: {e.message}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const enrolTh = { padding: "6px 8px", fontWeight: 600 };
const enrolThNum = { ...enrolTh, textAlign: "right" };
const enrolTd = { padding: "6px 8px" };
const enrolTdNum = { ...enrolTd, textAlign: "right", fontVariantNumeric: "tabular-nums" };

// ---- Dashboard section header ------------------------------------------
function ChartHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.muted }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Bar({ value, max, color }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 10, background: COLORS.cardAlt, borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width .4s ease" }} />
    </div>
  );
}

// Grouped horizontal bars: records vs mapped per record type.
function CompareBars({ entities }) {
  const max = Math.max(1, ...entities.map((e) => e.records || 0));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Legend items={[{ color: SERIES[0], label: "Records" }, { color: SERIES[1], label: "Mapped" }]} />
      {entities.map((e) => (
        <div key={e.entity} style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>{cap(e.entity)}</span>
            <span style={{ color: COLORS.muted }}>{fmt(e.mapped || 0)} / {fmt(e.records || 0)}</span>
          </div>
          <Bar value={e.records || 0} max={max} color={SERIES[0]} />
          <Bar value={e.mapped || 0} max={max} color={SERIES[1]} />
        </div>
      ))}
    </div>
  );
}

// Donut showing overall mapping coverage as a single arc.
function CoverageDonut({ percent }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r={r} fill="none" stroke={COLORS.cardAlt} strokeWidth="14" />
        <circle
          cx="75"
          cy="75"
          r={r}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform="rotate(-90 75 75)"
          style={{ transition: "stroke-dashoffset .5s ease" }}
        />
        <text x="75" y="71" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--text)">{percent}%</text>
        <text x="75" y="92" textAnchor="middle" fontSize="12" fill={COLORS.muted}>covered</text>
      </svg>
      <div style={{ fontSize: 13, color: COLORS.muted, textAlign: "center" }}>
        Records with a RULI mapping.
      </div>
    </div>
  );
}

// 100%-normalized stacked bar: each record type's share of all records.
function NormBar({ entities }) {
  const total = Math.max(1, entities.reduce((n, e) => n + (e.records || 0), 0));
  const segs = entities.map((e, i) => ({
    label: cap(e.entity),
    value: e.records || 0,
    pct: Math.round(((e.records || 0) / total) * 100),
    color: SERIES[i % SERIES.length],
  }));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", background: COLORS.cardAlt }}>
        {segs.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.pct}%`}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color, transition: "width .4s ease" }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {segs.map((s) => (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
            <span style={{ fontWeight: 500 }}>{s.label}</span>
            <span style={{ color: COLORS.muted }}>{s.pct}% · {fmt(s.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Convert snake_case column names to Title Case for display.
// Keeps known abbreviations uppercase (RULI, CPD, SDG).
const ABBREVS = new Set(["ruli", "cpd", "sdg"]);
const fmtHeader = (col) =>
  col.split("_").map((w) => ABBREVS.has(w.toLowerCase()) ? w.toUpperCase() : cap(w)).join(" ");

const inputStyle = {
  padding: "10px 12px",
  fontSize: 14,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  background: COLORS.codeBg,
  color: "var(--text)",
  maxWidth: 300,
};

const cardTitle = { fontSize: 17, fontWeight: 600, margin: "0 0 12px" };

const preStyle = {
  background: COLORS.codeBg,
  padding: 14,
  borderRadius: 8,
  overflow: "auto",
  fontSize: 15,
  margin: 0,
};

const codeBlockStyle = {
  display: "block",
  background: COLORS.codeBg,
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 13,
  marginTop: 4,
};

const ghostButton = {
  background: COLORS.codeBg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: "8px 15px",
  fontSize: 14,
  cursor: "pointer",
  color: "var(--text)",
  textDecoration: "none",
  display: "inline-block",
  whiteSpace: "nowrap",
  boxShadow: "1px 2px 4px rgba(0,0,0,0.18),0 4px 12px rgba(0,0,0,0.1)",
};

const dangerButton = {
  background: COLORS.codeBg,
  border: `1px solid ${COLORS.errBorder}`,
  borderRadius: 8,
  padding: "8px 15px",
  fontSize: 14,
  color: COLORS.errText,
  fontWeight: 500,
  whiteSpace: "nowrap",
  boxShadow: "1px 2px 4px rgba(0,0,0,0.18),0 4px 12px rgba(0,0,0,0.1)",
};

const thStyle = { padding: "10px 16px 10px 0", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" };
const tdStyle = { padding: "11px 16px 11px 0", fontSize: 14 };
const thStyleNum = { ...thStyle, textAlign: "right" };
const tdStyleNum = { ...tdStyle, textAlign: "right" };
