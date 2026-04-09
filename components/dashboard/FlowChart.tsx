"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import type { MonthlyFlow } from "@/types";

interface Props {
  monthlyFlows: MonthlyFlow[];
  forecast?: { j30: number; j60: number; j90: number };
  currentBalance?: number;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1, 1);
  return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date);
}

function formatEur(value: number): string {
  if (Math.abs(value) >= 1000) {
    return (value / 1000).toFixed(1).replace(".", ",") + "k\u00a0€";
  }
  return value + "\u00a0€";
}

/** Simple linear regression to compute trend line points */
function computeTrend(nets: number[]): number[] {
  const n = nets.length;
  if (n < 2) return nets.map(() => nets[0] ?? 0);
  const xMean = (n - 1) / 2;
  const yMean = nets.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (nets[i] - yMean);
    den += Math.pow(i - xMean, 2);
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  return nets.map((_, i) => Math.round(intercept + slope * i));
}

/** Get next month label */
function nextMonthLabel(monthStr: string, offset: number): string {
  const [year, m] = monthStr.split("-").map(Number);
  const date = new Date(year, m - 1 + offset, 1);
  return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date);
}

export default function FlowChart({ monthlyFlows, forecast, currentBalance = 0 }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <span style={{ fontSize: 13, color: "var(--text-light)" }}>
          Chargement du graphique...
        </span>
      </div>
    );
  }

  const histData = monthlyFlows.map((m, i) => {
    const nets = monthlyFlows.map((x) => x.net);
    const trend = computeTrend(nets);
    return {
      name: formatMonth(m.month),
      Entrées: m.income,
      Sorties: m.expenses,
      tendance: trend[i],
      isForecast: false,
    };
  });

  // Compute trend slope to extend into forecast months
  const nets = monthlyFlows.map((m) => m.net);
  const n = nets.length;
  let trendSlope = 0;
  let trendIntercept = 0;
  if (n >= 2) {
    const xMean = (n - 1) / 2;
    const yMean = nets.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (nets[i] - yMean);
      den += Math.pow(i - xMean, 2);
    }
    trendSlope = den !== 0 ? num / den : 0;
    trendIntercept = yMean - trendSlope * xMean;
  }

  // Build projected income/expense from forecast net values
  const lastMonth = monthlyFlows[monthlyFlows.length - 1]?.month ?? "2024-01";
  const avgIncome = monthlyFlows.slice(-3).reduce((s, m) => s + m.income, 0) / Math.min(monthlyFlows.length, 3);

  const forecastNets = forecast
    ? [
        forecast.j30 - currentBalance,
        forecast.j60 - forecast.j30,
        forecast.j90 - forecast.j60,
      ]
    : [];

  const forecastData = forecast
    ? forecastNets.map((net, i) => {
        const projIncome = Math.max(0, avgIncome + trendSlope * (i + 1) * 0.5);
        const projExpense = Math.max(0, projIncome - net);
        return {
          name: nextMonthLabel(lastMonth, i + 1),
          Entrées: Math.round(projIncome),
          Sorties: Math.round(projExpense),
          tendance: Math.round(trendIntercept + trendSlope * (n + i)),
          isForecast: true,
        };
      })
    : [];

  const data = [...histData, ...forecastData];
  const firstForecastName = forecastData[0]?.name;

  const minWidth = Math.max(320, data.length * 72);

  return (
    <div className="db-chart-outer">
      <div className="db-chart-inner" style={{ minWidth }}>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
            barCategoryGap="28%"
          >
            {/* Forecast zone shading */}
            {firstForecastName && (
              <ReferenceArea
                x1={firstForecastName}
                x2={forecastData[forecastData.length - 1]?.name}
                fill="rgba(91,79,232,0.04)"
                stroke="rgba(91,79,232,0.12)"
                strokeDasharray="4 3"
              />
            )}

            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--text-light)", fontFamily: "inherit" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--text-light)", fontFamily: "inherit" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatEur}
              width={60}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
                }).format(value),
                name === "tendance" ? "Tendance nette" : name,
              ]}
              contentStyle={{
                background: "var(--white)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                fontFamily: "inherit",
                fontSize: 13,
                color: "var(--text)",
                boxShadow: "var(--shadow)",
              }}
              labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              cursor={{ fill: "rgba(26,26,26,.04)" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, fontFamily: "inherit", paddingTop: 8 }}
              formatter={(value) => (value === "tendance" ? "Tendance nette" : value)}
            />

            {/* Historical bars - full opacity */}
            <Bar
              dataKey="Entrées"
              fill="#5B4FE8"
              radius={[3, 3, 0, 0]}
              opacity={1}
              // Forecast bars get 50% opacity via cell rendering
            />
            <Bar
              dataKey="Sorties"
              fill="#E8834F"
              radius={[3, 3, 0, 0]}
            />

            {/* Trend line */}
            <Line
              type="monotone"
              dataKey="tendance"
              stroke="#5B4FE8"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3, fill: "#5B4FE8" }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {forecast && (
          <p className="db-chart-forecast-label">
            Zone grisée = prévisions 90 jours · Ligne pointillée = tendance nette
          </p>
        )}
      </div>
    </div>
  );
}
