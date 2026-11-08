import { detectTool, normalizeRows } from "./normalizer.js";
import { addFindingIds } from "./deduplicator.js";
import { getAllFindings, updateFindingStatus, upsertFindings, clearFindings } from "./storage.js";
import { renderCharts } from "./charts.js";
import { getExportRows, renderDashboard, setupUI } from "./ui.js";
import { getAuditEvents, getSession, hasPermission, recordAuditEvent, setupAuthUI, signOut } from "./auth.js";

const dialog = document.querySelector("#upload-dialog");
const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector("#drop-zone");
const progress = document.querySelector("#upload-progress");
const loginScreen = document.querySelector("#login-screen");
const appShell = document.querySelector("#app-shell");
const auditDialog = document.querySelector("#audit-dialog");
let busy = false;
let currentSession = null;
let uploadUIReady = false;

function showToast(message, type = "success", title = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "error" ? "circle-alert" : type === "info" ? "info" : "circle-check";
  const heading = title ? `<strong>${escapeHTML(title)}</strong>` : "";
  toast.innerHTML = `<i data-lucide="${icon}"></i><div>${heading}${escapeHTML(message)}</div>`;
  document.querySelector("#toast-region").append(toast);
  if (globalThis.lucide) globalThis.lucide.createIcons();
  window.setTimeout(() => toast.remove(), 5500);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function setProgress(percent, label) {
  document.querySelector("#progress-bar").style.width = `${percent}%`;
  document.querySelector("#progress-value").textContent = `${percent}%`;
  document.querySelector("#progress-label").textContent = label;
}

function openUploadDialog() {
  if (!hasPermission("import", currentSession)) {
    showToast("Tu perfil no tiene permiso para importar archivos.", "error");
    return;
  }
  if (!dialog.open) dialog.showModal();
}

function closeUploadDialog() {
  if (!busy && dialog.open) dialog.close();
  fileInput.value = "";
}

async function parseFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!["csv", "xlsx", "xls"].includes(extension)) throw new Error("Formato no compatible. Selecciona un archivo CSV o XLSX.");
  if (file.size > 20 * 1024 * 1024) throw new Error("El archivo supera el límite de 20 MB.");
  if (extension === "csv") {
    if (!globalThis.Papa) throw new Error("No se pudo cargar PapaParse. Verifica tu conexión a Internet y vuelve a intentar.");
    return new Promise((resolve, reject) => {
      globalThis.Papa.parse(file, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (header) => header.trim(),
        complete: (result) => {
          if (result.errors.length) {
            reject(new Error(`No se pudo procesar el CSV: ${result.errors[0].message}`));
            return;
          }
          resolve(result.data);
        },
        error: (error) => reject(new Error(`No se pudo leer el CSV: ${error.message}`))
      });
    });
  }
  if (!globalThis.XLSX) throw new Error("No se pudo cargar SheetJS. Verifica tu conexión a Internet y vuelve a intentar.");
  const buffer = await file.arrayBuffer();
  const workbook = globalThis.XLSX.read(buffer, { type: "array", cellDates: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("El libro de cálculo no contiene hojas.");
  return globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "", raw: false });
}

async function importFile(file) {
  if (!file || busy) return;
  if (!hasPermission("import", currentSession)) {
    showToast("Tu perfil no tiene permiso para importar archivos.", "error");
    return;
  }
  busy = true;
  progress.hidden = false;
  fileInput.disabled = true;
  document.querySelector("#cancel-upload").disabled = true;
  setProgress(8, "Leyendo archivo...");
  try {
    const rows = await parseFile(file);
    if (!rows.length) throw new Error("El archivo no contiene filas de datos.");
    setProgress(25, "Identificando herramienta...");
    const source = detectTool(Object.keys(rows[0]));
    setProgress(35, "Normalizando hallazgos...");
    const normalized = normalizeRows(rows, source);
    if (!normalized.length) throw new Error("No se encontraron hallazgos válidos en el archivo.");
    const identified = await addFindingIds(normalized, (done, total) => {
      setProgress(35 + Math.round((done / total) * 35), "Generando identificadores seguros...");
    });
    setProgress(78, "Guardando en el almacenamiento local...");
    const counts = await upsertFindings(identified);
    try {
      recordAuditEvent("IMPORT_FINDINGS", `${counts.inserted} registros nuevos y ${counts.duplicates} duplicados actualizados de ${sourceLabel(source)}.`, currentSession);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo registrar la importación en auditoría.", "error", "Auditoría no actualizada");
    }
    setProgress(100, "Importación completada");
    await refreshDashboard();
    window.setTimeout(() => {
      if (dialog.open) dialog.close();
      progress.hidden = true;
      fileInput.disabled = false;
      document.querySelector("#cancel-upload").disabled = false;
      showToast(`Se importaron ${counts.inserted} registros de ${sourceLabel(source)} (${counts.duplicates} duplicados actualizados).`, "success", "Importación completada");
    }, 350);
  } catch (error) {
    progress.hidden = true;
    fileInput.disabled = false;
    document.querySelector("#cancel-upload").disabled = false;
    showToast(error instanceof Error ? error.message : "Ocurrió un error inesperado al importar.", "error", "No se pudo importar el archivo");
  } finally {
    busy = false;
  }
}

