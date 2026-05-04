export type TftLegalForm = "SAS" | "SARL" | "EURL" | "SASU" | "EI" | "AE";

export type TftVatRegime = "franchise" | "reel-simplifie" | "reel-normal";

export type TftScenarioKey = "previ" | "obj";

export type TftSection =
  | "revenus"
  | "achats"
  | "charges-fixes"
  | "charges-variables"
  | "impots-taxes"
  | "personnel"
  | "investissements"
  | "financement"
  | "is";

export type TftComputation =
  | "annual-revenue-ht"
  | "purchase-rate"
  | "annual-external-ht"
  | "quarterly-rent-ht"
  | "cb-fee-rate"
  | "cfe-annual"
  | "personnel-start-month"
  | "salary-gross-monthly"
  | "employer-charges-monthly"
  | "initial-investment-ht"
  | "initial-deposit"
  | "associate-contribution"
  | "bank-loan-capital"
  | "loan-annual-rate"
  | "loan-duration-years"
  | "corporate-tax-rate";

export interface TftSettings {
  companyName: string;
  openingDate: string;
  legalForm: TftLegalForm;
  vatRegime: TftVatRegime;
  vatRateSales: number;
  vatRatePurchases: number;
  initialCash: number;
  cashAlertThreshold: number;
  delays: {
    customerPayment: number;
    supplierPayment: number;
    externalCharges: number;
    vatPayment: number;
    socialCharges: number;
  };
}

export interface TftCatalogLine {
  id: string;
  label: string;
  section: TftSection;
  unit: string;
  defaultEnabled: boolean;
  comment?: string;
  computation: TftComputation;
}

export interface TftAssumptionValue {
  previ: number;
  obj: number;
}

export interface TftAssumptions {
  enabledLineIds: string[];
  values: Record<string, TftAssumptionValue>;
  seasonality: {
    previ: number[];
    obj: number[];
  };
  onboardingCompleted?: boolean;
}

export interface TftWeekRow {
  weekIndex: number;
  weekStart: Date;
  sections: {
    encaissementsExploitation: Record<string, number>;
    decaissementsExploitation: Record<string, number>;
    personnel: Record<string, number>;
    tva: {
      collectee: number;
      deductibleAchats: number;
      deductibleCharges: number;
      deductibleInvest: number;
      solde: number;
      aDecaisser: number;
    };
    investissement: Record<string, number>;
    financement: Record<string, number>;
    is: number;
  };
  totals: {
    totalEncaissements: number;
    totalDecaissements: number;
    totalPersonnel: number;
    totalInvestissement: number;
    totalFinancement: number;
    variation: number;
    cashStart: number;
    cashEnd: number;
  };
}

export interface TftScenario {
  weeks: TftWeekRow[];
  indicators: {
    minCash: number;
    cumulativeCA: number;
    cumulativeMargin: number;
  };
}

export interface TftStoragePayload {
  settings: TftSettings;
  assumptions: TftAssumptions;
}
