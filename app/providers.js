"use client";

// Wraps the app so client components can read the session via useSession().
import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import {
  clearChunkReloadGuard,
  isChunkLoadError,
  isExtensionScriptError,
  recoverFromChunkError,
} from "@/lib/client/chunkRecovery";

function useChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event) => {
      if (isExtensionScriptError(event)) {
        event.preventDefault?.();
        return;
      }
      const msg = event.message || event.error?.message;
      if (isChunkLoadError(msg)) {
        event.preventDefault?.();
        recoverFromChunkError();
      }
    };
    const onRejection = (event) => {
      const msg = event.reason?.message ?? String(event.reason ?? "");
      if (isChunkLoadError(msg)) {
        event.preventDefault?.();
        recoverFromChunkError();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    clearChunkReloadGuard();

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}

export default function Providers({ children }) {
  useChunkLoadRecovery();
  return <SessionProvider>{children}</SessionProvider>;
}
