import type {
  Transaction,
  MonthlyFlow,
  HealthScore,
  Forecast,
  Alert,
  RecurringCharge,
  Deadline,
  Recommendation,
  DashboardData,
  FiscalProfile,
} from "@/types";
import {
  computeFiscalSummary,
  computeFiscalDeadlines,
  computeFiscalAlerts,
} from "@/lib/fiscal";

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

// ── Recurring charge detection ────────────────────────────────────────────────

const FRENCH_MONTHS = /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|jan|fev|mar|avr|jun|jul|aug|sep|oct|nov|dec)\b/gi;

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(FRENCH_MONTHS, "")
    .replace(/\d+/g, "")
    .replace(/[^a-zàâçéèêëîïôùûü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28)
    .trim();
}

export function detectRecurringCharges(transactions: Transaction[]): RecurringCharge[] {
  // Only expenses
  const expenses = transactions.filter((t) => t.amount < 0);
  if (expenses.length < 2) return [];

  // Group by normalized label
  const groups = new Map<string, Transaction[]>();
  for (const tx of expenses) {
    const key = normalizeLabel(tx.label);
    if (!key || key.length < 3) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  const recurring: RecurringCharge[] = [];

  for (const txs of groups.values()) {
    if (txs.length < 2) continue;

    // Collect unique month strings
    const monthSet = new Set(
      txs.map(
        (t) =>
          `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`
      )
    );
    if (monthSet.size < 2) continue;

    const sortedMonths = Array.from(monthSet).sort();

    // Determine frequency from the gap between first two occurrences
    const [y1, m1] = sortedMonths[0].split("-").map(Number);
    const [y2, m2] = sortedMonths[1].split("-").map(Number);
    const gap = (y2 - y1) * 12 + (m2 - m1);

    if (gap !== 1 && gap !== 3) continue;

    // Verify all consecutive gaps match the detected frequency
    let consistent = true;
    for (let i = 1; i < sortedMonths.length; i++) {
      const [ya, ma] = sortedMonths[i - 1].split("-").map(Number);
      const [yb, mb] = sortedMonths[i].split("-").map(Number);
      const d = (yb - ya) * 12 + (mb - ma);
      if (d !== gap) { consistent = false; break; }
    }
    if (!consistent) continue;

    // Verify amounts are within ±15% of the average
    const amounts = txs.map((t) => Math.abs(t.amount));
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const allSimilar = amounts.every((a) => Math.abs(a - avg) / avg <= 0.15);
    if (!allSimilar) continue;

    const lastTx = txs.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    const frequency = gap === 1 ? "monthly" : "quarterly";

    // Use the label from the most recent transaction
    recurring.push({
      label: lastTx.label.slice(0, 40),
      amount: -avg,
      frequency,
      lastSeen: lastTx.date,
    });
  }

  // Sort by monthly impact descending
  return recurring.sort((a, b) => {
    const aMonthly = a.frequency === "monthly" ? Math.abs(a.amount) : Math.abs(a.amount) / 3;
    const bMonthly = b.frequency === "monthly" ? Math.abs(b.amount) : Math.abs(b.amount) / 3;
    return bMonthly - aMonthly;
  });
}

// ── Health score ──────────────────────────────────────────────────────────────

export function computeHealthScore(
  currentBalance: number,
  monthlyFlows: MonthlyFlow[]
): HealthScore {
  if (monthlyFlows.length === 0) {
    return {
      score: 0,
      label: "Fragile",
      color: "#E85F4F",
      explanation: ["Aucune donnée disponible pour calculer le score."],
    };
  }

  const recent = monthlyFlows.slice(-6);
  const avgExpenses = recent.reduce((sum, m) => sum + m.expenses, 0) / recent.length;
  const avgIncome = recent.reduce((sum, m) => sum + m.income, 0) / recent.length;

  // A (40 pts): Balance coverage
  let scoreA = 0;
  if (avgExpenses > 0) {
    const ratio = currentBalance / avgExpenses;
    scoreA = Math.min(40, (ratio / 3) * 40);
  }

  // B (30 pts): 3-month net trend
  const last3 = monthlyFlows.slice(-3);
  const positiveMonths = last3.filter((m) => m.net >= 0).length;
  const scoreB =
    positiveMonths === 3 ? 30 : positiveMonths === 2 ? 20 : positiveMonths === 1 ? 10 : 0;

  // C (30 pts): Income regularity
  const incomes = recent.map((m) => m.income).filter((v) => v > 0);
  let scoreC = 0;
  let cv = 0;
  if (incomes.length >= 2) {
    const mean = incomes.reduce((s, v) => s + v, 0) / incomes.length;
    const stdDev = Math.sqrt(
      incomes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / incomes.length
    );
    cv = mean > 0 ? stdDev / mean : 1;
    if (cv < 0.2) scoreC = 30;
    else if (cv < 0.4) scoreC = 22;
    else if (cv < 0.6) scoreC = 14;
    else if (cv < 0.8) scoreC = 7;
    else scoreC = 0;
  } else {
    scoreC = 15;
  }

  let raw = Math.round(Math.max(0, Math.min(100, scoreA + scoreB + scoreC)));

  // Cap at 85 when history is less than 6 months
  const monthsOfData = monthlyFlows.length;
  if (monthsOfData < 6) {
    raw = Math.min(raw, 85);
  }

  let label: HealthScore["label"];
  let color: string;
  if (raw >= 70) {
    label = "Solide";
    color = "#3DAA7A";
  } else if (raw >= 40) {
    label = "Vigilance";
    color = "#E8834F";
  } else {
    label = "Fragile";
    color = "#E85F4F";
  }

  // Dynamic explanation
  const explanation: string[] = [];

  const coverageRatio = avgExpenses > 0 ? currentBalance / avgExpenses : 0;
  if (coverageRatio >= 2) {
    explanation.push(`Points forts : votre solde couvre plus de ${coverageRatio.toFixed(1)} mois de charges — bonne réserve.`);
  } else if (coverageRatio >= 1) {
    explanation.push(`Points forts : votre solde couvre environ ${coverageRatio.toFixed(1)} mois de charges.`);
  } else {
    explanation.push(`Point de vigilance : votre solde couvre moins d'un mois de charges.`);
  }

  if (positiveMonths === 3) {
    explanation.push("Flux nets positifs 3 mois consécutifs — tendance favorable.");
  } else if (positiveMonths === 0) {
    explanation.push("Flux nets négatifs sur les 3 derniers mois — attention à la tendance.");
  }

  if (avgExpenses > 0 && avgIncome > 0) {
    const chargeRatio = Math.round((avgExpenses / avgIncome) * 100);
    if (chargeRatio > 80) {
      explanation.push(`Point de vigilance : vos charges représentent ${chargeRatio}% de vos entrées mensuelles.`);
    }
  }

  if (cv > 0.6) {
    explanation.push("Revenus irréguliers détectés — constituez une réserve de sécurité.");
  }

  if (monthsOfData < 6) {
    explanation.push(`Données limitées : score basé sur ${monthsOfData} mois — importez 6 mois pour plus de précision.`);
  }

  return { score: raw, label, color, explanation: explanation.slice(0, 3) };
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
  monthlyFlows: MonthlyFlow[],
  recurringCharges: RecurringCharge[]
): { forecast: Forecast; monthlyRecurring: number } {
  if (monthlyFlows.length === 0) {
    return {
      forecast: { j30: currentBalance, j60: currentBalance, j90: currentBalance },
      monthlyRecurring: 0,
    };
  }

  const recent = monthlyFlows.slice(-6);

  // Average monthly income with damped trend
  const incomes = recent.map((m) => m.income);
  const { slope: incomeSlope } = linearRegression(incomes);
  const avgIncome = incomes.reduce((s, v) => s + v, 0) / incomes.length;

  // Monthly recurring charges total
  const monthlyRecurring = recurringCharges.reduce((sum, c) => {
    if (c.frequency === "monthly") return sum + Math.abs(c.amount);
    if (c.frequency === "quarterly") return sum + Math.abs(c.amount) / 3;
    return sum;
  }, 0);

  // Average non-recurring expenses (total avg expenses minus recurring)
  const avgTotalExpenses = recent.reduce((s, m) => s + m.expenses, 0) / recent.length;
  const avgNonRecurring = Math.max(0, avgTotalExpenses - monthlyRecurring);

  // Dampen income trend by 50% to avoid over-optimism
  const dampedSlope = incomeSlope * 0.5;

  const netMonth = (month: number) =>
    avgIncome + dampedSlope * month - monthlyRecurring - avgNonRecurring;

  const n1 = netMonth(1);
  const n2 = netMonth(2);
  const n3 = netMonth(3);

  return {
    forecast: {
      j30: Math.round(currentBalance + n1),
      j60: Math.round(currentBalance + n1 + n2),
      j90: Math.round(currentBalance + n1 + n2 + n3),
    },
    monthlyRecurring: Math.round(monthlyRecurring),
  };
}

// ── Deadlines ─────────────────────────────────────────────────────────────────

export function computeDeadlines(
  currentBalance: number,
  recurringCharges: RecurringCharge[],
  avgMonthlyIncome: number,
  avgMonthlyCharges: number,
  referenceDate: Date
): Deadline[] {
  const endDate = new Date(referenceDate);
  endDate.setDate(endDate.getDate() + 90);

  const events: { date: Date; label: string; amount: number }[] = [];

  for (const charge of recurringCharges) {
    let next = new Date(charge.lastSeen);

    if (charge.frequency === "monthly") {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setMonth(next.getMonth() + 3);
    }

    // Collect all occurrences within 90 days
    while (next <= endDate) {
      events.push({ date: new Date(next), label: charge.label, amount: charge.amount });
      if (charge.frequency === "monthly") {
        next = new Date(next);
        next.setMonth(next.getMonth() + 1);
      } else {
        next = new Date(next);
        next.setMonth(next.getMonth() + 3);
      }
    }
  }

  // Sort chronologically
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Running balance calculation
  const dailyIncome = avgMonthlyIncome / 30;
  let runningBalance = currentBalance;
  let lastDate = referenceDate;

  const deadlines: Deadline[] = events.slice(0, 5).map((ev) => {
    const days = Math.max(
      0,
      (ev.date.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    runningBalance += dailyIncome * days;
    runningBalance += ev.amount; // negative
    lastDate = ev.date;

    const ratio = avgMonthlyCharges > 0 ? runningBalance / avgMonthlyCharges : 2;
    const balanceStatus: Deadline["balanceStatus"] =
      ratio >= 2 ? "green" : ratio >= 1 ? "orange" : "red";

    return {
      date: ev.date,
      label: ev.label,
      amount: ev.amount,
      estimatedBalance: Math.round(runningBalance),
      balanceStatus,
    };
  });

  return deadlines;
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export function computeAlerts(
  currentBalance: number,
  forecast: Forecast,
  monthlyFlows: MonthlyFlow[],
  recurringCharges: RecurringCharge[],
  deadlines: Deadline[],
  avgMonthlyCharges: number,
  referenceDate: Date
): Alert[] {
  const alerts: Alert[] = [];
  const recent = monthlyFlows.slice(-3);

  // RED: upcoming deadline pushes balance below 1x monthly charges
  const criticalDeadline = deadlines.find((d) => d.balanceStatus === "red");
  if (criticalDeadline) {
    alerts.push({
      severity: "red",
      title: "Risque de trésorerie critique",
      message: `Votre ${shortLabel(criticalDeadline.label)} de ${formatCurrency(Math.abs(criticalDeadline.amount))} tombe le ${formatDateDeadline(criticalDeadline.date)}. Votre solde estimé ce jour sera de ${formatCurrency(criticalDeadline.estimatedBalance)} — soit moins d'un mois de charges. Anticipez dès maintenant.`,
      action: "Agissez maintenant",
    });
  }

  // ORANGE: 2+ of last 3 months with negative net OR J+90 drops >20% vs current
  const negCount = recent.filter((m) => m.net < 0).length;
  const negTrend = recent.length >= 3 && negCount >= 2;
  const j90drop = currentBalance > 0 && forecast.j90 < currentBalance * 0.8;

  if (negTrend || j90drop) {
    const currentRunway =
      avgMonthlyCharges > 0 ? currentBalance / avgMonthlyCharges : 0;
    const futureRunway =
      avgMonthlyCharges > 0 ? forecast.j90 / avgMonthlyCharges : 0;
    let msg: string;
    if (j90drop) {
      msg = `Votre solde estimé à J+90 (${formatCurrency(forecast.j90)}) est inférieur de plus de 20% à votre solde actuel. Votre runway passe de ${currentRunway.toFixed(1)} à ${Math.max(0, futureRunway).toFixed(1)} mois.`;
    } else {
      msg = `Vos dépenses ont dépassé vos revenus sur ${negCount} des 3 derniers mois. Votre solde couvre actuellement ${currentRunway.toFixed(1)} mois de charges — restez vigilant sur votre niveau d'activité.`;
    }
    alerts.push({
      severity: "orange",
      title: "Tendance de trésorerie à surveiller",
      message: msg,
      action: "Identifiez les postes à réduire",
    });
  }

  // BLUE: balance > 2× monthly recurring fixed charges + quarterly fiscal deadline within 60 days
  const monthlyRecurringTotal = recurringCharges.reduce((sum, c) => {
    return sum + (c.frequency === "monthly" ? Math.abs(c.amount) : Math.abs(c.amount) / 3);
  }, 0);
  const nextQuarterlyCharge = recurringCharges.find(
    (c) => c.frequency === "quarterly"
  );
  if (
    monthlyRecurringTotal > 0 &&
    currentBalance > 2 * monthlyRecurringTotal &&
    nextQuarterlyCharge
  ) {
    const nextDate = new Date(nextQuarterlyCharge.lastSeen);
    nextDate.setMonth(nextDate.getMonth() + 3);
    const daysUntil = Math.round(
      (nextDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntil > 0 && daysUntil <= 60) {
      alerts.push({
        severity: "blue",
        title: "Opportunité de provisionnement",
        message: `Votre trésorerie est confortable. Provisionnez dès maintenant votre ${shortLabel(nextQuarterlyCharge.label)} du ${formatDateDeadline(nextDate)} — soit ${formatCurrency(Math.abs(nextQuarterlyCharge.amount))} à mettre de côté.`,
        action: "Provisionner maintenant",
      });
    }
  }

  // Max 3, red → orange → blue order
  return alerts.slice(0, 3);
}

function countConsecutiveNegative(flows: MonthlyFlow[]): number {
  let count = 0;
  for (let i = flows.length - 1; i >= 0; i--) {
    if (flows[i].net < 0) count++;
    else break;
  }
  return count;
}

function shortLabel(label: string): string {
  // Get first 2-3 meaningful words
  const words = label.trim().split(/\s+/).slice(0, 3).join(" ");
  return words.length > 25 ? words.slice(0, 25) : words;
}

// ── Recommendations ───────────────────────────────────────────────────────────

export function computeRecommendations(
  currentBalance: number,
  monthlyFlows: MonthlyFlow[],
  forecast: Forecast,
  recurringCharges: RecurringCharge[],
  avgMonthlyCharges: number,
  avgMonthlyIncome: number
): { action: string; impact: string }[] {
  const recs: { action: string; impact: string }[] = [];
  const recent = monthlyFlows.slice(-6);

  // 1. Charges > 50% of income — name the actual top recurring lines
  if (avgMonthlyIncome > 0 && avgMonthlyCharges > 0) {
    const chargeRatio = Math.round((avgMonthlyCharges / avgMonthlyIncome) * 100);
    if (chargeRatio > 50) {
      const top2 = recurringCharges.slice(0, 2).map((c) => ({
        label: shortLabel(c.label),
        monthly: Math.round(
          c.frequency === "monthly" ? Math.abs(c.amount) : Math.abs(c.amount) / 3
        ),
      }));

      let action: string;
      if (top2.length >= 2) {
        const totalTop2 = top2[0].monthly + top2[1].monthly;
        const pct = Math.round((totalTop2 / avgMonthlyCharges) * 100);
        action = `${top2[0].label} (${formatCurrency(top2[0].monthly)}/mois) et ${top2[1].label} (${formatCurrency(top2[1].monthly)}/mois) représentent ${pct}% de vos charges fixes. Ce sont vos deux seuls leviers réels pour améliorer votre runway.`;
      } else if (top2.length === 1) {
        action = `${top2[0].label} (${formatCurrency(top2[0].monthly)}/mois) est votre principale charge fixe — ${Math.round((top2[0].monthly / avgMonthlyCharges) * 100)}% de vos charges totales.`;
      } else {
        action = `Vos charges fixes absorbent ${chargeRatio}% de vos revenus moyens. Identifiez les postes compressibles pour améliorer votre runway.`;
      }

      recs.push({
        action,
        impact: `Réduire vos charges de 10% dégagerait environ ${formatCurrency(Math.round(avgMonthlyCharges * 0.1))} par mois.`,
      });
    }
  }

  // 2. Irregular income
  const incomes = recent.map((m) => m.income).filter((v) => v > 0);
  if (incomes.length >= 3) {
    const mean = incomes.reduce((s, v) => s + v, 0) / incomes.length;
    const stdDev = Math.sqrt(incomes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / incomes.length);
    const cv = mean > 0 ? stdDev / mean : 0;
    const minIncome = Math.min(...incomes);
    if (cv > 0.4) {
      const safetyReserve = Math.round(avgMonthlyCharges * 2);
      recs.push({
        action: `Vos revenus sont irréguliers — votre mois le plus bas représente ${Math.round((minIncome / mean) * 100)}% de votre mois moyen.`,
        impact: `Constituez une réserve de sécurité de ${formatCurrency(safetyReserve)} (2 mois de charges) pour absorber les creux.`,
      });
    }
  }

  // 3. Positive 3-month trend
  const last3 = monthlyFlows.slice(-3);
  if (last3.length === 3 && last3.every((m) => m.net > 0)) {
    recs.push({
      action: "Votre trésorerie progresse depuis 3 mois. C'est le bon moment pour anticiper vos charges fiscales du prochain trimestre.",
      impact: `Épargner ${formatCurrency(Math.round(avgMonthlyCharges * 0.3))} par mois vous permettrait de couvrir votre prochain trimestre sans tension.`,
    });
  }

  // 4. J+90 below current balance
  if (forecast.j90 < currentBalance * 0.85) {
    recs.push({
      action: "Votre trésorerie va se contracter dans 90 jours. Anticipez en relançant vos clients en retard ou en lissant vos charges fixes.",
      impact: `Sans action, votre solde passera de ${formatCurrency(currentBalance)} à ${formatCurrency(forecast.j90)} dans 3 mois.`,
    });
  }

  return recs.slice(0, 3);
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

export function formatDateDeadline(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
  }).format(date);
}

// ── Full dashboard computation ────────────────────────────────────────────────

export function buildDashboardData(transactions: Transaction[], fiscalProfile?: FiscalProfile): DashboardData {
  const sorted = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const currentBalance = sorted.reduce((sum, tx) => sum + tx.amount, 0);
  const lastTransactionDate = sorted[sorted.length - 1].date;

  const monthlyFlows = computeMonthlyFlows(sorted);
  const healthScore = computeHealthScore(currentBalance, monthlyFlows);

  const recurringCharges = detectRecurringCharges(sorted);

  const { forecast, monthlyRecurring } = computeForecast(
    currentBalance,
    monthlyFlows,
    recurringCharges
  );

  const recent6 = monthlyFlows.slice(-6);
  const avgMonthlyIncome =
    recent6.reduce((s, m) => s + m.income, 0) / Math.max(recent6.length, 1);
  const avgMonthlyCharges =
    recent6.reduce((s, m) => s + m.expenses, 0) / Math.max(recent6.length, 1);

  const deadlines = computeDeadlines(
    currentBalance,
    recurringCharges,
    avgMonthlyIncome,
    avgMonthlyCharges,
    lastTransactionDate
  );

  const alerts = computeAlerts(
    currentBalance,
    forecast,
    monthlyFlows,
    recurringCharges,
    deadlines,
    avgMonthlyCharges,
    lastTransactionDate
  );

  const recommendations = computeRecommendations(
    currentBalance,
    monthlyFlows,
    forecast,
    recurringCharges,
    avgMonthlyCharges,
    avgMonthlyIncome
  );

  if (fiscalProfile) {
    const fiscalSummary = computeFiscalSummary(fiscalProfile, monthlyFlows, currentBalance);

    const fiscalDeadlines = computeFiscalDeadlines(
      fiscalProfile,
      fiscalSummary,
      currentBalance,
      avgMonthlyIncome,
      avgMonthlyCharges,
      lastTransactionDate
    );

    // Merge and sort all deadlines chronologically
    const allDeadlines = [...deadlines, ...fiscalDeadlines].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    const fiscalAlerts = computeFiscalAlerts(fiscalSummary, currentBalance, avgMonthlyCharges);
    // Fiscal alerts go after existing alerts; total capped at 4 to allow both types to show
    const allAlerts = [...alerts, ...fiscalAlerts].slice(0, 4);

    return {
      transactions: sorted,
      monthlyFlows,
      currentBalance,
      lastTransactionDate,
      healthScore,
      forecast,
      monthlyRecurring,
      alerts: allAlerts,
      recurringCharges,
      deadlines: allDeadlines,
      recommendations,
      fiscalSummary,
    };
  }

  return {
    transactions: sorted,
    monthlyFlows,
    currentBalance,
    lastTransactionDate,
    healthScore,
    forecast,
    monthlyRecurring,
    alerts,
    recurringCharges,
    deadlines,
    recommendations,
  };
}
