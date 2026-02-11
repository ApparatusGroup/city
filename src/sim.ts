import type { City, CityReport, District, Service } from "./types";
import { mulberry32, randNormish, randRange } from "./rng";

const SERVICES: Service[] = [
  "police",
  "fire",
  "health",
  "education",
  "transit",
  "sanitation",
  "water",
];

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  const x = Math.abs(n);
  if (x >= 1_000_000_000) return `${sign}$${(x / 1_000_000_000).toFixed(2)}B`;
  if (x >= 1_000_000) return `${sign}$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `${sign}$${(x / 1_000).toFixed(1)}K`;
  return `${sign}$${x.toFixed(0)}`;
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const CostPerUnit: Record<Service, number> = {
  // scale constants: higher = more expensive to achieve coverage
  police: 22,
  fire: 18,
  health: 20,
  education: 35,
  transit: 28,
  sanitation: 16,
  water: 14,
};

export function createDefaultCity(seed = 1337): { city: City; districts: District[]; w: number; h: number } {
  const w = 10;
  const h = 8;
  const r = mulberry32(seed);

  const city: City = {
    month: 0,
    seed,
    cash: 20_000_000,
    debt: 0,
    bondRateAPR: 0.045,
    inflationAPR: 0.03,
    policy: {
      propertyTaxRate: 0.012, // monthly simplified
      salesTaxRate: 0.02, // monthly simplified
      enforcementIntensity: 0.5,
      serviceBudgets: {
        police: 500_000,
        fire: 350_000,
        health: 250_000,
        education: 800_000,
        transit: 300_000,
        sanitation: 220_000,
        water: 260_000,
      },
      maintenanceBudget: 400_000,
    },
    citywide: {
      trust: 0.55,
      unemployment: 0.07,
    },
    lastReport: emptyReport(0),
  };

  const districts: District[] = [];

  // create correlated districts
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = randNormish(r);
      const centrality = 1 - (Math.abs(x - (w - 1) / 2) / (w / 2) + Math.abs(y - (h - 1) / 2) / (h / 2)) / 2;
      const density = clamp01(0.25 + 0.65 * centrality + 0.2 * (t - 0.5));

      const incomeMedian = Math.round(35_000 + 85_000 * clamp01(0.35 + 0.5 * t + 0.25 * (1 - density)));
      const pop = Math.round(4000 + 16000 * clamp01(0.25 + 0.65 * density + 0.2 * (t - 0.5)));
      const households = Math.round(pop / randRange(r, 2.1, 2.8));

      const infraBase = clamp01(0.55 + 0.35 * (incomeMedian / 120_000) + 0.15 * (randNormish(r) - 0.5));
      const roadsCondition = clamp01(infraBase - 0.15 * density);
      const waterCondition = clamp01(infraBase - 0.10 * density);
      const sewerCondition = clamp01(infraBase - 0.12 * density);

      const crimeRisk = clamp01(0.25 + 0.45 * density + 0.25 * (1 - incomeMedian / 120_000) + 0.2 * (randNormish(r) - 0.5));
      const fireRisk = clamp01(0.20 + 0.35 * density + 0.2 * (1 - roadsCondition) + 0.15 * (randNormish(r) - 0.5));
      const healthRisk = clamp01(0.22 + 0.30 * density + 0.25 * (1 - waterCondition) + 0.2 * (randNormish(r) - 0.5));

      // propertyValue correlated with income and density
      const propertyValue = Math.round(
        (180_000_000 + 900_000_000 * clamp01(0.35 * density + 0.55 * (incomeMedian / 120_000))) *
          clamp01(0.85 + 0.3 * randNormish(r))
      );
      const landValue = Math.round(propertyValue * randRange(r, 0.25, 0.45));
      const rentIndex = clamp(0.85 + 0.6 * (incomeMedian / 120_000) + 0.2 * (density - 0.5), 0.65, 1.6);

      const d: District = {
        id: `D${y * w + x + 1}`,
        x,
        y,
        pop,
        households,
        landValue,
        propertyValue,
        rentIndex,
        incomeMedian,
        density,
        needs: { crimeRisk, fireRisk, healthRisk },
        infrastructure: {
          roadsCondition,
          waterCondition,
          sewerCondition,
          powerReliability: clamp01(0.90 + 0.1 * infraBase),
        },
        serviceDemand: zeroServiceRecord(),
        serviceCoverage: zeroServiceRecord(),
        outcomes: {
          crimeRate: 0,
          fireIncidents: 0,
          sickness: 0,
          graduation: 0,
          garbage: 0,
          waterOutages: 0,
        },
        satisfaction: 0.55,
      };

      districts.push(d);
    }
  }

  // run one initial tick to populate derived fields
  stepMonth(city, districts);

  // reset month back to 0 but keep initialized metrics
  city.month = 0;
  city.lastReport.month = 0;
  return { city, districts, w, h };
}

function zeroServiceRecord(): Record<Service, number> {
  return {
    police: 0,
    fire: 0,
    health: 0,
    education: 0,
    transit: 0,
    sanitation: 0,
    water: 0,
  };
}

function emptyReport(month: number): CityReport {
  return {
    month,
    revenue: 0,
    expenses: 0,
    surplus: 0,
    cash: 0,
    debt: 0,
    avgSatisfaction: 0,
    avgCrime: 0,
    avgWaterOutages: 0,
    trust: 0,
    unemployment: 0,
    highlights: [],
    worstDistricts: { bySatisfaction: [], byCrime: [], byWater: [] },
  };
}

export function stepMonth(city: City, districts: District[]) {
  // --- A) Demand ---
  for (const d of districts) {
    const pop = d.pop;
    const hh = d.households;
    const roads = d.infrastructure.roadsCondition;
    const water = d.infrastructure.waterCondition;

    d.serviceDemand.police = pop * (0.6 + 0.8 * d.needs.crimeRisk);
    d.serviceDemand.fire = pop * (0.4 + 0.7 * d.density + 0.4 * (1 - roads)) * (0.75 + 0.5 * d.needs.fireRisk);
    d.serviceDemand.health = pop * (0.5 + 0.9 * d.needs.healthRisk + 0.5 * (1 - water));
    d.serviceDemand.education = hh * 2.2;
    d.serviceDemand.transit = pop * (0.35 + 0.9 * d.density);
    d.serviceDemand.sanitation = pop * (0.6 + 0.6 * d.density);
    d.serviceDemand.water = pop * 1.0;
  }

  // --- B) Coverage from budgets ---
  const sums: Record<Service, number> = zeroServiceRecord();
  for (const s of SERVICES) sums[s] = 0;
  for (const d of districts) for (const s of SERVICES) sums[s] += d.serviceDemand[s];

  const budgets = city.policy.serviceBudgets;

  for (const d of districts) {
    for (const s of SERVICES) {
      const total = sums[s];
      const demand = d.serviceDemand[s];
      const alloc = total > 0 ? (budgets[s] * demand) / total : 0;

      const denom = CostPerUnit[s] * demand + 1e-9;
      const coverage = 1 - Math.exp(-alloc / denom);

      d.serviceCoverage[s] = clamp01(coverage);
    }
  }

  // enforcement changes effectiveness + affects trust
  const enforce = clamp01(city.policy.enforcementIntensity);
  const enforceEffect = 0.8 + 0.4 * enforce; // 0.8..1.2
  const enforceTrustPenalty = Math.max(0, enforce - 0.6); // 0..0.4

  // --- C) Outcomes ---
  const baseCrime = 0.12;
  const baseFire = 0.08;
  const baseSick = 0.10;

  const trust = city.citywide.trust;
  const unemp = city.citywide.unemployment;

  for (const d of districts) {
    const roads = d.infrastructure.roadsCondition;
    const water = d.infrastructure.waterCondition;

    const policeCovEff = clamp01(d.serviceCoverage.police * enforceEffect);

    d.outcomes.crimeRate = clamp01(
      baseCrime *
        (1 + 0.6 * d.needs.crimeRisk) *
        (1 - 0.75 * policeCovEff) *
        (1 + 0.4 * unemp) *
        (1 + 0.3 * (1 - trust))
    );

    d.outcomes.fireIncidents = clamp01(
      baseFire *
        (1 + 0.5 * d.density) *
        (1 + 0.5 * (1 - roads)) *
        (1 + 0.35 * d.needs.fireRisk) *
        (1 - 0.7 * d.serviceCoverage.fire)
    );

    d.outcomes.sickness = clamp01(
      baseSick *
        (1 + 0.7 * d.needs.healthRisk) *
        (1 + 0.6 * (1 - water)) *
        (1 - 0.65 * d.serviceCoverage.health)
    );

    d.outcomes.garbage = clamp01((1 - d.serviceCoverage.sanitation) * (0.5 + 0.7 * d.density));

    d.outcomes.waterOutages = clamp01(
      (1 - d.serviceCoverage.water) * 0.5 + (1 - d.infrastructure.waterCondition) * 0.7
    );

    d.outcomes.graduation = clamp01(0.55 + 0.35 * d.serviceCoverage.education - 0.15 * d.outcomes.crimeRate);

    // --- D) Satisfaction ---
    d.satisfaction = clamp01(
      0.75
        - 0.35 * d.outcomes.crimeRate
        - 0.20 * d.outcomes.sickness
        - 0.15 * d.outcomes.garbage
        - 0.10 * d.outcomes.waterOutages
        + 0.10 * d.outcomes.graduation
        + 0.10 * d.infrastructure.roadsCondition
    );
  }

  // --- E) Budget ---
  const totalPropertyValue = districts.reduce((a, d) => a + d.propertyValue, 0);
  const totalPop = districts.reduce((a, d) => a + d.pop, 0);
  const avgIncome = districts.reduce((a, d) => a + d.incomeMedian * d.pop, 0) / Math.max(1, totalPop);

  // Simplified monthly revenue model (not annualized; tuned for gameplay)
  const propertyRevenue = city.policy.propertyTaxRate * totalPropertyValue;
  const consumptionRateMonthly = 0.22 / 12; // share of income spent monthly
  const taxableSales = totalPop * avgIncome * consumptionRateMonthly;
  const salesRevenue = city.policy.salesTaxRate * taxableSales;

  const revenue = propertyRevenue + salesRevenue;

  const serviceExpenses = SERVICES.reduce((a, s) => a + budgets[s], 0);
  const maintenance = city.policy.maintenanceBudget;

  const interestMonthly = (city.bondRateAPR / 12) * city.debt;

  const expenses = serviceExpenses + maintenance + interestMonthly;

  const surplus = revenue - expenses;

  city.cash += surplus;

  // if negative cash, issue debt to cover
  if (city.cash < 0) {
    const need = -city.cash;
    city.debt += need;
    city.cash = 0;
  }

  // --- F) Infrastructure wear + maintenance ---
  // Decay rates monthly
  const roadDecay = 0.010;
  const waterDecay = 0.008;
  const sewerDecay = 0.009;

  // decay first
  for (const d of districts) {
    const usage = 0.6 + 0.8 * d.density;
    d.infrastructure.roadsCondition = clamp01(d.infrastructure.roadsCondition - roadDecay * usage);
    d.infrastructure.waterCondition = clamp01(d.infrastructure.waterCondition - waterDecay * usage);
    d.infrastructure.sewerCondition = clamp01(d.infrastructure.sewerCondition - sewerDecay * usage);
  }

  // allocate maintenance to worst infra (weighted)
  const worstScore = (d: District) =>
    (1 - d.infrastructure.roadsCondition) * 0.45 +
    (1 - d.infrastructure.waterCondition) * 0.35 +
    (1 - d.infrastructure.sewerCondition) * 0.20;

  const weights = districts.map((d) => Math.max(0.001, worstScore(d)));
  const wsum = weights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < districts.length; i++) {
    const d = districts[i];
    const alloc = (maintenance * weights[i]) / wsum;

    // convert alloc to improvements with diminishing returns
    const scale = 90_000; // tune
    const eff = 1 - Math.exp(-alloc / scale); // 0..~1

    // distribute across infra based on deficits
    const roadDef = 1 - d.infrastructure.roadsCondition;
    const waterDef = 1 - d.infrastructure.waterCondition;
    const sewerDef = 1 - d.infrastructure.sewerCondition;
    const defSum = roadDef * 0.45 + waterDef * 0.35 + sewerDef * 0.20 + 1e-9;

    d.infrastructure.roadsCondition = clamp01(d.infrastructure.roadsCondition + eff * 0.10 * (roadDef * 0.45) / defSum);
    d.infrastructure.waterCondition = clamp01(d.infrastructure.waterCondition + eff * 0.09 * (waterDef * 0.35) / defSum);
    d.infrastructure.sewerCondition = clamp01(d.infrastructure.sewerCondition + eff * 0.085 * (sewerDef * 0.20) / defSum);
  }

  // --- G) Slow feedback loops: trust, unemployment, pop, property value ---
  // Trust drifts toward satisfaction and is penalized by aggressive enforcement
  const avgSat = districts.reduce((a, d) => a + d.satisfaction, 0) / districts.length;
  city.citywide.trust = clamp01(city.citywide.trust + 0.04 * (avgSat - city.citywide.trust) - 0.02 * enforceTrustPenalty);

  // Unemployment reacts (loosely) to satisfaction and tax burden
  const taxPressure = clamp01((city.policy.propertyTaxRate - 0.01) / 0.02); // 0..1-ish
  city.citywide.unemployment = clamp01(
    city.citywide.unemployment
      + 0.01 * (0.55 - avgSat)
      + 0.004 * taxPressure
      - 0.003 * (avgSat - 0.5)
  );

  // pop + property value update by district
  for (const d of districts) {
    const sat = d.satisfaction;
    const crime = d.outcomes.crimeRate;

    // migration: very small monthly
    const mig = 1 + 0.002 * (sat - 0.5) - 0.0015 * (crime - 0.12);
    d.pop = Math.max(500, Math.round(d.pop * clamp(mig, 0.995, 1.005)));
    d.households = Math.max(200, Math.round(d.pop / 2.4));

    // property value responds slowly
    const pvChange = 1 + 0.003 * (sat - 0.5) - 0.002 * crime + 0.0005 * (city.inflationAPR / 12);
    d.propertyValue = Math.max(30_000_000, Math.round(d.propertyValue * clamp(pvChange, 0.99, 1.01)));
    d.landValue = Math.round(d.propertyValue * clamp(d.landValue / Math.max(1, d.propertyValue), 0.2, 0.5));
    d.rentIndex = clamp(d.rentIndex * (1 + 0.002 * (sat - 0.5) + 0.001 * (crime - 0.12)), 0.65, 1.8);
  }

  // --- Reporting ---
  const report = computeReport(city, districts, revenue, expenses, surplus);
  city.lastReport = report;

  city.month += 1;
}

function computeReport(city: City, districts: District[], revenue: number, expenses: number, surplus: number): CityReport {
  const avgSatisfaction = districts.reduce((a, d) => a + d.satisfaction, 0) / districts.length;
  const avgCrime = districts.reduce((a, d) => a + d.outcomes.crimeRate, 0) / districts.length;
  const avgWaterOutages = districts.reduce((a, d) => a + d.outcomes.waterOutages, 0) / districts.length;

  const bySat = [...districts].sort((a, b) => a.satisfaction - b.satisfaction).slice(0, 3).map((d) => d.id);
  const byCrime = [...districts].sort((a, b) => b.outcomes.crimeRate - a.outcomes.crimeRate).slice(0, 3).map((d) => d.id);
  const byWater = [...districts].sort((a, b) => b.outcomes.waterOutages - a.outcomes.waterOutages).slice(0, 3).map((d) => d.id);

  const highlights: string[] = [];
  highlights.push(`Revenue ${fmtMoney(revenue)} vs Expenses ${fmtMoney(expenses)} → Surplus ${fmtMoney(surplus)}.`);
  highlights.push(`Avg Satisfaction ${fmtPct(avgSatisfaction)} | Avg Crime ${fmtPct(avgCrime)} | Avg Water Outages ${fmtPct(avgWaterOutages)}.`);
  highlights.push(`Trust ${fmtPct(city.citywide.trust)} | Unemployment ${fmtPct(city.citywide.unemployment)}.`);
  if (surplus < 0) highlights.push(`Budget deficit is forcing debt issuance. Cash is now ${fmtMoney(city.cash)}; Debt ${fmtMoney(city.debt)}.`);
  else highlights.push(`City cash is now ${fmtMoney(city.cash)}; Debt ${fmtMoney(city.debt)}.`);

  return {
    month: city.month,
    revenue,
    expenses,
    surplus,
    cash: city.cash,
    debt: city.debt,
    avgSatisfaction,
    avgCrime,
    avgWaterOutages,
    trust: city.citywide.trust,
    unemployment: city.citywide.unemployment,
    highlights,
    worstDistricts: { bySatisfaction: bySat, byCrime, byWater },
  };
}

export function districtSummary(d: District) {
  const lines: string[] = [];
  lines.push(`${d.id} @ (${d.x},${d.y})`);
  lines.push(`Pop: ${d.pop.toLocaleString()} | Income Median: $${d.incomeMedian.toLocaleString()} | Density: ${(d.density * 100).toFixed(0)}%`);
  lines.push(`Satisfaction: ${(d.satisfaction * 100).toFixed(1)}%`);
  lines.push("");
  lines.push("Outcomes:");
  lines.push(`  Crime: ${(d.outcomes.crimeRate * 100).toFixed(1)}%`);
  lines.push(`  Sickness: ${(d.outcomes.sickness * 100).toFixed(1)}%`);
  lines.push(`  Garbage: ${(d.outcomes.garbage * 100).toFixed(1)}%`);
  lines.push(`  Water Outages: ${(d.outcomes.waterOutages * 100).toFixed(1)}%`);
  lines.push(`  Graduation: ${(d.outcomes.graduation * 100).toFixed(1)}%`);
  lines.push("");
  lines.push("Infrastructure:");
  lines.push(`  Roads: ${(d.infrastructure.roadsCondition * 100).toFixed(1)}%`);
  lines.push(`  Water: ${(d.infrastructure.waterCondition * 100).toFixed(1)}%`);
  lines.push(`  Sewer: ${(d.infrastructure.sewerCondition * 100).toFixed(1)}%`);
  lines.push("");
  lines.push("Service Coverage:");
  for (const s of SERVICES) lines.push(`  ${s}: ${(d.serviceCoverage[s] * 100).toFixed(1)}%`);
  return lines.join("\n");
}
