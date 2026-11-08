const SESSION_KEY = "sentinelrisk.session";
const AUDIT_KEY = "sentinelrisk.audit";
const MAX_AUDIT_EVENTS = 250;

const ROLES = {
  ADMIN: { label: "Administrador", username: "Admin Sentinel", email: "admin@sentinelrisk.local" },
  ANALYST: { label: "Analista", username: "Analista Sentinel", email: "analista@sentinelrisk.local" },
  READER: { label: "Lector / Auditor", username: "Auditor Sentinel", email: "auditor@sentinelrisk.local" }
};

const PERMISSIONS = {
  ADMIN: ["view", "import", "remediate", "audit", "clear"],
  ANALYST: ["view", "import", "remediate"],
  READER: ["view"]
};

export function getSession() {
  const rawSession = sessionStorage.getItem(SESSION_KEY);
  if (!rawSession) return null;
  let session;
  try {
    session = JSON.parse(rawSession);
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  if (!session || !ROLES[session.role] || typeof session.username !== "string" ||
      typeof session.email !== "string" || typeof session.timestamp !== "string" ||
      Number.isNaN(Date.parse(session.timestamp))) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return session;
}

export function hasPermission(permission, session = getSession()) {
  return Boolean(session && PERMISSIONS[session.role]?.includes(permission));
}

export function signIn(role) {
  const profile = ROLES[role];
  if (!profile) throw new Error("Selecciona un perfil de acceso válido.");
  const session = { username: profile.username, email: profile.email, role, timestamp: new Date().toISOString() };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  const session = getSession();
  sessionStorage.removeItem(SESSION_KEY);
  if (session) recordAuditEvent("LOGOUT", "Cierre de sesión.", session);
}

export function recordAuditEvent(action, details, session = getSession()) {
  let events = [];
  const stored = localStorage.getItem(AUDIT_KEY);
  if (stored) {
    try {
      events = JSON.parse(stored);
    } catch {
      throw new Error("El registro de auditoría local está dañado y no se puede actualizar.");
    }
    if (!Array.isArray(events)) throw new Error("El registro de auditoría local no tiene un formato válido.");
  }
  events.push({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action,
    details,
    username: session?.username ?? "Sesión desconocida",
    role: session?.role ?? "UNKNOWN",
    timestamp: new Date().toISOString()
  });
  localStorage.setItem(AUDIT_KEY, JSON.stringify(events.slice(-MAX_AUDIT_EVENTS)));
}

export function getAuditEvents() {
  const stored = localStorage.getItem(AUDIT_KEY);
  if (!stored) return [];
  try {
    const events = JSON.parse(stored);
    if (!Array.isArray(events)) throw new Error("El registro de auditoría local no tiene un formato válido.");
    return events;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("El registro de auditoría local está dañado y no se puede mostrar.");
    throw error;
  }
}

export function setupAuthUI({ onLogin, onLogout }) {
  const loginError = document.querySelector("#login-error");
  document.querySelectorAll('input[name="demo-role"]').forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll("[data-role-option]").forEach((option) => {
        option.classList.toggle("selected", option.dataset.roleOption === input.value);
      });
    });
  });
  document.querySelector("#sso-login").addEventListener("click", async () => {
    const role = document.querySelector('input[name="demo-role"]:checked')?.value;
    const button = document.querySelector("#sso-login");
    button.disabled = true;
    loginError.hidden = true;
    try {
      const session = signIn(role);
      await onLogin(session);
    } catch (error) {
      loginError.textContent = error instanceof Error ? error.message : "No se pudo iniciar la sesión.";
      loginError.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector("#logout-button").addEventListener("click", onLogout);
}
