import { TFT_CATALOG } from "./catalog";
import type { TftAssumptions, TftScenario, TftScenarioKey, TftSettings, TftWeekRow } from "./types";
import { generateTftWeeks, monthIndex, TFT_LAUNCH_WEEKS, TFT_WEEK_COUNT } from "./weekUtils";

const WEEKS_PER_MONTH = 52 / 12;
const NET_SALARY_RATE = 0.77;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function valueOf(assumptions: TftAssumptions, id: string, scenario: TftScenarioKey): number {
  if (!assumptions.enabledLineIds.includes(id)) return 0;
  return assumptions.values[id]?.[scenario] ?? 0;
}

function setRecord(target: Record<string, number>, id: string, value: number): void {
  if (value !== 0) {
    target[id] = (target[id] ?? 0) + value;
  }
}

function schedule(records: Record<string, number>[], weekIndexZero: number, id: string, amount: number): void {
  if (weekIndexZero >= 0 && weekIndexZero < records.length && amount !== 0) {
    records[weekIndexZero][id] = (records[weekIndexZero][id] ?? 0) + amount;
  }
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function monthEndPaymentWeek(weeks: Date[], month: number, delayWeeks: number): number | null {
  let lastWeek = -1;
  weeks.forEach((date, index) => {
    if (date.getMonth() === month) lastWeek = index;
  });
  if (lastWeek < 0) return null;
  return lastWeek + Math.max(0, delayWeeks);
}

export function computeScenario(
  settings: TftSettings,
  assumptions: TftAssumptions,
  scenario: TftScenarioKey
): TftScenario {
  const weeks = generateTftWeeks(settings.openingDate);
  const rows: TftWeekRow[] = weeks.map((weekStart, index) => ({
    weekIndex: index + 1,
    weekStart,
    sections: {
      encaissementsExploitation: {},
      decaissementsExploitation: {},
      personnel: {},
      tva: {
        collectee: 0,
        deductibleAchats: 0,
        deductibleCharges: 0,
        deductibleInvest: 0,
        solde: 0,
        aDecaisser: 0,
      },
      investissement: {},
      financement: {},
      is: 0,
    },
    totals: {
      totalEncaissements: 0,
      totalDecaissements: 0,
      totalPersonnel: 0,
      totalInvestissement: 0,
      totalFinancement: 0,
      variation: 0,
      cashStart: 0,
      cashEnd: 0,
    },
  }));

  const delayedDecaissements = Array.from({ length: TFT_WEEK_COUNT }, () => ({} as Record<string, number>));
  const delayedPurchaseVat = Array(TFT_WEEK_COUNT).fill(0);
  const delayedExternalVat = Array(TFT_WEEK_COUNT).fill(0);
  const monthlyVatSolde = Array(12).fill(0);
  const activeLineIds = new Set(assumptions.enabledLineIds);
  const vatOnSales = settings.vatRegime === "franchise" ? 0 : settings.vatRateSales;
  const vatOnPurchases = settings.vatRegime === "franchise" ? 0 : settings.vatRatePurchases;
  let cumulativeCaHt = 0;
  let cumulativePurchaseHt = 0;

  const revenueLines = TFT_CATALOG.filter((line) => line.computation === "annual-revenue-ht");
  const externalLines = TFT_CATALOG.filter((line) => line.computation === "annual-external-ht");

  for (let index = 0; index < TFT_WEEK_COUNT; index++) {
    const week = rows[index];
    const isActivity = index >= TFT_LAUNCH_WEEKS;
    const month = monthIndex(week.weekStart);

    let weeklyCaHt = 0;
    let weeklyCaTtc = 0;

    if (isActivity) {
      for (const line of revenueLines) {
        const annualHt = valueOf(assumptions, line.id, scenario);
        const monthlyWeight = assumptions.seasonality[scenario]?.[month] ?? 0;
        const ht = (annualHt * monthlyWeight) / WEEKS_PER_MONTH;
        const ttc = ht * (1 + vatOnSales);
        weeklyCaHt += ht;
        weeklyCaTtc += ttc;
        schedule(
          rows.map((row) => row.sections.encaissementsExploitation),
          index + Math.max(0, settings.delays.customerPayment),
          line.id,
          ttc
        );
      }

      cumulativeCaHt += weeklyCaHt;
      const purchaseRate = valueOf(assumptions, "purchase-rate", scenario);
      const purchaseHt = weeklyCaHt * purchaseRate;
      cumulativePurchaseHt += purchaseHt;
      const purchaseTtc = purchaseHt * (1 + vatOnPurchases);
      const purchaseWeek = index + Math.max(0, settings.delays.supplierPayment);
      schedule(delayedDecaissements, purchaseWeek, "purchase-rate", purchaseTtc);
      if (purchaseWeek < TFT_WEEK_COUNT) delayedPurchaseVat[purchaseWeek] += purchaseHt * vatOnPurchases;

      const cbFees = weeklyCaTtc * valueOf(assumptions, "cb-fees", scenario);
      setRecord(week.sections.decaissementsExploitation, "cb-fees", cbFees);

      const rentAnnualHt = valueOf(assumptions, "rent", scenario);
      if ([5, 18, 31, 44].includes(index + 1)) {
        const rentTtc = (rentAnnualHt / 4) * (1 + vatOnPurchases);
        setRecord(week.sections.decaissementsExploitation, "rent", rentTtc);
        week.sections.tva.deductibleCharges += (rentAnnualHt / 4) * vatOnPurchases;
      }

      const cfeAnnual = valueOf(assumptions, "cfe", scenario);
      if (index + 1 === 30 || index + 1 === 54) {
        setRecord(week.sections.decaissementsExploitation, "cfe", cfeAnnual / 2);
      }
    }

    for (const line of externalLines) {
      if (!activeLineIds.has(line.id)) continue;
      const ht = valueOf(assumptions, line.id, scenario) / 52;
      const ttc = ht * (1 + vatOnPurchases);
      const paymentWeek = index + Math.max(0, settings.delays.externalCharges);
      schedule(delayedDecaissements, paymentWeek, line.id, ttc);
      if (paymentWeek < TFT_WEEK_COUNT) delayedExternalVat[paymentWeek] += ht * vatOnPurchases;
    }

    for (const [id, amount] of Object.entries(delayedDecaissements[index])) {
      setRecord(week.sections.decaissementsExploitation, id, amount);
    }

    week.sections.tva.collectee = weeklyCaHt * vatOnSales;
    week.sections.tva.deductibleAchats = delayedPurchaseVat[index];
    week.sections.tva.deductibleCharges += delayedExternalVat[index];

    if (index === 0 || index === 1) {
      for (const line of TFT_CATALOG.filter((entry) => entry.computation === "initial-investment-ht")) {
        const ht = valueOf(assumptions, line.id, scenario) / 2;
        const ttc = ht * (1 + vatOnPurchases);
        setRecord(week.sections.investissement, line.id, ttc);
        week.sections.tva.deductibleInvest += ht * vatOnPurchases;
      }
    }
    if (index === 0) {
      setRecord(week.sections.investissement, "deposit", valueOf(assumptions, "deposit", scenario));
      setRecord(week.sections.financement, "associate-contribution", valueOf(assumptions, "associate-contribution", scenario));
      setRecord(week.sections.financement, "bank-loan", valueOf(assumptions, "bank-loan", scenario));
    }

    if (isActivity) {
      const loanCapital = valueOf(assumptions, "bank-loan", scenario);
      const loanYears = valueOf(assumptions, "loan-duration", scenario) || 1;
      const loanRate = valueOf(assumptions, "loan-rate", scenario);
      setRecord(week.sections.financement, "loan-capital-repayment", -(loanCapital / (loanYears * 52)));
      setRecord(week.sections.financement, "loan-interest", -((loanCapital * loanRate) / 52));
    }

    const startMonth = Math.max(1, Math.round(valueOf(assumptions, "personnel-start-month", scenario) || 13));
    if (isActivity && month + 1 >= startMonth) {
      const gross = valueOf(assumptions, "salary-gross", scenario);
      const netSalary = (gross * NET_SALARY_RATE) / WEEKS_PER_MONTH;
      const social = (gross * (1 - NET_SALARY_RATE) + valueOf(assumptions, "employer-charges", scenario)) / WEEKS_PER_MONTH;
      setRecord(week.sections.personnel, "salary-net", netSalary);
      const socialWeek = index + Math.max(0, settings.delays.socialCharges);
      if (socialWeek < TFT_WEEK_COUNT) {
        setRecord(rows[socialWeek].sections.personnel, "social-charges", social);
      }
    }

    week.sections.tva.solde =
      week.sections.tva.collectee -
      week.sections.tva.deductibleAchats -
      week.sections.tva.deductibleCharges -
      week.sections.tva.deductibleInvest;
    monthlyVatSolde[month] += week.sections.tva.solde;
  }

  for (let month = 0; month < 12; month++) {
    const amount = Math.max(0, monthlyVatSolde[month]);
    const paymentWeek = monthEndPaymentWeek(weeks, month, settings.delays.vatPayment);
    if (paymentWeek !== null && paymentWeek < TFT_WEEK_COUNT) {
      rows[paymentWeek].sections.tva.aDecaisser += amount;
    }
  }

  let runningCash = settings.initialCash;
  let minCash = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    row.totals.totalEncaissements = sumRecord(row.sections.encaissementsExploitation);
    row.totals.totalDecaissements = sumRecord(row.sections.decaissementsExploitation);
    row.totals.totalPersonnel = sumRecord(row.sections.personnel);
    row.totals.totalInvestissement = sumRecord(row.sections.investissement);
    row.totals.totalFinancement = sumRecord(row.sections.financement);
    row.totals.cashStart = runningCash;
    row.totals.variation =
      row.totals.totalEncaissements -
      row.totals.totalDecaissements -
      row.totals.totalPersonnel -
      row.sections.tva.aDecaisser -
      row.totals.totalInvestissement +
      row.totals.totalFinancement -
      row.sections.is;
    runningCash += row.totals.variation;
    row.totals.cashEnd = runningCash;
    minCash = Math.min(minCash, runningCash);

    row.totals.totalEncaissements = round2(row.totals.totalEncaissements);
    row.totals.totalDecaissements = round2(row.totals.totalDecaissements);
    row.totals.totalPersonnel = round2(row.totals.totalPersonnel);
    row.totals.totalInvestissement = round2(row.totals.totalInvestissement);
    row.totals.totalFinancement = round2(row.totals.totalFinancement);
    row.totals.variation = round2(row.totals.variation);
    row.totals.cashStart = round2(row.totals.cashStart);
    row.totals.cashEnd = round2(row.totals.cashEnd);
  }

  return {
    weeks: rows,
    indicators: {
      minCash: round2(minCash),
      cumulativeCA: round2(cumulativeCaHt * (1 + vatOnSales)),
      cumulativeMargin: round2(cumulativeCaHt - cumulativePurchaseHt),
    },
  };
}
