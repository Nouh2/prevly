"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { MonthlyFlow } from "@/types";

interface Props {
  monthlyFlows: MonthlyFlow[];
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

export default function FlowChart({ monthlyFlows }: Props) {
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

  const data = monthlyFlows.map((m) => ({
    name: formatMonth(m.month),
    Entrées: m.income,
    Sorties: m.expenses,
  }));

  // On mobile, if more than 4 months let the chart scroll
  const minWidth = Math.max(320, data.length * 80);

  return (
    <div className="db-chart-outer">
      <div className="db-chart-inner" style={{ minWidth }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
            barCategoryGap="28%"
          >
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
                name,
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
            />
            <Bar dataKey="Entrées" fill="#5B4FE8" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Sorties" fill="#E8834F" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
