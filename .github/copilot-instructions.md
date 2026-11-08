# Copilot instructions

## Project overview

SentinelRisk is a browser-only vulnerability management MVP. It runs entirely in the browser with semantic HTML, CSS, and native ES modules; there is no backend, package manifest, bundler, or automated test runner. The product is Spanish-first and is designed around importing security scan exports (Fortify, Nexus IQ, Qualys), deduplicating findings, and displaying a local dashboard.

## Build, run, and validation commands

- Start the app from the repository root:

  ```bash
  python -m http.server 8000
  ```

  Then open `http://localhost:8000` in a browser. Prefer the local server over `file://` because the app relies on ES modules, IndexedDB, and Web Crypto.
- There is no build step, package manager, lint command, or automated test suite configured in this repository.
- Use syntax checks for edited JavaScript files:

  ```bash
  node --check js/normalizer.js
  ```

  For a quick repo-wide pass:

  ```bash
  for f in js/*.js; do node --check "$f" || exit 1; done
  ```

- Browser smoke validation should cover the imported workflows that matter in this app: CSV/XLSX imports for all three sources, severity/source/search filters, pagination, duplicate import behavior, remediation actions, CSV export, and persistence after reload.

## High-level architecture

- `index.html` is the DOM contract for the app. It loads the three stylesheet layers, the browser-side CDN libraries (`XLSX`, `PapaParse`, `Chart.js`, `Lucide`), and the app bootstrap in `js/app.js`.
- `js/app.js` is the orchestration layer. It is responsible for login/session handling, file parsing, source detection, normalization, ID generation, IndexedDB writes, dashboard refreshes, export, and notification flows.
- `js/normalizer.js` is the source-specific translation layer. It detects the input report type from headers, standardizes field names, and converts Fortify/Nexus IQ/Qualys rows into the shared finding contract.
- `js/deduplicator.js` computes a stable deduplication key from `source|asset|title|cve` using Web Crypto SHA-256 so duplicate imports can be recognized without a backend.
- `js/storage.js` owns the IndexedDB persistence layer (`SentinelRiskDB`, `findings`) and provides read, upsert, status-update, and clear operations.
- `js/ui.js` renders the dashboard KPIs, filter controls, pagination, empty states, and export data. `js/charts.js` owns the Chart.js charts shown on the summary view.
- `js/auth.js` implements the demo SSO/role model (`ANALYST`, `ADMIN`, `READER`), `sessionStorage` session state, permission checks, and a local audit log. This is a client-side prototype only; it is not a production identity or authorization system.
- `styles/base.css`, `styles/layout.css`, and `styles/components.css` divide the design into tokens, layout, and reusable UI components. Preserve the dark theme and Spanish UI language when changing presentation.

## Repository-specific conventions

- Keep the canonical finding contract consistent across modules: sources `FORTIFY`, `NEXUS_IQ`, `QUALYS`; categories `SAST`, `SCA`, `INFRASTRUCTURE`; severities `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`; statuses `OPEN`, `IN_PROGRESS`, `REMEDIATED`.
- Treat report headers as untrusted, variable input. Normalize spelling in `js/normalizer.js` and keep source recognition and source-specific severity mapping there.
- Retain the shared identifying fields (`source`, `asset`, `title`, `cve`) when changing deduplication behavior; these are the keys used by `js/deduplicator.js` and the storage layer.
- Preserve module boundaries. The app uses browser globals from `index.html`; do not introduce bundler-dependent imports or package installs unless the repository explicitly adds them.
- DOM selectors and `data-*` attributes are part of the UI contract between `index.html`, `js/app.js`, and `js/ui.js`. Update both the HTML and the relevant scripts together when changing controls or IDs.
- Report text is untrusted. Escape user- and report-derived values before inserting them into HTML templates, and keep persisted/UI status values in canonical uppercase.
- Keep role permissions aligned in `js/auth.js`, `js/app.js`, and `js/ui.js`. Admin-only actions such as database clearing must remain explicit and confirmable; audit/session data is separate from vulnerability records.
- Keep the UI language and copy in Spanish; do not silently mix English labels into the interface unless it is part of an intentional redesign.

## Working style for this repository

- Favor small, direct changes inside the existing browser-only architecture instead of introducing new libraries or frameworks.
- If a change affects imports, duplicate detection, or the finding schema, check all affected modules together (`normalizer`, `deduplicator`, `storage`, `ui`, `charts`, and any render logic)
- Prefer fixing logic in the module where the canonical data is defined, rather than duplicating transformations in UI code.
