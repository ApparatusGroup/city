import type { OverlayMode } from "./types";
import { createDefaultCity, districtSummary, stepMonth } from "./sim";
import { pickDistrictAt, render, type RenderState } from "./ui";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const meta = $("meta");
const canvas = $("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const overlaySel = $("overlay") as HTMLSelectElement;

const btnStep = $("btnStep") as HTMLButtonElement;
const btnRun = $("btnRun") as HTMLButtonElement;
const btnReset = $("btnReset") as HTMLButtonElement;

const reportEl = $("report") as HTMLPreElement;
const inspectorEl = $("inspector") as HTMLPreElement;

const sliders = {
  taxProperty: $("taxProperty") as HTMLInputElement,
  taxSales: $("taxSales") as HTMLInputElement,
  enforcement: $("enforcement") as HTMLInputElement,

  bPolice: $("bPolice") as HTMLInputElement,
  bFire: $("bFire") as HTMLInputElement,
  bHealth: $("bHealth") as HTMLInputElement,
  bEducation: $("bEducation") as HTMLInputElement,
  bTransit: $("bTransit") as HTMLInputElement,
  bSanitation: $("bSanitation") as HTMLInputElement,
  bWater: $("bWater") as HTMLInputElement,

  bMaintenance: $("bMaintenance") as HTMLInputElement,
};

const vals = {
  taxPropertyVal: $("taxPropertyVal"),
  taxSalesVal: $("taxSalesVal"),
  enforcementVal: $("enforcementVal"),

  bPoliceVal: $("bPoliceVal"),
  bFireVal: $("bFireVal"),
  bHealthVal: $("bHealthVal"),
  bEducationVal: $("bEducationVal"),
  bTransitVal: $("bTransitVal"),
  bSanitationVal: $("bSanitationVal"),
  bWaterVal: $("bWaterVal"),

  bMaintenanceVal: $("bMaintenanceVal"),
} as Record<string, HTMLElement>;

function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  const x = Math.abs(n);
  if (x >= 1_000_000_000) return `${sign}$${(x / 1_000_000_000).toFixed(2)}B`;
  if (x >= 1_000_000) return `${sign}$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `${sign}$${(x / 1_000).toFixed(1)}K`;
  return `${sign}$${x.toFixed(0)}`;
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}
function fmtPct1(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

let sim = createDefaultCity(1337);
let city = sim.city;
let districts = sim.districts;

let state: RenderState = {
  overlay: "satisfaction",
  selectedId: districts[0]?.id ?? null,
  gridW: sim.w,
  gridH: sim.h,
};

let running = false;
let runHandle: number | null = null;

function getDistrictByXY(x: number, y: number) {
  return districts.find((d) => d.x === x && d.y === y) || null;
}
function getSelected() {
  return districts.find((d) => d.id === state.selectedId) || null;
}

function syncUIFromCity() {
  sliders.taxProperty.value = String(city.policy.propertyTaxRate);
  sliders.taxSales.value = String(city.policy.salesTaxRate);
  sliders.enforcement.value = String(city.policy.enforcementIntensity);

  sliders.bPolice.value = String(city.policy.serviceBudgets.police);
  sliders.bFire.value = String(city.policy.serviceBudgets.fire);
  sliders.bHealth.value = String(city.policy.serviceBudgets.health);
  sliders.bEducation.value = String(city.policy.serviceBudgets.education);
  sliders.bTransit.value = String(city.policy.serviceBudgets.transit);
  sliders.bSanitation.value = String(city.policy.serviceBudgets.sanitation);
  sliders.bWater.value = String(city.policy.serviceBudgets.water);

  sliders.bMaintenance.value = String(city.policy.maintenanceBudget);

  overlaySel.value = state.overlay;
  refreshLabels();
}

function applyUIToCity() {
  city.policy.propertyTaxRate = Number(sliders.taxProperty.value);
  city.policy.salesTaxRate = Number(sliders.taxSales.value);
  city.policy.enforcementIntensity = Number(sliders.enforcement.value);

  city.policy.serviceBudgets.police = Number(sliders.bPolice.value);
  city.policy.serviceBudgets.fire = Number(sliders.bFire.value);
  city.policy.serviceBudgets.health = Number(sliders.bHealth.value);
  city.policy.serviceBudgets.education = Number(sliders.bEducation.value);
  city.policy.serviceBudgets.transit = Number(sliders.bTransit.value);
  city.policy.serviceBudgets.sanitation = Number(sliders.bSanitation.value);
  city.policy.serviceBudgets.water = Number(sliders.bWater.value);

  city.policy.maintenanceBudget = Number(sliders.bMaintenance.value);

  refreshLabels();
}

function refreshLabels() {
  vals.taxPropertyVal.textContent = fmtPct(city.policy.propertyTaxRate);
  vals.taxSalesVal.textContent = fmtPct(city.policy.salesTaxRate);
  vals.enforcementVal.textContent = fmtPct1(city.policy.enforcementIntensity);

  vals.bPoliceVal.textContent = fmtMoney(city.policy.serviceBudgets.police);
  vals.bFireVal.textContent = fmtMoney(city.policy.serviceBudgets.fire);
  vals.bHealthVal.textContent = fmtMoney(city.policy.serviceBudgets.health);
  vals.bEducationVal.textContent = fmtMoney(city.policy.serviceBudgets.education);
  vals.bTransitVal.textContent = fmtMoney(city.policy.serviceBudgets.transit);
  vals.bSanitationVal.textContent = fmtMoney(city.policy.serviceBudgets.sanitation);
  vals.bWaterVal.textContent = fmtMoney(city.policy.serviceBudgets.water);

  vals.bMaintenanceVal.textContent = fmtMoney(city.policy.maintenanceBudget);
}

function updateMetaAndPanels() {
  const r = city.lastReport;
  meta.textContent =
    `Month ${city.month} | Cash ${fmtMoney(city.cash)} | Debt ${fmtMoney(city.debt)} | ` +
    `Avg Sat ${fmtPct1(r.avgSatisfaction)} | Trust ${fmtPct1(r.trust)} | Unemp ${fmtPct1(r.unemployment)}`;

  const lines: string[] = [];
  lines.push(`Month ${r.month}`);
  lines.push(r.highlights.join("\n"));
  lines.push("");
  lines.push("Worst districts:");
  lines.push(`  Satisfaction: ${r.worstDistricts.bySatisfaction.join(", ")}`);
  lines.push(`  Crime: ${r.worstDistricts.byCrime.join(", ")}`);
  lines.push(`  Water: ${r.worstDistricts.byWater.join(", ")}`);
  reportEl.textContent = lines.join("\n");

  const sel = getSelected();
  inspectorEl.textContent = sel ? districtSummary(sel) : "Click a district.";
}

function draw() {
  render(ctx, canvas, districts, state);
}

function stepOnce() {
  applyUIToCity();
  stepMonth(city, districts);
  updateMetaAndPanels();
  draw();
}

function startRun() {
  if (running) return;
  running = true;
  btnRun.textContent = "Stop";
  runHandle = window.setInterval(() => {
    stepOnce();
  }, 350);
}

function stopRun() {
  if (!running) return;
  running = false;
  btnRun.textContent = "Run";
  if (runHandle != null) {
    window.clearInterval(runHandle);
    runHandle = null;
  }
}

function reset() {
  stopRun();
  sim = createDefaultCity(1337);
  city = sim.city;
  districts = sim.districts;
  state.gridW = sim.w;
  state.gridH = sim.h;
  state.selectedId = districts[0]?.id ?? null;
  state.overlay = "satisfaction";
  syncUIFromCity();
  updateMetaAndPanels();
  draw();
}

// --- Events ---
overlaySel.addEventListener("change", () => {
  state.overlay = overlaySel.value as OverlayMode;
  draw();
});

btnStep.addEventListener("click", () => stepOnce());
btnRun.addEventListener("click", () => (running ? stopRun() : startRun()));
btnReset.addEventListener("click", () => reset());

for (const k of Object.keys(sliders) as (keyof typeof sliders)[]) {
  sliders[k].addEventListener("input", () => {
    applyUIToCity();
  });
}

canvas.addEventListener("click", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const my = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const picked = pickDistrictAt(canvas, state.gridW, state.gridH, mx, my);
  if (!picked) return;
  const d = getDistrictByXY(picked.x, picked.y);
  if (!d) return;
  state.selectedId = d.id;
  updateMetaAndPanels();
  draw();
});

// --- Init ---
syncUIFromCity();
updateMetaAndPanels();
draw();
