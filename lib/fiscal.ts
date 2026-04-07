import type {
  FiscalProfile,
  FiscalSummary,
  LegalStatus,
  ActivitySector,
  Deadline,
  Alert,
  MonthlyFlow,
} from "@/types";

// ── Format helper (standalone to avoid circular deps with analytics.ts) ────────

function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function isGoodsLikeSector(sector: ActivitySector): boolean {
  return sector === "vente-marchandises" || sector === "restauration";
}

function isSasuLike(legalStatus: LegalStatus): boolean {
  return legalStatus === "sasu" || legalStatus === "sas";
}

function isTnsLike(legalStatus: LegalStatus): boolean {
  return (
    legalStatus === "entreprise-individuelle" ||
    legalStatus === "eurl" ||
    legalStatus === "sarl"
  );
}

// ── VAT rate by sector ─────────────────────────────────────────────────────────

export function getVatRate(sector: ActivitySector): number {
  switch (sector) {
    case "restauration":
      return 0.1;
    default:
      return 0.2;
  }
}

// ── TVA franchise threshold ────────────────────────────────────────────────────

export function getTvaThreshold(sector: ActivitySector): number {
  return isGoodsLikeSector(sector) ? 85_000 : 37_500;
}

function getTvaUpperThreshold(sector: ActivitySector): number {
  return isGoodsLikeSector(sector) ? 945_000 : 286_000;
}

function getMicroRevenueThreshold(sector: ActivitySector): number {
  return isGoodsLikeSector(sector) ? 203_100 : 83_600;
}

function getTvaRegime(annualCA: number, sector: ActivitySector): FiscalSummary["tvaRegime"] {
  const lower = getTvaThreshold(sector);
  const upper = getTvaUpperThreshold(sector);
  if (annualCA < lower) return "franchise";
  if (annualCA < upper) return "simplifie";
  return "normal";
}

// ── IS applicability ───────────────────────────────────────────────────────────

export function isISApplicable(legalStatus: LegalStatus): boolean {
  return ["eurl", "sasu", "sarl", "sas"].includes(legalStatus);
}

// ── First year detection ───────────────────────────────────────────────────────

export function checkIsFirstYear(creationMonth: string): boolean {
  const [year, month] = creationMonth.split("-").map(Number);
  if (!year || !month) return false;
  const creation = new Date(year, month - 1, 1);
  const now = new Date();
  const monthsElapsed =
    (now.getFullYear() - creation.getFullYear()) * 12 +
    (now.getMonth() - creation.getMonth());
  return monthsElapsed < 12;
}

// ── Cotisations rate ───────────────────────────────────────────────────────────

export function getCotisationsRate(legalStatus: LegalStatus, sector: ActivitySector): number {
  switch (legalStatus) {
    case "auto-entrepreneur":
      if (isGoodsLikeSector(sector)) return 0.123;
      if (sector === "liberal") return 0.256;
      return 0.212;
    case "sasu":
    case "sas":
      return 0.64; // 22% salariales + 42% patronales
    case "eurl":
    case "sarl":
    case "entreprise-individuelle":
    default:
      return 0.45; // TNS
  }
}

// ── Main fiscal computation ────────────────────────────────────────────────────

