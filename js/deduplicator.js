export function createFindingKey(finding) {
  return [finding.source, finding.asset, finding.title, finding.cve]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|");
}

export async function createFindingId(finding) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto no está disponible. Abre el portal en localhost o en un navegador compatible para generar identificadores SHA-256.");
  }
  const data = new TextEncoder().encode(createFindingKey(finding));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function addFindingIds(findings, onProgress = () => {}) {
  const result = [];
  for (let index = 0; index < findings.length; index += 1) {
    result.push({ ...findings[index], id: await createFindingId(findings[index]) });
    onProgress(index + 1, findings.length);
  }
  return result;
}
