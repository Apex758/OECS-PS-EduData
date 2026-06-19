import Providers from "./providers";
import { CHUNK_RECOVERY_INLINE_SCRIPT } from "@/lib/client/chunkRecovery";

export const metadata = {
  title: "OECS Post-Secondary EduData",
  description: "Upload and anonymize post-secondary teaching-staff data; track SDG 4.c indicators",
};

// Theme palettes. Dark is the default (:root); light applies when
// <html data-theme="light">. Every COLORS.* token in the app reads one of
// these vars, so a single attribute flip re-themes the whole UI.
const THEME_CSS = `
:root {
  --bg: #0f1012;
  --card: #181c21;
  --card-alt: #141f2e;
  --code-bg: #1c2430;
  --text: #c8d5e8;
  --muted: #7a8390;
  --border: #252a32;
  --accent: #1675f9;
  --accent-soft: #00112a;
  --field-bg: #161a20;
  --drop-bg: #0c0e12;
  --drop-bg-active: #1a2a40;
  --disabled: #2c3440;
  --err-bg: #1a0e0e;
  --err-text: #f87171;
  --err-border: #3a1818;
  --good: #4ade80;
  --bad: #f87171;
  --shadow: 1px 2px 4px rgba(0,0,0,0.5),2px 8px 24px rgba(0,0,0,0.35),4px 16px 48px rgba(0,0,0,0.22);
  color-scheme: dark;
}
:root[data-theme="light"] {
  --bg: #e8edf5;
  --text: #10161e;
  --border: #bccadd;
  --muted: #58667a;
  --accent: #2d405a;
  --accent-soft: #dae2ee;
  --card: #ffffff;
  --card-alt: #e0e9f5;
  --err-bg: #fef2f2;
  --err-text: #b91c1c;
  --err-border: #fecaca;
  --code-bg: #d4deed;
  --good: #2d5a3d;
  --bad: #c0384c;
  --field-bg: #f8fbfe;
  --drop-bg: #f8fbfe;
  --drop-bg-active: #d4dfee;
  --disabled: #b0bac8;
  --shadow: 1px 2px 4px rgba(20,60,120,0.08),2px 8px 16px rgba(20,60,120,0.05),4px 16px 32px rgba(20,60,120,0.03);
  color-scheme: light;
}
body { transition: background .2s ease, color .2s ease; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .8s linear infinite; }
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_INLINE_SCRIPT }} />
      </head>
      <body
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          fontSize: 15,
          background: "var(--bg)",
          color: "var(--text)",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
