import type {
  Transaction,
  MonthlyFlow,
  HealthScore,
  Forecast,
  Alert,
  DashboardData,
} from "@/types";

// ── Monthly flows ─────────────────────────────────────────────────────────────

export function computeMonthlyFlows(transactions: Transaction[]): MonthlyFlow[] {
  const map = new Map<string, { income: number; expenses: number }>();

  for (const tx of transactions) {
    const month = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    const existing = map.get(month) ?? { income: 0, expenses: 0 };
    if (tx.amount > 0) {
      existing.income += tx.amount;
    } else {
      existing.expenses += Math.abs(tx.amount);
    }
    map.set(month, existing);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expenses }]) => ({
      month,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round((income - expenses) * 100) / 100,
    }));
}

// ── Health score ──────────────────────────────────────────────────────────────

/**
 * Score 0–100 composed of three sub-scores:
 *
 * A (40 pts): Balance coverage — how many months of expenses the balance covers
 * B (30 pts): 3-month net flow trend
 * C (30 pts): Income regularity (inverse of coefficient of variation)
 */
export function computeHealthScore(
  currentBalance: number,
  monthlyFlows: MonthlyFlow[]
): HealthScore {
  if (monthlyFlows.length === 0) {
    return { score: 0, label: "Fragile", color: "#E85F4F" };
  }

  const recent = monthlyFlows.slice(-6);
  const avgExpenses =
    recent.reduce((sum, m) => sum + m.expenses, 0) / recent.length;

  // A: balance / avgExpenses ratio (up to 3 months coverage = full score)
  let scoreA = 0;
  if (avgExpenses > 0) {
    const ratio = currentBalance / avgExpenses;
    scoreA = Math.min(40, (ratio / 3) * 40);
  }

  // B: 3-month net trend
  const last3 = monthlyFlows.slice(-3);
  const positiveMonths = last3.filter((m) => m.net >= 0).length;
  const scoreB = positiveMonths === 3 ? 30 : positiveMonths === 2 ? 20 : positiveMonths === 1 ? 10 : 0;

  // C: income regularity
  const incomes = recent.map((m) => m.income).filter((v) => v > 0);
  let scoreC = 0;
  if (incomes.length >= 2) {
    const mean = incomes.reduce((s, v) => s + v, 0) / incomes.length;
    const stdDev = Math.sqrt(
      incomes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / incomes.length
    );
    const cv = mean > 0 ? stdDev / mean : 1;
    if (cv < 0.2) scoreC = 30;
    else if (cv < 0.4) scoreC = 22;
    else if (cv < 0.6) scoreC = 14;
    else if (cv < 0.8) scoreC = 7;
    else scoreC = 0;
  } else {
    scoreC = 15; // neutral when not enough data
  }

  const score = Math.round(Math.max(0, Math.min(100, scoreA + scoreB + scoreC)));

  let label: HealthScore["label"];
  let color: string;
  if (score >= 70) {
    label = "Solide";
    color = "#3DAA7A";
  } else if (score >= 40) {
    label = "Vigilance";
    color = "#E8834F";
  } else {
    label = "Fragile";
    color = "#E85F4F";
  }

  return { score, label, color };
}

// ── Linear regression ─────────────────────────────────────────────────────────

function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: values[0] };

  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += Math.pow(i - xMean, 2);
  }

  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

// ── Forecast ──────────────────────────────────────────────────────────────────

export function computeForecast(
  currentBalance: number,
  monthlyFlows: MonthlyFlow[]
): Forecast {
  if (monthlyFlows.length === 0) {
    return { j30: currentBalance, j60: currentBalance, j90: currentBalance };
  }

  const nets = monthlyFlows.slice(-6).map((m) => m.net);
  const { slope, intercept } = linearRegression(nets);
  const n = nets.length;

  // Forecast next 3 months using regression
  const f1 = intercept + slope * n;
  const f2 = intercept + slope * (n + 1);
  const f3 = intercept + slope * (n + 2);

  return {
    j30: Math.round(currentBalance + f1),
    j60: Math.round(currentBalance + f1 + f2),
    j90: Math.round(currentBalance + f1 + f2 + f3),
  };
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export function computeAlerts(
  currentBalance: number,
  forecast: Forecast,
  monthlyFlows: MonthlyFlow[]
): Alert[] {
  const alerts: Alert[] = [];
  const recent = monthlyFlows.slice(-3);

  // 1. Trésorerie tendue dans 30 jours
  if (currentBalance > 0 && forecast.j30 < currentBalance * 0.2) {
    alerts.push({
      severity: "red",
      message: "Tension de trésorerie détectée dans 30 jours.",
    });
  }

  // 2. Tendance négative sur 3 mois consécutifs
  if (recent.length >= 2 && recent.every((m) => m.net < 0)) {
    alerts.push({
      severity: "orange",
      message: "Vos flux nets sont en baisse sur les derniers mois consécutifs.",
    });
  }

  // 3. Solde inférieur à un mois de charges
  if (monthlyFlows.length > 0) {
    const avgExpenses =
      monthlyFlows.slice(-3).reduce((s, m) => s + m.expenses, 0) /
      Math.min(monthlyFlows.length, 3);
    if (avgExpenses > 0 && currentBalance < avgExpenses) {
      alerts.push({
        severity: "red",
        message: "Votre solde couvre moins d'un mois de charges.",
      });
    }
  }

  return alerts;
}

// ── Forecast color ────────────────────────────────────────────────────────────

export function forecastColor(value: number, currentBalance: number): string {
  if (currentBalance <= 0) return "var(--text)";
  const ratio = value / currentBalance;
  if (ratio >= 1) return "#3DAA7A";
  if (ratio >= 0.7) return "#E8834F";
  return "#E85F4F";
}

// ── Format helpers ────────────────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

// ── Full dashboard computation ────────────────────────────────────────────────

export function buildDashboardData(transactions: Transaction[]): DashboardData {
  const sorted = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Current balance = sum of all amounts (or last balance entry)
  const currentBalance = sorted.reduce((sum, tx) => sum + tx.amount, 0);
  const lastTransactionDate = sorted[sorted.length - 1].date;

  const monthlyFlows = computeMonthlyFlows(sorted);
  const healthScore = computeHealthScore(currentBalance, monthlyFlows);
  const forecast = computeForecast(currentBalance, monthlyFlows);
  const alerts = computeAlerts(currentBalance, forecast, monthlyFlows);

  return {
    transactions: sorted,
    monthlyFlows,
    currentBalance,
    lastTransactionDate,
    healthScore,
    forecast,
    alerts,
  };
}
