export const CHUNK_RELOAD_KEY = "__next_chunk_reload__";

function errorText(source) {
  if (!source) return "";
  if (typeof source === "string") return source;
  const chunks = [];
  if (source.filename) chunks.push(source.filename);
  if (source.message) chunks.push(source.message);
  if (source.stack) chunks.push(source.stack);
  if (source.error) chunks.push(errorText(source.error));
  if (source.reason) chunks.push(errorText(source.reason));
  return chunks.join("\n");
}

function looksLikeExtensionScript(text) {
  if (!text) return false;
  if (text.includes("chrome-extension://") || text.includes("moz-extension://")) return true;
  if (/localhost:\d+\/[0-9a-f-]{8}-[0-9a-f-]{4}-/i.test(text)) return true;
  if (typeof window !== "undefined" && text.includes(window.location.origin)) {
    if (/\/[0-9a-f-]{36}(\?|$)/i.test(text)) return true;
  }
  // Injected extension bundles on localhost often throw on missing chrome.* APIs.
  if (/addListener/i.test(text) && /\/[0-9a-f-]{8}-[0-9a-f-]{4}-/i.test(text)) return true;
  return false;
}

export function isExtensionScriptError(event) {
  return looksLikeExtensionScript(errorText(event));
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
  function text(e){
    if(!e)return"";
    if(typeof e==="string")return e;
    var p=[];
    if(e.filename)p.push(e.filename);
    if(e.message)p.push(e.message);
    if(e.stack)p.push(e.stack);
    if(e.error)p.push(e.error.stack||e.error.message||"");
    if(e.reason)p.push((e.reason&&e.reason.stack)||(e.reason&&e.reason.message)||String(e.reason||""));
    return p.join("\\n");
  }
  function ext(e){
    var s=text(e);
    if(s.indexOf("chrome-extension://")>=0||s.indexOf("moz-extension://")>=0)return true;
    if(/localhost:\\d+\\/[0-9a-f-]{8}-[0-9a-f-]{4}-/i.test(s))return true;
    if(location.origin&&s.indexOf(location.origin)>=0&&/\\/[0-9a-f-]{36}(\\?|$)/i.test(s))return true;
    if(/addListener/i.test(s)&&/\\/[0-9a-f-]{8}-[0-9a-f-]{4}-/i.test(s))return true;
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
    if(ext(e)){e.preventDefault();return;}
    var r=e&&e.reason;
    if(bad(r&&r.message||String(r||"")))go();
  });
})();
`;
