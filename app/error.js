"use client";

import { useEffect } from "react";
import { isChunkLoadError, isExtensionScriptError, recoverFromChunkError } from "@/lib/client/chunkRecovery";

export default function Error({ error, reset }) {
  const fromExtension = isExtensionScriptError(error);

  useEffect(() => {
    if (isChunkLoadError(error?.message)) {
      recoverFromChunkError();
    }
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "var(--bg, #0f1012)",
        color: "var(--text, #c8d5e8)",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>
          {fromExtension ? "Browser extension conflict" : "Something went wrong"}
        </h2>
        <p style={{ margin: "0 0 20px", color: "var(--muted, #7a8090)", fontSize: 14, lineHeight: 1.5 }}>
          {fromExtension
            ? "A browser extension injected script into this page and crashed (common on localhost). Try a private window, disable extensions for localhost, or use http://localhost:3000 after a single dev server is running."
            : isChunkLoadError(error?.message)
              ? "Reloading to fetch the latest app bundle…"
              : "An unexpected error occurred. Try again or refresh the page."}
        </p>
        {!isChunkLoadError(error?.message) && (
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "var(--accent, #1675f9)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
