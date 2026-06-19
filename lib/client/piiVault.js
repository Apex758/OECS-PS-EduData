const VAULT_KEY = "oecs_pii_vault";

function readVault() {
  if (typeof sessionStorage === "undefined") return { mappings: {} };
  try {
    const raw = sessionStorage.getItem(VAULT_KEY);
    if (!raw) return { mappings: {} };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { mappings: {} };
  } catch {
    return { mappings: {} };
  }
}

function writeVault(vault) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

// Persist accepted pipeline mappings (PII stays in this tab only).
export function saveMappings(accepted) {
  const vault = readVault();
  for (const item of accepted || []) {
    const { mapping } = item;
    if (!mapping?.RULI) continue;
    vault.mappings[mapping.RULI] = mapping;
  }
  writeVault(vault);
}

export function getMappingByRuli() {
  return readVault().mappings || {};
}

export function getMapping(ruli) {
  return readVault().mappings?.[ruli] ?? null;
}

export function clearVault() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(VAULT_KEY);
}

export function vaultSize() {
  return Object.keys(getMappingByRuli()).length;
}
