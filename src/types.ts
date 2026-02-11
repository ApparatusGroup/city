export type Service =
  | "police"
  | "fire"
  | "health"
  | "education"
  | "transit"
  | "sanitation"
  | "water";

export type OverlayMode = "satisfaction" | "crime" | "water" | "roads";

export interface Policy {
  propertyTaxRate: number; // monthly applied to propertyValue (simplified)
  salesTaxRate: number; // monthly applied to consumption
  enforcementIntensity: number; // 0..1
  serviceBudgets: Record<Service, number>; // monthly
  maintenanceBudget: number; // monthly
}

export interface Citywide {
  trust: number; // 0..1
  unemployment: number; // 0..1
}

export interface City {
  month: number;
  seed: number;
  cash: number;
  debt: number;
  bondRateAPR: number;
  inflationAPR: number;
  policy: Policy;
  citywide: Citywide;
  lastReport: CityReport;
}

export interface District {
  id: string;
  x: number;
  y: number;

  pop: number;
  households: number;

  landValue: number;
  propertyValue: number;
  rentIndex: number;
  incomeMedian: number;
  density: number; // 0..1

  needs: {
    crimeRisk: number; // 0..1
    fireRisk: number; // 0..1
    healthRisk: number; // 0..1
  };

  infrastructure: {
    roadsCondition: number; // 0..1
    waterCondition: number; // 0..1
    sewerCondition: number; // 0..1
    powerReliability: number; // 0..1 (placeholder)
  };

  serviceDemand: Record<Service, number>;
  serviceCoverage: Record<Service, number>;

  outcomes: {
    crimeRate: number; // 0..1
    fireIncidents: number; // 0..1
    sickness: number; // 0..1
    graduation: number; // 0..1
    garbage: number; // 0..1
    waterOutages: number; // 0..1
  };

  satisfaction: number; // 0..1
}

export interface CityReport {
  month: number;
  revenue: number;
  expenses: number;
  surplus: number;
  cash: number;
  debt: number;
  avgSatisfaction: number;
  avgCrime: number;
  avgWaterOutages: number;
  trust: number;
  unemployment: number;
  highlights: string[];
  worstDistricts: {
    bySatisfaction: string[];
    byCrime: string[];
    byWater: string[];
  };
}
