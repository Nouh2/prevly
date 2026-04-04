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