function sourceLabel(source) {
  return { FORTIFY: "Fortify", NEXUS_IQ: "Nexus IQ", QUALYS: "Qualys VM" }[source] ?? source;
}

async function refreshDashboard() {
  const data = await getAllFindings();
  renderDashboard(data, currentSession);
}

async function remediate(id) {
  if (!hasPermission("remediate", currentSession)) {
    showToast("Tu perfil no tiene permiso para modificar hallazgos.", "error");
    return;
  }
  try {
    await updateFindingStatus(id, "REMEDIATED");
    await refreshDashboard();
    try {
      recordAuditEvent("REMEDIATE_FINDING", `Hallazgo ${id} marcado como remediado.`, currentSession);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo registrar el cambio en auditoría.", "error", "Auditoría no actualizada");
    }
    showToast("El hallazgo se marcó como remediado.", "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "No se pudo actualizar el hallazgo.", "error");
  }
}

function exportCSV() {
  if (!hasPermission("view", currentSession)) {
    showToast("Inicia sesión para exportar hallazgos.", "error");
    return;
  }
  const rows = getExportRows();
  if (!rows.length) {
    showToast("No hay hallazgos para exportar.", "info");
    return;
  }
  const columns = ["id", "source", "category", "asset", "title", "cve", "severity", "status", "dateIngested", "lastScanned"];
  const escapeCSV = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [columns.join(","), ...rows.map((finding) => columns.map((column) => escapeCSV(finding[column])).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sentinelrisk-consolidado-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`Se exportaron ${rows.length} hallazgos.`, "success", "Exportación completada");
}

function updateProfile(session) {
  const roleNames = { ADMIN: "Administrador", ANALYST: "Analista", READER: "Lector / Auditor" };
  const roleClasses = { ADMIN: "badge-admin", ANALYST: "badge-analyst", READER: "badge-reader" };
  const initials = session.username.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  document.querySelector("#sidebar-avatar").textContent = initials;
  document.querySelector("#topbar-avatar").textContent = initials;
  document.querySelector("#sidebar-username").textContent = session.username;
  document.querySelector("#sidebar-email").textContent = session.email;
  document.querySelector("#topbar-username").textContent = session.username;
  for (const badge of [document.querySelector("#sidebar-role"), document.querySelector("#topbar-role")]) {
    badge.textContent = roleNames[session.role];
    badge.className = `role-badge ${roleClasses[session.role]}`;
  }
}

function showAuditLog() {
  if (!hasPermission("audit", currentSession)) {
    showToast("Solo los administradores pueden consultar la auditoría.", "error");
    return;
  }
  try {
    const list = document.querySelector("#audit-list");
    const events = getAuditEvents().slice().reverse();
    list.replaceChildren();
    if (!events.length) {
      const empty = document.createElement("p");
      empty.className = "audit-empty";
      empty.textContent = "Todavía no hay actividad registrada.";
      list.append(empty);
    }
    for (const event of events) {
      const row = document.createElement("article");
      row.className = "audit-entry";
      const heading = document.createElement("div");
      heading.className = "audit-entry-heading";
      const action = document.createElement("strong");
      action.textContent = String(event.action ?? "EVENT");
      const date = document.createElement("time");
      date.dateTime = String(event.timestamp ?? "");
      const parsedDate = new Date(event.timestamp);
      date.textContent = Number.isNaN(parsedDate.getTime()) ? "Fecha desconocida" : new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(parsedDate);
      heading.append(action, date);
      const details = document.createElement("p");
      details.textContent = String(event.details ?? "");
      const actor = document.createElement("small");
      actor.textContent = `${String(event.username ?? "Usuario")} · ${String(event.role ?? "")}`;
      row.append(heading, details, actor);
      list.append(row);
    }
    if (!auditDialog.open) auditDialog.showModal();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "No se pudo leer la auditoría.", "error");
  }
}

async function clearDatabase() {
  if (!hasPermission("clear", currentSession)) {
    showToast("Solo los administradores pueden vaciar la base de datos.", "error");
    return;
  }
  if (!window.confirm("¿Vaciar todos los hallazgos de SentinelRisk? Esta acción no se puede deshacer.")) return;
  try {
    const previousCount = (await getAllFindings()).length;
    await clearFindings();
    await refreshDashboard();
    try {
      recordAuditEvent("CLEAR_FINDINGS", `Se eliminaron ${previousCount} hallazgos de IndexedDB.`, currentSession);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo registrar el vaciado en auditoría.", "error", "Auditoría no actualizada");
    }
    showToast(`Se eliminaron ${previousCount} hallazgos.`, "success", "Base de datos vaciada");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "No se pudo vaciar la base de datos.", "error");
  }
}

