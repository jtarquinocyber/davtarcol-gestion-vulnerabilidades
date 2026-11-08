const ALIASES = {
  severity: ["severity", "risk", "risk level", "threat level", "severity level"],
  asset: ["asset", "application", "application name", "project", "project name", "folder", "repository", "repo", "component", "ip", "dns", "hostname", "host", "url"],
  title: ["issue name", "vulnerability", "vulnerability name", "title", "finding", "finding name", "policy violation", "rule name", "qid", "name"],
  cve: ["cve", "cve id", "cveid", "cve identifier"],
  status: ["status", "issue status", "state", "remediation status", "resolution"],
  category: ["category", "type", "kingdom", "analyzer", "scan type"]
};

function normalizedKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "");
}

function findValue(row, aliases) {
  const keys = new Map(Object.keys(row).map((key) => [normalizedKey(key), key]));
  for (const alias of aliases) {
    const key = keys.get(normalizedKey(alias));
    if (key !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
  }
  return "";
}

function detectSource(headers) {
  const keys = headers.map(normalizedKey);
  const has = (values) => values.some((value) => keys.includes(normalizedKey(value)));
  if (has(["Kingdom", "Issue Name", "Folder", "Analyzer"])) return "FORTIFY";
  if (has(["Threat Level", "Component", "Policy Violation", "Application"])) return "NEXUS_IQ";
  if (has(["QID", "IP", "DNS", "Port", "CVE ID"])) return "QUALYS";
  throw new Error("No se pudo identificar la herramienta. Verifica los encabezados del reporte de Fortify, Nexus IQ o Qualys.");
}

function normalizeSeverity(value, source) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (source === "FORTIFY") {
    const named = { CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };
    if (named[raw]) return named[raw];
  }
  const numeric = Number.parseFloat(raw);
  if (Number.isFinite(numeric)) {
    if (source === "NEXUS_IQ") {
      if (numeric >= 8 && numeric <= 10) return "CRITICAL";
      if (numeric >= 6 && numeric <= 7) return "HIGH";
      if (numeric >= 4 && numeric <= 5) return "MEDIUM";
      if (numeric >= 1 && numeric <= 3) return "LOW";
    }
    if (source === "QUALYS") {
      if (numeric === 5) return "CRITICAL";
      if (numeric === 4) return "HIGH";
      if (numeric === 3) return "MEDIUM";
      if (numeric >= 1 && numeric <= 2) return "LOW";
    }
  }
  throw new Error(`Severidad no válida para ${source}: "${value}".`);
}

function normalizeStatus(value) {
  const status = normalizedKey(value);
  if (["remediated", "fixed", "closed", "resolved", "mitigated"].includes(status)) return "REMEDIATED";
  if (["in progress", "in_progress", "under remediation", "in remediation", "ongoing"].includes(status)) return "IN_PROGRESS";
  return "OPEN";
}

function inferAsset(row, source) {
  const asset = findValue(row, ALIASES.asset);
  if (asset) return String(asset).trim();
  if (source === "QUALYS") {
    const ip = findValue(row, ["IP"]);
    const dns = findValue(row, ["DNS"]);
    if (ip && dns) return `${ip} (${dns})`;
    if (ip || dns) return String(ip || dns).trim();
  }
  return "Activo sin identificar";
}

export function detectTool(headers) {
  return detectSource(headers);
}

export function normalizeRows(rows, source) {
  const category = { FORTIFY: "SAST", NEXUS_IQ: "SCA", QUALYS: "INFRASTRUCTURE" }[source];
  if (!category) throw new Error(`Fuente no soportada: ${source}`);
  const dateIngested = new Date().toISOString();
  return rows
    .filter((row) => row && Object.values(row).some((value) => String(value ?? "").trim() !== ""))
    .map((row, index) => {
      const title = findValue(row, ALIASES.title);
      if (!title) throw new Error(`La fila ${index + 2} no incluye un nombre de hallazgo reconocible.`);
      return {
        source,
        category,
        asset: inferAsset(row, source),
        title: String(title).trim(),
        cve: String(findValue(row, ALIASES.cve) || "N/A").trim().toUpperCase(),
        severity: normalizeSeverity(findValue(row, ALIASES.severity), source),
        status: normalizeStatus(findValue(row, ALIASES.status)),
        dateIngested,
        lastScanned: dateIngested
      };
    });
}
