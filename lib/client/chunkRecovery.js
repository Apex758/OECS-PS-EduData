export const CHUNK_RELOAD_KEY = "__next_chunk_reload__";

export function isExtensionScriptError(event) {
  const src = String(event?.filename ?? event?.error?.stack ?? "");
  if (src.includes("chrome-extension://") || src.includes("moz-extension://")) return true;
  if (/localhost:\d+\/[0-9a-f-]{8}-[0-9a-f-]{4}-/.test(src)) return true;
  if (typeof window !== "undefined" && event?.filename) {
    try {
      const u = new URL(event.filename, window.location.href);
      if (u.origin === window.location.origin && /^\/[0-9a-f-]{36}(\?|$)/i.test(u.pathname)) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function isChunkLoadError(message) {
  if (!message) return false;
  const s = String(message);
  return (
    s.includes("reading 'call'") ||
    s.includes("Loading chunk") ||
    s.includes("ChunkLoadError") ||
    s.includes("Failed to fetch dynamically imported module")
  );
}

export function recoverFromChunkError() {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch {
    // sessionStorage unavailable — still attempt one reload
  }
  window.location.reload();
  return true;
}

export function clearChunkReloadGuard() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

// Runs before React/webpack chunks load so initial module failures can recover.
export const CHUNK_RECOVERY_INLINE_SCRIPT = `
(function(){
  var k="${CHUNK_RELOAD_KEY}";
  function ext(e){
    var s=String((e&&e.filename)||(e&&e.error&&e.error.stack)||"");
    if(s.indexOf("chrome-extension://")>=0||s.indexOf("moz-extension://")>=0)return true;
    if(/localhost:\\d+\\/[0-9a-f-]{8}-[0-9a-f-]{4}-/.test(s))return true;
    try{
      if(e&&e.filename){
        var u=new URL(e.filename,location.href);
        if(u.origin===location.origin&&/^\\/[0-9a-f-]{36}(\\?|$)/i.test(u.pathname))return true;
      }
    }catch(x){}
    return false;
  }
  function bad(m){
    if(!m)return false;
    m=String(m);
    return m.indexOf("reading 'call'")>=0
      ||m.indexOf("Loading chunk")>=0
      ||m.indexOf("ChunkLoadError")>=0
      ||m.indexOf("Failed to fetch dynamically imported module")>=0;
  }
  function go(){
    try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");}catch(e){}
    location.reload();
  }
  window.addEventListener("error",function(e){
    if(ext(e)){e.preventDefault();return;}
    if(bad(e&&e.message))go();
  });
  window.addEventListener("unhandledrejection",function(e){
    var r=e&&e.reason;
    if(bad(r&&r.message||String(r||"")))go();
  });
})();
`;
