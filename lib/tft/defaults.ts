import { TFT_CATALOG } from "./catalog";
import type { TftAssumptions, TftSettings } from "./types";

export const DEFAULT_TFT_SETTINGS: TftSettings = {
  companyName: "DAO Paris",
  openingDate: "2026-01-01",
  legalForm: "SAS",
  vatRegime: "reel-normal",
  vatRateSales: 0.2,
  vatRatePurchases: 0.2,
  initialCash: 0,
  cashAlertThreshold: 5000,
  delays: {
    customerPayment: 0,
    supplierPayment: 8,
    externalCharges: 0,
    vatPayment: 3,
    socialCharges: 2,
  },
};

export const DAO_VALUES: TftAssumptions["values"] = {
  "revenue-store": { previ: 120000, obj: 150000 },
  "revenue-ecommerce": { previ: 65000, obj: 90000 },
  "purchase-rate": { previ: 0.43, obj: 0.4 },
  rent: { previ: 42516, obj: 42516 },
  insurance: { previ: 1200, obj: 1200 },
  "phone-internet": { previ: 360, obj: 360 },
  utilities: { previ: 2400, obj: 2400 },
  "fuel-transport": { previ: 1200, obj: 1200 },
  travel: { previ: 2000, obj: 2000 },
  marketing: { previ: 1200, obj: 2400 },
  "accounting-legal": { previ: 288, obj: 288 },
  "bank-fees": { previ: 228, obj: 228 },
  supplies: { previ: 0, obj: 0 },
  maintenance: { previ: 0, obj: 0 },
  cleaning: { previ: 0, obj: 0 },
  "health-insurance": { previ: 0, obj: 0 },
  subscriptions: { previ: 0, obj: 0 },
  "cb-fees": { previ: 0.0079, obj: 0.0079 },
  cfe: { previ: 5000, obj: 5000 },
  "personnel-start-month": { previ: 7, obj: 7 },
  "salary-gross": { previ: 3818, obj: 3818 },
  "employer-charges": { previ: 1362, obj: 1362 },
  intangibles: { previ: 38632, obj: 38632 },
  tangibles: { previ: 19169, obj: 19169 },
  deposit: { previ: 23332, obj: 23332 },
  "associate-contribution": { previ: 51000, obj: 51000 },
  "bank-loan": { previ: 60000, obj: 60000 },
  "loan-rate": { previ: 0.0435, obj: 0.0435 },
  "loan-duration": { previ: 5, obj: 5 },
  "corporate-tax-rate": { previ: 0.15, obj: 0.15 },
};

export const DAO_SEASONALITY = [
  0.1, 0.08, 0.08, 0.08, 0.07, 0.07, 0.06, 0.05, 0.08, 0.08, 0.1, 0.15,
];

export const DEFAULT_TFT_ASSUMPTIONS: TftAssumptions = {
  enabledLineIds: TFT_CATALOG.filter((line) => line.defaultEnabled).map((line) => line.id),
  values: DAO_VALUES,
  seasonality: {
    previ: DAO_SEASONALITY,
    obj: DAO_SEASONALITY,
  },
};

export function buildEmptyAssumptions(): TftAssumptions {
  const values: TftAssumptions["values"] = {};
  for (const line of TFT_CATALOG) {
    values[line.id] = { previ: 0, obj: 0 };
  }
  return {
    enabledLineIds: TFT_CATALOG.filter((line) => line.defaultEnabled).map((line) => line.id),
    values,
    seasonality: {
      previ: Array(12).fill(1 / 12),
      obj: Array(12).fill(1 / 12),
    },
  };
}

export function buildDaoAssumptions(): TftAssumptions {
  return {
    enabledLineIds: TFT_CATALOG.filter((line) => line.defaultEnabled).map((line) => line.id),
    values: { ...DAO_VALUES },
    seasonality: {
      previ: [...DAO_SEASONALITY],
      obj: [...DAO_SEASONALITY],
    },
  };
}
