import { NextResponse } from "next/server";

// Lightweight verify step for a pasted Google Sheets link, called the moment
// a link is added (before "Process files"). Confirms the sheet is publicly
// readable and returns its title, so the queue entry can flip from a spinner
// to a check + the real sheet name. No credentials — public path only.
export const runtime = "nodejs";

function parseId(url) {
  const u = String(url || "").trim();
  return u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    || (/^[a-zA-Z0-9-_]{20,}$/.test(u) ? u : null);
}

// Is the sheet readable via the public CSV export? (Shared "Anyone with link".)
async function isReadable(id, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
    + (gid ? `&gid=${gid}` : "");
  try {
    const res = await fetch(url, { redirect: "follow" });
    const ctype = res.headers.get("content-type") || "";
    return res.ok && ctype.includes("text/csv");
  } catch {
    return false;
  }
}

// Best-effort title from the sheet's HTML <title> ("Name - Google Sheets").
async function fetchTitle(id) {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/edit`, { redirect: "follow" });
    if (!res.ok) return null;
    const html = await res.text();
    const raw = html.match(/<title>([^<]*)<\/title>/i)?.[1];
    if (!raw) return null;
    const name = raw.replace(/\s*-\s*Google Sheets\s*$/i, "").trim();
    if (!name || /^(sign in|google sheets)$/i.test(name)) return null;
    return name;
  } catch {
    return null;
  }
}

export async function POST(req) {
  const { url } = await req.json().catch(() => ({}));
  const id = parseId(url);
  if (!id) {
    return NextResponse.json({ ok: false, error: "no spreadsheet id in that link" }, { status: 400 });
  }
  const gid = String(url || "").match(/[#&?]gid=([0-9]+)/)?.[1] || null;

  const readable = await isReadable(id, gid);
  if (!readable) {
    return NextResponse.json({
      ok: false,
      error: 'Sheet isn\'t shared. Share → “Anyone with the link” → Viewer, then re-add.',
    }, { status: 400 });
  }

  const title = (await fetchTitle(id)) || "Google Sheet";
  return NextResponse.json({ ok: true, id, title });
}