export function computeFiscalSummary(
  fiscalProfile: FiscalProfile,
  monthlyFlows: MonthlyFlow[],
  currentBalance: number
): FiscalSummary {
  const {
    legalStatus,
    sector,
    creationMonth,
    managerGrossMonthly,
    tnsPaymentFrequency,
    tnsContributionAmount,
  } = fiscalProfile;

  // Annualized CA estimate
  const last12 = monthlyFlows.slice(-12);
  const totalIncome = last12.reduce((s, m) => s + m.income, 0);
  const annualCAEstimate =
    last12.length >= 12
      ? totalIncome
      : last12.length > 0
      ? (totalIncome / last12.length) * 12
      : 0;

  // TVA
  const tvaThreshold = getTvaThreshold(sector);
  const tvaThresholdPct = tvaThreshold > 0
    ? Math.min(100, Math.round((annualCAEstimate / tvaThreshold) * 100))
    : 0;
  const tvaRegime = getTvaRegime(annualCAEstimate, sector);
  const vatRate = getVatRate(sector);

  // Quarterly TVA estimate (last 3 months income × rate)
  const last3 = monthlyFlows.slice(-3);
  const observedVatMonths = last3.length;
  const observedVatIncome = last3.reduce((s, m) => s + m.income, 0);
  const projectedQuarterlyIncome =
    observedVatMonths > 0 ? (observedVatIncome / observedVatMonths) * 3 : 0;
  const projectedMonthlyVatIncome = projectedQuarterlyIncome / 3;
  const tvaMonthlyEstimate =
    tvaRegime === "normal" ? Math.round(projectedMonthlyVatIncome * vatRate) : 0;
  const tvaEstimated =
    tvaRegime !== "franchise" ? Math.round(projectedQuarterlyIncome * vatRate) : 0;

  // Profitability for IS/cotisations
  const totalExpenses = last12.reduce((s, m) => s + m.expenses, 0);
  const annualNet = totalIncome - totalExpenses;
  const beneficeImposable = Math.max(0, annualNet);

  // IS
  const isApplicable = isISApplicable(legalStatus);
  const firstYear = checkIsFirstYear(creationMonth);

  let annualIS = 0;
  if (isApplicable && !firstYear && beneficeImposable > 0) {
    annualIS =
      beneficeImposable <= 42_500
        ? beneficeImposable * 0.15
        : 42_500 * 0.15 + (beneficeImposable - 42_500) * 0.25;
  }
  const isInstallmentsRequired = annualIS >= 3_000;
  const isEstimated = isInstallmentsRequired ? Math.round(annualIS / 4) : 0;

  // Cotisations (monthly)
  const cotisationsRate = getCotisationsRate(legalStatus, sector);
  const avgMonthlyIncome =
    last12.length > 0 ? totalIncome / last12.length : 0;
  const avgMonthlyNet =
    last12.length > 0 ? beneficeImposable / last12.length : 0;

  let monthlyCotisations: number;
  if (legalStatus === "auto-entrepreneur") {
    monthlyCotisations = Math.round(avgMonthlyIncome * cotisationsRate);
  } else if (isSasuLike(legalStatus)) {
    monthlyCotisations =
      managerGrossMonthly && managerGrossMonthly > 0
        ? Math.round(managerGrossMonthly * cotisationsRate)
        : Math.round(avgMonthlyNet * cotisationsRate);
  } else {
    // TNS: use average monthly taxable profit and let the payment cadence drive the calendar.
    if (tnsContributionAmount && tnsContributionAmount > 0) {
      monthlyCotisations =
        (tnsPaymentFrequency ?? "monthly") === "quarterly"
          ? Math.round(tnsContributionAmount / 3)
          : Math.round(tnsContributionAmount);
    } else {
      monthlyCotisations = Math.round(avgMonthlyNet * cotisationsRate);
    }
  }

  // ACRE needs explicit eligibility/detection; do not auto-apply it from creation date alone.
  const acreApplicable = false;
  const acreSavings = 0;

  const cotisationsEstimated = monthlyCotisations;
  const quarterlyCotisationsProvision =
    isTnsLike(legalStatus) && tnsContributionAmount && tnsContributionAmount > 0
      ? (tnsPaymentFrequency ?? "monthly") === "quarterly"
        ? tnsContributionAmount
        : tnsContributionAmount * 3
      : cotisationsEstimated * 3;
  const totalQuarterlyProvisioning =
    tvaEstimated + isEstimated + quarterlyCotisationsProvision;
  const monthlySuggested = Math.max(0, Math.round(totalQuarterlyProvisioning / 3));
  const microRevenueThreshold =
    legalStatus === "auto-entrepreneur" ? getMicroRevenueThreshold(sector) : undefined;
  const microThresholdExceeded =
    microRevenueThreshold !== undefined && annualCAEstimate > microRevenueThreshold;

  return {
    tvaRegime,
    vatRate,
    tvaEstimated,
    tvaMonthlyEstimate,
    annualCAEstimate: Math.round(annualCAEstimate),
    tvaThreshold,
    tvaThresholdPct,
    isApplicable,
    annualISEstimate: Math.round(annualIS),
    isEstimated,
    isInstallmentsRequired,
    beneficeImposable: Math.round(beneficeImposable),
    cotisationsEstimated,
    cotisationsRate,
    totalQuarterlyProvisioning,
    monthlySuggested,
    microRevenueThreshold,
    microThresholdExceeded,
    isFirstYear: firstYear,
    acreApplicable,
    acreSavings,
  };
}

// ── Fiscal deadline dates ──────────────────────────────────────────────────────