function closeAuditDialog() {
  if (auditDialog.open) auditDialog.close();
}

function setupUpload() {
  if (uploadUIReady) return;
  uploadUIReady = true;
  document.querySelector("#close-dialog").addEventListener("click", closeUploadDialog);
  document.querySelector("#cancel-upload").addEventListener("click", closeUploadDialog);
  document.querySelector("#close-audit").addEventListener("click", closeAuditDialog);
  document.querySelector("#close-audit-footer").addEventListener("click", closeAuditDialog);
  document.querySelector("#browse-button").addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("click", (event) => {
    if (!event.target.closest("#browse-button")) fileInput.click();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => importFile(fileInput.files[0]));
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  }
  dropZone.addEventListener("drop", (event) => importFile(event.dataTransfer.files[0]));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeUploadDialog();
  });
  auditDialog.addEventListener("click", (event) => {
    if (event.target === auditDialog) closeAuditDialog();
  });
}

async function activateSession(session, auditLogin = false) {
  currentSession = session;
  loginScreen.hidden = true;
  appShell.hidden = false;
  updateProfile(session);
  if (auditLogin) {
    try {
      recordAuditEvent("LOGIN", "Inicio de sesión SSO simulado.", session);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo registrar el inicio de sesión.", "error", "Auditoría no actualizada");
    }
  }
  setupUI({
    canView: (activeSession) => hasPermission("view", activeSession ?? currentSession),
    canImport: (activeSession) => hasPermission("import", activeSession ?? currentSession),
    canRemediate: (activeSession) => hasPermission("remediate", activeSession ?? currentSession),
    canAudit: (activeSession) => hasPermission("audit", activeSession ?? currentSession),
    canClear: (activeSession) => hasPermission("clear", activeSession ?? currentSession),
    onOpenUpload: openUploadDialog,
    onRefresh: () => refreshDashboard().then(() => showToast("Los indicadores están actualizados.", "info")).catch((error) => showToast(error.message, "error")),
    onExport: exportCSV,
    onRemediate: remediate,
    onAudit: showAuditLog,
    onClear: clearDatabase,
    onCharts: renderCharts
  });
  setupUpload();
  try {
    await refreshDashboard();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "No se pudo inicializar el almacenamiento local.", "error", "Error de inicialización");
  }
}

async function logout() {
  let auditError;
  try {
    signOut();
  } catch (error) {
    auditError = error;
  }
  currentSession = null;
  appShell.hidden = true;
  loginScreen.hidden = false;
  closeAuditDialog();
  if (dialog.open) dialog.close();
  document.querySelector("#login-error").hidden = true;
  if (auditError) showToast(auditError.message, "error", "No se pudo registrar el cierre de sesión");
}

function initialize() {
  if (globalThis.lucide) globalThis.lucide.createIcons();
  setupAuthUI({ onLogin: (session) => activateSession(session, true), onLogout: logout });
  const session = getSession();
  if (session) {
    activateSession(session);
  } else {
    loginScreen.hidden = false;
    appShell.hidden = true;
  }
}

initialize();
