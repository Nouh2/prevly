// ── Fiscal profile ────────────────────────────────────────────────────────────

export type LegalStatus =
  | "auto-entrepreneur"
  | "entreprise-individuelle"
  | "eurl"
  | "sasu"
  | "sarl"
  | "sas";

export type ActivitySector =
  | "vente-marchandises"
  | "prestations-services"
  | "liberal"
  | "artisan"
  | "restauration"
  | "btp"
  | "autre";

export type TnsPaymentFrequency = "monthly" | "quarterly";

export interface FiscalProfile {
  legalStatus: LegalStatus;
  sector: ActivitySector;
  /** "YYYY-MM" — month and year of company creation */
  creationMonth: string;
  /** Gross monthly compensation paid to the dirigeant for SAS/SASU */
  managerGrossMonthly?: number;
  /** Payment cadence used for TNS social contributions */
  tnsPaymentFrequency?: TnsPaymentFrequency;
  /** Current TNS contribution amount per payment period */
  tnsContributionAmount?: number;
}

export interface FiscalSummary {
  tvaRegime: "franchise" | "simplifie" | "normal";
  vatRate: number;
  tvaEstimated: number;
  tvaMonthlyEstimate: number;
  annualCAEstimate: number;
  tvaThreshold: number;
  /** % of TVA threshold reached (0–100) */
  tvaThresholdPct: number;
  isApplicable: boolean;
  annualISEstimate: number;
  isEstimated: number;
  isInstallmentsRequired: boolean;
  beneficeImposable: number;
  cotisationsEstimated: number;
  cotisationsRate: number;
  /** TVA + IS acompte + cotisations×3 for the quarter */
  totalQuarterlyProvisioning: number;
  monthlySuggested: number;
  microRevenueThreshold?: number;
  microThresholdExceeded?: boolean;
  isFirstYear: boolean;
  acreApplicable: boolean;
  /** Monthly savings from ACRE reduction */
  acreSavings: number;
}

// ── Transactions ──────────────────────────────────────────────────────────────

export interface Transaction {
  date: Date;
  label: string;
  /** Positive = credit (income), negative = debit (expense) */
  amount: number;
}

export interface MonthlyFlow {
  /** "YYYY-MM" */
  month: string;
  /** Sum of positive amounts */
  income: number;
  /** Sum of absolute values of negative amounts */
  expenses: number;
  /** income - expenses */
  net: number;
}

export type HealthLabel = "Fragile" | "Vigilance" | "Solide";
export type Severity = "red" | "orange" | "blue";

export interface HealthScore {
  score: number;
  label: HealthLabel;
  /** Hex color for the progress bar fill */
  color: string;
  /** Dynamic explanation lines */
  explanation: string[];
}

export interface Forecast {
  j30: number;
  j60: number;
  j90: number;
}

export interface Alert {
  severity: Severity;
  title: string;
  message: string;
  action?: string;
}

export interface RecurringCharge {
  /** Original label from CSV */
  label: string;
  /** Monthly equivalent amount (negative) */
  amount: number;
  frequency: "monthly" | "quarterly";
  /** Date of last seen occurrence */
  lastSeen: Date;
}

export interface Deadline {
  date: Date;
  label: string;
  /** Negative amount */
  amount: number;
  estimatedBalance: number;
  balanceStatus: "green" | "orange" | "red";
  isFiscal?: boolean;
  fiscalTag?: "TVA" | "IS" | "Cotisations";
}

export interface Recommendation {
  action: string;
  impact: string;
}

export interface DashboardData {
  transactions: Transaction[];
  monthlyFlows: MonthlyFlow[];
  currentBalance: number;
  lastTransactionDate: Date;
  healthScore: HealthScore;
  forecast: Forecast;
  /** Monthly sum of all recurring charges */
  monthlyRecurring: number;
  alerts: Alert[];
  recurringCharges: RecurringCharge[];
  deadlines: Deadline[];
  recommendations: Recommendation[];
  fiscalSummary?: FiscalSummary;
}

/** Raw parsed CSV row before column mapping */
export type CSVRow = string[];

export interface CSVColumnMap {
  date: number;
  label: number;
  /** When the CSV has separate debit/credit columns */
  debit?: number;
  credit?: number;
  /** When the CSV has a single signed amount column */
  amount?: number;
  balance?: number;
}

export type CSVParseResult =
  | { ok: true; transactions: Transaction[] }
  | { ok: false; error: string };
