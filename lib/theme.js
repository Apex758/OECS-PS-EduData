"use client";

// Shared theme palettes + applier, so routes OTHER than the home page
// (/validation, /admin, …) render in the same light/dark scheme. The home page
// owns its own copy; these values mirror its "Ivory" (light) and "Night" (dark)
// palettes. Applying sets the CSS custom properties on <html> exactly like the
// home page does, and persists the choice under the same "theme" key.

import { useEffect, useState } from "react";

export const PALETTE_VARS = {
  light: {
    "--bg": "#f5f0e8", "--text": "#1e1610", "--border": "#ddd0bc", "--muted": "#7a6a58",
    "--accent": "#2d5a3d", "--accent-soft": "#daeee0", "--card": "#ffffff", "--card-alt": "#f5ede0",
    "--err-bg": "#fef2f2", "--err-text": "#b91c1c", "--err-border": "#fecaca", "--code-bg": "#ede5d4",
    "--good": "#2d5a3d", "--bad": "#c0384c", "--field-bg": "#fefcf8", "--disabled": "#c8c0b0",
  },
  dark: {
    "--bg": "#0f1012", "--text": "#e8dfc8", "--border": "#252a32", "--muted": "#7a8090",
    "--accent": "#f97316", "--accent-soft": "#2a1500", "--card": "#181c21", "--card-alt": "#14202e",
    "--err-bg": "#1a0e0e", "--err-text": "#f87171", "--err-border": "#3a1818", "--code-bg": "#1c2230",
    "--good": "#4ade80", "--bad": "#f87171", "--field-bg": "#161a20", "--disabled": "#2c3240",
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
