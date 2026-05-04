"use client";

import { TFT_CATALOG } from "@/lib/tft/catalog";
import type { TftAssumptions, TftScenario, TftSettings, TftWeekRow } from "@/lib/tft/types";

interface Props {
  scenarioLabel: string;
  scenario: TftScenario;
  settings: TftSettings;
  assumptions: TftAssumptions;
}

type RowDef = {
  label: string;
  kind?: "section" | "subtotal" | "cash";
  value: (week: TftWeekRow) => number | string;
  total?: () => number | string;
};

const money = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });

function formatCell(value: number | string): string {
  if (typeof value === "string") return value;
  if (Math.abs(value) < 0.005) return "-";
  return money.format(value);
}

function sum(weeks: TftWeekRow[], getter: (week: TftWeekRow) => number): number {
  return weeks.reduce((total, week) => total + getter(week), 0);
}

export default function TftTable({ scenarioLabel, scenario, settings, assumptions }: Props) {
  const active = new Set(assumptions.enabledLineIds);
  const revenueRows: RowDef[] = TFT_CATALOG.filter(
    (line) => line.computation === "annual-revenue-ht" && active.has(line.id)
  ).map((line) => ({
    label: line.label,
    value: (week) => week.sections.encaissementsExploitation[line.id] ?? 0,
    total: () => sum(scenario.weeks, (week) => week.sections.encaissementsExploitation[line.id] ?? 0),
  }));

  const expenseLineIds = TFT_CATALOG.filter((line) =>
    ["purchase-rate", "cb-fee-rate", "quarterly-rent-ht", "annual-external-ht", "cfe-annual"].includes(line.computation)
  )
    .filter((line) => active.has(line.id))
    .map((line) => line.id);

  const expenseRows: RowDef[] = expenseLineIds.map((id) => {
    const line = TFT_CATALOG.find((entry) => entry.id === id);
    return {
      label: id === "purchase-rate" ? "Achats marchandises fournisseur" : line?.label ?? id,
      value: (week) => week.sections.decaissementsExploitation[id] ?? 0,
      total: () => sum(scenario.weeks, (week) => week.sections.decaissementsExploitation[id] ?? 0),
    };
  });

  const rows: RowDef[] = [
    { label: "ENCAISSEMENTS D'EXPLOITATION", kind: "section", value: () => "" },
    ...revenueRows,
    {
      label: "Total encaissements d'exploitation",
      kind: "subtotal",
      value: (week) => week.totals.totalEncaissements,
      total: () => sum(scenario.weeks, (week) => week.totals.totalEncaissements),
    },
    { label: "DECAISSEMENTS D'EXPLOITATION", kind: "section", value: () => "" },
    ...expenseRows,
    {
      label: "Total decaissements d'exploitation",
      kind: "subtotal",
      value: (week) => week.totals.totalDecaissements,
      total: () => sum(scenario.weeks, (week) => week.totals.totalDecaissements),
    },
    { label: "FLUX DE PERSONNEL", kind: "section", value: () => "" },
    {
      label: "Salaires nets",
      value: (week) => week.sections.personnel["salary-net"] ?? 0,
      total: () => sum(scenario.weeks, (week) => week.sections.personnel["salary-net"] ?? 0),
    },
    {
      label: "Charges sociales URSSAF",
      value: (week) => week.sections.personnel["social-charges"] ?? 0,
      total: () => sum(scenario.weeks, (week) => week.sections.personnel["social-charges"] ?? 0),
    },
    {
      label: "Total flux de personnel",
      kind: "subtotal",
      value: (week) => week.totals.totalPersonnel,
      total: () => sum(scenario.weeks, (week) => week.totals.totalPersonnel),
    },
    { label: "TVA", kind: "section", value: () => "" },
    { label: "TVA collectee", value: (week) => week.sections.tva.collectee, total: () => sum(scenario.weeks, (week) => week.sections.tva.collectee) },
    { label: "TVA deductible achats", value: (week) => week.sections.tva.deductibleAchats, total: () => sum(scenario.weeks, (week) => week.sections.tva.deductibleAchats) },
    { label: "TVA deductible charges", value: (week) => week.sections.tva.deductibleCharges, total: () => sum(scenario.weeks, (week) => week.sections.tva.deductibleCharges) },
    { label: "TVA deductible investissements", value: (week) => week.sections.tva.deductibleInvest, total: () => sum(scenario.weeks, (week) => week.sections.tva.deductibleInvest) },
    { label: "Solde TVA semaine", value: (week) => week.sections.tva.solde, total: () => sum(scenario.weeks, (week) => week.sections.tva.solde) },
    { label: "TVA a decaisser", kind: "subtotal", value: (week) => week.sections.tva.aDecaisser, total: () => sum(scenario.weeks, (week) => week.sections.tva.aDecaisser) },
    { label: "FLUX D'INVESTISSEMENT", kind: "section", value: () => "" },
    ...TFT_CATALOG.filter((line) => ["initial-investment-ht", "initial-deposit"].includes(line.computation) && active.has(line.id)).map((line) => ({
      label: line.label,
      value: (week: TftWeekRow) => week.sections.investissement[line.id] ?? 0,
      total: () => sum(scenario.weeks, (week) => week.sections.investissement[line.id] ?? 0),
    })),
    {
      label: "Total flux d'investissement",
      kind: "subtotal",
      value: (week) => week.totals.totalInvestissement,
      total: () => sum(scenario.weeks, (week) => week.totals.totalInvestissement),
    },
    { label: "FLUX DE FINANCEMENT", kind: "section", value: () => "" },
    { label: "Apports des associes", value: (week) => week.sections.financement["associate-contribution"] ?? 0, total: () => sum(scenario.weeks, (week) => week.sections.financement["associate-contribution"] ?? 0) },
    { label: "Emprunt bancaire", value: (week) => week.sections.financement["bank-loan"] ?? 0, total: () => sum(scenario.weeks, (week) => week.sections.financement["bank-loan"] ?? 0) },
    { label: "Remboursement capital emprunt", value: (week) => week.sections.financement["loan-capital-repayment"] ?? 0, total: () => sum(scenario.weeks, (week) => week.sections.financement["loan-capital-repayment"] ?? 0) },
    { label: "Interets emprunt", value: (week) => week.sections.financement["loan-interest"] ?? 0, total: () => sum(scenario.weeks, (week) => week.sections.financement["loan-interest"] ?? 0) },
    {
      label: "Total flux de financement net",
      kind: "subtotal",
      value: (week) => week.totals.totalFinancement,
      total: () => sum(scenario.weeks, (week) => week.totals.totalFinancement),
    },
    { label: "IMPOT SUR LES SOCIETES", kind: "section", value: () => "" },
    { label: "IS acomptes", value: (week) => week.sections.is, total: () => 0 },
    { label: "SYNTHESE TRESORERIE", kind: "section", value: () => "" },
    { label: "Variation semaine", kind: "subtotal", value: (week) => week.totals.variation, total: () => sum(scenario.weeks, (week) => week.totals.variation) },
    { label: "Tresorerie debut semaine", value: (week) => week.totals.cashStart },
    { label: "Tresorerie FIN de semaine", kind: "cash", value: (week) => week.totals.cashEnd },
    { label: "INDICATEURS", kind: "section", value: () => "" },
    { label: "Tresorerie minimum cumulee", value: (week) => Math.min(...scenario.weeks.slice(0, week.weekIndex).map((item) => item.totals.cashEnd)), total: () => scenario.indicators.minCash },
    { label: "CA cumule TTC", value: (week) => sum(scenario.weeks.slice(0, week.weekIndex), (item) => item.totals.totalEncaissements), total: () => scenario.indicators.cumulativeCA },
    { label: "Marge brute cumulee HT", value: () => "", total: () => scenario.indicators.cumulativeMargin },
  ];

  return (
    <section className="tft-panel tft-table-panel">
      <div className="tft-panel-head">
        <div>
          <p className="tft-panel-label">Onglet TFT</p>
          <h2 className="tft-panel-title">TFT {scenarioLabel}</h2>
        </div>
        <div className="tft-indicators">
          <span>Min {money.format(scenario.indicators.minCash)}</span>
          <span>CA {money.format(scenario.indicators.cumulativeCA)}</span>
        </div>
      </div>

      <div className="tft-table-scroll">
        <table className="tft-table">
          <thead>
            <tr>
              <th className="tft-sticky-col">Poste</th>
              <th className="tft-total-col">Total</th>
              {scenario.weeks.map((week) => (
                <th key={week.weekIndex}>
                  <span>S{week.weekIndex}</span>
                  <small>{dateFmt.format(week.weekStart)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`} className={`tft-row-${row.kind ?? "line"}`}>
                <td className="tft-sticky-col">{row.label}</td>
                <td className="tft-total-col">{row.total ? formatCell(row.total()) : ""}</td>
                {scenario.weeks.map((week) => {
                  const value = row.value(week);
                  const isAlert = row.kind === "cash" && typeof value === "number" && value < settings.cashAlertThreshold;
                  return (
                    <td key={week.weekIndex} className={isAlert ? "alert" : ""}>
                      {formatCell(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