/** Returns upcoming TVA deadline dates within 90 days of referenceDate */
function getUpcomingTvaDates(
  regime: FiscalSummary["tvaRegime"],
  referenceDate: Date,
  endDate: Date
): Date[] {
  if (regime === "franchise") return [];

  const year = referenceDate.getFullYear();
  const candidates: Date[] = [];

  if (regime === "simplifie") {
    // Default schedule for businesses closing on 31 Dec: CA12 in May,
    // then semi-annual advances in July and December.
    for (const y of [year, year + 1]) {
      candidates.push(
        new Date(y, 4, 5),    // 5 mai
        new Date(y, 6, 15),   // 15 juillet
        new Date(y, 11, 15),  // 15 decembre
      );
    }
  } else {
    // Monthly: 15th of each of the next 3 months.
    for (let i = 1; i <= 3; i++) {
      const d = new Date(referenceDate);
      d.setMonth(d.getMonth() + i);
      d.setDate(15);
      candidates.push(d);
    }
  }

  return candidates.filter(
    (d) => d > referenceDate && d <= endDate
  );
}

/** Returns upcoming IS acompte dates within 90 days */
function getUpcomingISDates(referenceDate: Date, endDate: Date): Date[] {
  const year = referenceDate.getFullYear();
  const candidates: Date[] = [];
  for (const y of [year, year + 1]) {
    candidates.push(
      new Date(y, 2, 15),   // 15 mars
      new Date(y, 5, 15),   // 15 juin
      new Date(y, 8, 15),   // 15 septembre
      new Date(y, 11, 15),  // 15 décembre
    );
  }
  return candidates.filter((d) => d > referenceDate && d <= endDate);
}

function getUpcomingTnsDates(
  frequency: FiscalProfile["tnsPaymentFrequency"],
  referenceDate: Date,
  endDate: Date
): Date[] {
  const normalizedFrequency = frequency ?? "monthly";

  if (normalizedFrequency === "quarterly") {
    const year = referenceDate.getFullYear();
    const candidates: Date[] = [];
    for (const y of [year, year + 1]) {
      candidates.push(
        new Date(y, 1, 5),   // 5 fevrier
        new Date(y, 4, 5),   // 5 mai
        new Date(y, 7, 5),   // 5 aout
        new Date(y, 10, 5),  // 5 novembre
      );
    }
    return candidates.filter((d) => d > referenceDate && d <= endDate);
  }

  const dates: Date[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + i, 5);
    if (d > referenceDate && d <= endDate) {
      dates.push(d);
    }
  }
  return dates;
}

// ── Fiscal deadlines for the calendar ─────────────────────────────────────────

export function computeFiscalDeadlines(
  fiscalProfile: FiscalProfile,
  fiscalSummary: FiscalSummary,
  currentBalance: number,
  avgMonthlyIncome: number,
  avgMonthlyCharges: number,
  referenceDate: Date
): Deadline[] {
  const { legalStatus, tnsPaymentFrequency, tnsContributionAmount } = fiscalProfile;
  const endDate = new Date(referenceDate);
  endDate.setDate(endDate.getDate() + 90);

  const events: {
    date: Date;
    label: string;
    amount: number;
    tag: "TVA" | "IS" | "Cotisations";
  }[] = [];

  // TVA
  if (fiscalSummary.tvaRegime !== "franchise" && fiscalSummary.tvaEstimated > 0) {
    const tvaDates = getUpcomingTvaDates(fiscalSummary.tvaRegime, referenceDate, endDate);
    if (fiscalSummary.tvaRegime === "simplifie") {
      const nextDate = tvaDates[0];
      if (nextDate) {
        events.push({
          date: nextDate,
          label: "TVA simplifiee",
          amount: -fiscalSummary.tvaEstimated,
          tag: "TVA",
        });
      }
    } else {
      for (const d of tvaDates) {
        events.push({
          date: d,
          label: "TVA mensuelle",
          amount: -fiscalSummary.tvaMonthlyEstimate,
          tag: "TVA",
        });
      }
    }
  }

  // IS acomptes (not first year)
  if (
    fiscalSummary.isApplicable &&
    !fiscalSummary.isFirstYear &&
    fiscalSummary.isInstallmentsRequired &&
    fiscalSummary.isEstimated > 0
  ) {
    for (const d of getUpcomingISDates(referenceDate, endDate)) {
      events.push({
        date: d,
        label: "Acompte IS",
        amount: -fiscalSummary.isEstimated,
        tag: "IS",
      });
    }
  }

  // Cotisations deadlines for SASU/SAS (DSN mensuelle — 15th of each month)
  if (isSasuLike(legalStatus) && fiscalSummary.cotisationsEstimated > 0) {
    for (let i = 1; i <= 3; i++) {
      const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + i, 15);
      if (d > referenceDate && d <= endDate) {
        events.push({
          date: d,
          label: "Cotisations DSN",
          amount: -fiscalSummary.cotisationsEstimated,
          tag: "Cotisations",
        });
      }
    }
  }

  if (isTnsLike(legalStatus) && fiscalSummary.cotisationsEstimated > 0) {
    const tnsDates = getUpcomingTnsDates(tnsPaymentFrequency, referenceDate, endDate);
    const tnsIsQuarterly = (tnsPaymentFrequency ?? "monthly") === "quarterly";
    const tnsScheduledAmount =
      tnsContributionAmount && tnsContributionAmount > 0
        ? tnsContributionAmount
        : tnsIsQuarterly
        ? fiscalSummary.cotisationsEstimated * 3
        : fiscalSummary.cotisationsEstimated;
    for (const d of tnsDates) {
      events.push({
        date: d,
        label: tnsIsQuarterly ? "Cotisations TNS trimestrielles" : "Cotisations TNS mensuelles",
        amount: -tnsScheduledAmount,
        tag: "Cotisations",
      });
    }
  }

  // Auto-entrepreneur: cotisations trimestrielles ou mensuelles
  // Show next occurrence only (to avoid overloading calendar)
  if (legalStatus === "auto-entrepreneur" && fiscalSummary.cotisationsEstimated > 0) {
    const nextMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 20);
    if (nextMonth <= endDate) {
      events.push({
        date: nextMonth,
        label: "Cotisations URSSAF",
        amount: -fiscalSummary.cotisationsEstimated,
        tag: "Cotisations",
      });
    }
  }

  // Sort chronologically, take the first 4 fiscal events max
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  const selected = events.slice(0, 4);

  // Running balance simulation
  const dailyIncome = avgMonthlyIncome / 30;
  let runningBalance = currentBalance;
  let lastDate = referenceDate;

  return selected.map((ev) => {
    const days = Math.max(
      0,
      (ev.date.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    runningBalance += dailyIncome * days;
    runningBalance += ev.amount;
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
      isFiscal: true as const,
      fiscalTag: ev.tag,
    };
  });
}

