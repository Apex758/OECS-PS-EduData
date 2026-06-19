"use client";

// Shared theme palettes + applier, so routes OTHER than the home page
// (/validation, /admin, …) render in the same light/dark scheme. The home page
// owns its own copy; these values mirror its "Frost" (light) and "Night" (dark)
// palettes. Applying sets the CSS custom properties on <html> exactly like the
// home page does, and persists the choice under the same "theme" key.

import { useEffect, useState } from "react";

export const PALETTE_VARS = {
  light: {
    "--bg": "#e8edf5", "--text": "#10161e", "--border": "#bccadd", "--muted": "#58667a",
    "--accent": "#2d405a", "--accent-soft": "#dae2ee", "--card": "#ffffff", "--card-alt": "#e0e9f5",
    "--err-bg": "#fef2f2", "--err-text": "#b91c1c", "--err-border": "#fecaca", "--code-bg": "#d4deed",
    "--good": "#2d5a3d", "--bad": "#c0384c", "--field-bg": "#f8fbfe", "--disabled": "#b0bac8",
    "--drop-bg": "#f8fbfe", "--drop-bg-active": "#d4dfee",
  },
  dark: {
    "--bg": "#0f1012", "--text": "#c8d5e8", "--border": "#252a32", "--muted": "#7a8390",
    "--accent": "#1675f9", "--accent-soft": "#00112a", "--card": "#181c21", "--card-alt": "#141f2e",
    "--err-bg": "#1a0e0e", "--err-text": "#f87171", "--err-border": "#3a1818", "--code-bg": "#1c2430",
    "--good": "#4ade80", "--bad": "#f87171", "--field-bg": "#161a20", "--disabled": "#2c3440",
    "--drop-bg": "#0c0e12", "--drop-bg-active": "#1a2a40",
  },
};

export function applyTheme(theme) {
  const vars = PALETTE_VARS[theme] || PALETTE_VARS.light;
  Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  document.documentElement.dataset.theme = theme;
}

// Hook: returns [theme, toggle]. Reads the persisted choice on mount, applies it,
// and keeps it in sync.
export function useTheme() {
  const [theme, setTheme] = useState("light");
  useEffect(() => { setTheme(localStorage.getItem("theme") || "light"); }, []);
  useEffect(() => { applyTheme(theme); localStorage.setItem("theme", theme); }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}
