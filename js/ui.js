const SOURCE_LABELS = { FORTIFY: "Fortify", NEXUS_IQ: "Nexus IQ", QUALYS: "Qualys" };
const SOURCE_COLORS = { FORTIFY: "#38bdf8", NEXUS_IQ: "#818cf8", QUALYS: "#34d399" };
const SEVERITY_LABELS = { CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" };
const STATUS_LABELS = { OPEN: "Abierto", IN_PROGRESS: "En progreso", REMEDIATED: "Remediado" };

let findings = [];
let currentPage = 1;
let pageSize = 10;
let handlers = {};
let canRemediate = false;
let uiInitialized = false;

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function currentFilteredFindings() {
  const severity = document.querySelector("#severity-filter").value;
  const source = document.querySelector("#source-filter").value;
  const query = document.querySelector("#search-input").value.trim().toLowerCase();
  return findings.filter((finding) => {
    if (severity && finding.severity !== severity) return false;
    if (source && finding.source !== source) return false;
    if (query && !`${finding.asset} ${finding.cve}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

function renderTable() {
  const filtered = currentFilteredFindings();
  const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(currentPage, maxPage);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const tbody = document.querySelector("#findings-body");
  tbody.innerHTML = pageItems.map((finding) => {
    const severity = finding.severity.toLowerCase();
    const status = finding.status.toLowerCase().replace("_", "-");
    const title = htmlEscape(finding.title);
    const asset = htmlEscape(finding.asset);
    const cve = htmlEscape(finding.cve);
    const source = htmlEscape(SOURCE_LABELS[finding.source] ?? finding.source);
    const statusLabel = STATUS_LABELS[finding.status] ?? finding.status;
    const action = !canRemediate
      ? ""
      : finding.status === "REMEDIATED"
      ? `<button class="row-action done" disabled><i data-lucide="check"></i> Remediado</button>`
      : `<button class="row-action" data-remediate="${htmlEscape(finding.id)}"><i data-lucide="check"></i> Remediar</button>`;
    return `<tr>
      <td><div class="finding-title"><span class="finding-symbol"><i data-lucide="bug"></i></span><div><div class="finding-title-text" title="${title}">${title}</div><div class="finding-meta">${cve}</div></div></div></td>
      <td><span class="asset-cell" title="${asset}">${asset}</span></td>
      <td><span class="severity-badge ${severity}">${SEVERITY_LABELS[finding.severity] ?? finding.severity}</span></td>
      <td><span class="source-badge" style="--source-color:${SOURCE_COLORS[finding.source] ?? "#94a3b8"}">${source}</span></td>
      <td><span class="status-badge ${status}">${statusLabel}</span></td>
      <td>${dateLabel(finding.dateIngested)}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");
  document.querySelector("#results-count").textContent = String(filtered.length);
  document.querySelector("#page-summary").textContent = `Mostrando ${filtered.length ? start + 1 : 0}–${Math.min(start + pageItems.length, filtered.length)} de ${filtered.length}`;
  document.querySelector("#page-indicator").textContent = `${currentPage} / ${maxPage}`;
  document.querySelector("#prev-page").disabled = currentPage <= 1;
  document.querySelector("#next-page").disabled = currentPage >= maxPage;
  document.querySelector("#empty-state").classList.toggle("visible", findings.length === 0);
  document.querySelector("table").hidden = findings.length === 0;
  document.querySelector("#page-summary").parentElement.hidden = findings.length === 0;
  document.querySelector("#empty-state h3").textContent = findings.length === 0 ? "No hay hallazgos todavía" : "No se encontraron resultados";
  document.querySelector("#empty-state p").textContent = findings.length === 0
    ? "Importa un reporte CSV o XLSX de Fortify, Nexus IQ o Qualys para comenzar."
    : "Prueba otros términos o cambia los filtros aplicados.";
  if (globalThis.lucide) globalThis.lucide.createIcons();
}

export function renderDashboard(data, session) {
  canRemediate = handlers.canRemediate?.(session) ?? false;
  document.querySelector("#top-import").hidden = !handlers.canImport?.(session);
  document.querySelector("#sidebar-import").hidden = !handlers.canImport?.(session);
  document.querySelector("#empty-import").hidden = !handlers.canImport?.(session);
  document.querySelector("#export-button").hidden = !handlers.canView?.(session);
  document.querySelector("#audit-button").hidden = !handlers.canAudit?.(session);
  document.querySelector("#clear-data-button").hidden = !handlers.canClear?.(session);
  findings = [...data].sort((a, b) => new Date(b.dateIngested) - new Date(a.dateIngested));
  const active = findings.filter((finding) => finding.status !== "REMEDIATED");
  const remediated = findings.length - active.length;
  const count = (severity) => active.filter((finding) => finding.severity === severity).length;
  document.querySelector("#kpi-active").textContent = String(active.length);
  document.querySelector("#kpi-critical").textContent = String(count("CRITICAL"));
  document.querySelector("#kpi-high").textContent = String(count("HIGH"));
  document.querySelector("#kpi-medium").textContent = String(count("MEDIUM"));
  document.querySelector("#kpi-low").textContent = String(count("LOW"));
  document.querySelector("#kpi-remediation").textContent = String(findings.length ? Math.round((remediated / findings.length) * 100) : 0);
  document.querySelector("#remediation-progress").style.width = `${findings.length ? (remediated / findings.length) * 100 : 0}%`;
  document.querySelector("#remediated-count").textContent = String(remediated);
  document.querySelector("#sidebar-count").textContent = String(active.length);
  const latest = findings.reduce((max, finding) => Math.max(max, new Date(finding.lastScanned ?? finding.dateIngested).getTime() || 0), 0);
  document.querySelector("#last-updated").textContent = latest ? `Última actualización: ${dateLabel(latest)}` : "Sin sincronizaciones";
  renderTable();
  handlers.onCharts?.(findings);
}

export function setupUI(callbacks) {
  handlers = callbacks;
  if (uiInitialized) return;
  uiInitialized = true;
  document.querySelectorAll(".row-action").forEach((button) => { button.hidden = !callbacks.canRemediate; });
  document.querySelector("#top-import").addEventListener("click", callbacks.onOpenUpload);
  document.querySelector("#sidebar-import").addEventListener("click", callbacks.onOpenUpload);
  document.querySelector("#empty-import").addEventListener("click", callbacks.onOpenUpload);
  document.querySelector("#refresh-button").addEventListener("click", callbacks.onRefresh);
  document.querySelector("#export-button").addEventListener("click", callbacks.onExport);
  document.querySelector("#audit-button").addEventListener("click", callbacks.onAudit);
  document.querySelector("#clear-data-button").addEventListener("click", callbacks.onClear);
  document.querySelector("#search-input").addEventListener("input", () => { currentPage = 1; renderTable(); });
  document.querySelector("#severity-filter").addEventListener("change", () => { currentPage = 1; renderTable(); });
  document.querySelector("#source-filter").addEventListener("change", () => { currentPage = 1; renderTable(); });
  document.querySelector("#page-size").addEventListener("change", (event) => { pageSize = Number(event.target.value); currentPage = 1; renderTable(); });
  document.querySelector("#prev-page").addEventListener("click", () => { currentPage = Math.max(1, currentPage - 1); renderTable(); });
  document.querySelector("#next-page").addEventListener("click", () => { currentPage += 1; renderTable(); });
  document.querySelector("#findings-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remediate]");
    if (button && callbacks.canRemediate) callbacks.onRemediate(button.dataset.remediate);
  });
  document.querySelector("#menu-toggle").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("is-open"));
  document.querySelectorAll(".side-nav .nav-link[href]").forEach((link) => link.addEventListener("click", () => document.querySelector("#sidebar").classList.remove("is-open")));
}

export function getExportRows() {
  return currentFilteredFindings();
}