// ── Fiscal alerts ─────────────────────────────────────────────────────────────

export function computeFiscalAlerts(
  fiscalSummary: FiscalSummary,
  currentBalance: number,
  avgMonthlyCharges: number
): Alert[] {
  const alerts: Alert[] = [];

  // Alert 1: approaching TVA threshold (≥80%)
  if (
    fiscalSummary.tvaRegime === "franchise" &&
    fiscalSummary.tvaThresholdPct >= 80
  ) {
    const remaining = fiscalSummary.tvaThreshold - fiscalSummary.annualCAEstimate;
    const monthsLeft =
      fiscalSummary.annualCAEstimate > 0
        ? Math.max(0, Math.round(remaining / (fiscalSummary.annualCAEstimate / 12)))
        : 0;
    const monthStr = monthsLeft > 0 ? ` Dans environ ${monthsLeft} mois, vous devrez collecter la TVA.` : " Vous devrez bientôt collecter la TVA.";
    alerts.push({
      severity: "orange",
      title: "Seuil de franchise TVA approché",
      message: `Votre CA estimé (${fmt(fiscalSummary.annualCAEstimate)}) représente ${fiscalSummary.tvaThresholdPct}% du seuil de franchise (${fmt(fiscalSummary.tvaThreshold)}).${monthStr}`,
      action: "Anticipez dès maintenant",
    });
  }

  // Alert 2: fiscal obligations could strain cash flow
  if (fiscalSummary.totalQuarterlyProvisioning > 0 && avgMonthlyCharges > 0) {
    const balanceAfterFiscal =
      currentBalance - fiscalSummary.totalQuarterlyProvisioning;
    if (balanceAfterFiscal < avgMonthlyCharges) {
      alerts.push({
        severity: "orange",
        title: "Provisionnement fiscal à anticiper",
        message: `Vos obligations fiscales du trimestre (${fmt(fiscalSummary.totalQuarterlyProvisioning)}) combinées à vos charges fixes risquent de mettre votre trésorerie sous tension. Provisionnez ${fmt(fiscalSummary.monthlySuggested)} ce mois-ci.`,
        action: "Provisionner maintenant",
      });
    }
  }

  // Alert 3: selected micro status is incompatible with observed turnover
  if (
    fiscalSummary.microThresholdExceeded &&
    fiscalSummary.microRevenueThreshold !== undefined
  ) {
    alerts.push({
      severity: "orange",
      title: "Seuil micro-entreprise depasse",
      message: `Votre chiffre d'affaires annualise (${fmt(fiscalSummary.annualCAEstimate)}) depasse le plafond micro (${fmt(fiscalSummary.microRevenueThreshold)}). Verifiez votre statut et votre regime fiscal.`,
      action: "Verifier le statut",
    });
  }

  return alerts;
}
