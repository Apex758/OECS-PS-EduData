"use client";

import { useState } from "react";

// Truncated ID with a click-to-copy button.
// Shows first `chars` characters + "…", copies the FULL value to clipboard.
// Empty / missing values render a plain "—" with no button.
export default function CopyableId({
  value,
  chars = 8,
  fontSize = 13,
  color = "var(--muted)",
  accentColor = "var(--accent)",
}) {
  const [copied, setCopied] = useState(false);

  const str = value == null ? "" : String(value);
  if (str === "") {
    return <span style={{ fontFamily: "monospace", fontSize, color }}>—</span>;
  }

  const truncated = str.length > chars ? str.slice(0, chars) + "…" : str;

  async function copy(e) {
    e.stopPropagation(); // don't trigger row-expand / parent click handlers
    try {
      await navigator.clipboard.writeText(str);
    } catch {
      // Fallback for non-secure contexts where navigator.clipboard is unavailable
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "monospace",
        fontSize,
        color,
        whiteSpace: "nowrap",
      }}
    >
      <span title={str}>{truncated}</span>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Copied!" : "Copy full ID"}
        aria-label={copied ? "Copied" : "Copy full ID"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          margin: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: copied ? accentColor : color,
          lineHeight: 0,
          borderRadius: 4,
        }}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
      </button>
    </span>
  );
}

function ClipboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
