const SEVERITIES = [
  { key: "CRITICAL", label: "Crítica", color: "#ef4444" },
  { key: "HIGH", label: "Alta", color: "#f97316" },
  { key: "MEDIUM", label: "Media", color: "#f59e0b" },
  { key: "LOW", label: "Baja", color: "#3b82f6" }
];
const SOURCES = [
  { key: "FORTIFY", label: "Fortify", color: "#38bdf8" },
  { key: "NEXUS_IQ", label: "Nexus IQ", color: "#818cf8" },
  { key: "QUALYS", label: "Qualys", color: "#34d399" }
];
let severityChart;
let sourceChart;

function severityCounts(findings) {
  return SEVERITIES.map(({ key }) => findings.filter((finding) => finding.severity === key && finding.status !== "REMEDIATED").length);
}

export function renderCharts(findings) {
  if (!globalThis.Chart) return;
  const active = findings.filter((finding) => finding.status !== "REMEDIATED");
  const severityData = severityCounts(findings);
  const legend = document.querySelector("#severity-legend");
  legend.replaceChildren(...SEVERITIES.map((item, index) => {
    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML = `<span class="legend-name"><span class="legend-swatch" style="background:${item.color}"></span>${item.label}</span><strong>${severityData[index]}</strong>`;
    return row;
  }));
  const severityCanvas = document.querySelector("#severity-chart");
  severityChart?.destroy();
  severityChart = new Chart(severityCanvas, {
    type: "doughnut",
    data: { labels: SEVERITIES.map(({ label }) => label), datasets: [{ data: severityData, backgroundColor: SEVERITIES.map(({ color }) => color), borderColor: "#17243a", borderWidth: 4, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "74%", plugins: { legend: { display: false }, tooltip: { backgroundColor: "#0f172a", borderColor: "rgba(148,163,184,.2)", borderWidth: 1, padding: 10 } } }
  });
  sourceChart?.destroy();
  sourceChart = new Chart(document.querySelector("#source-chart"), {
    type: "bar",
    data: { labels: SOURCES.map(({ label }) => label), datasets: [{ data: SOURCES.map(({ key }) => active.filter((finding) => finding.source === key).length), backgroundColor: SOURCES.map(({ color }) => color), borderRadius: 5, maxBarThickness: 45 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#0f172a", borderColor: "rgba(148,163,184,.2)", borderWidth: 1, padding: 10 } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#94a3b8", font: { family: "DM Sans", size: 10 } } }, y: { beginAtZero: true, ticks: { precision: 0, color: "#64748b", font: { family: "DM Sans", size: 9 }, padding: 7 }, grid: { color: "rgba(148,163,184,.1)" }, border: { display: false } } } }
  });
  document.querySelector("#source-summary").replaceChildren(...SOURCES.map((source) => {
    const item = document.createElement("span");
    item.className = "source-stat";
    const count = active.filter((finding) => finding.source === source.key).length;
    item.innerHTML = `<span class="source-dot" style="background:${source.color}"></span>${source.label}<strong>${count}</strong>`;
    return item;
  }));
}
