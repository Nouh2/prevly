"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TftScenario } from "@/lib/tft/types";

interface Props {
  previ: TftScenario;
  objectif: TftScenario;
  threshold: number;
}

const money = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export default function TftComparisonChart({ previ, objectif, threshold }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="tft-chart-card">Chargement du graphique...</div>;
  }

  const data = previ.weeks.map((week, index) => ({
    week: `S${week.weekIndex}`,
    previsionnel: week.totals.cashEnd,
    objectif: objectif.weeks[index]?.totals.cashEnd ?? 0,
  }));

  return (
    <div className="tft-chart-card">
      <div className="tft-chart-head">
        <div>
          <p className="tft-panel-label">Comparatif</p>
          <h2 className="tft-panel-title">Tresorerie fin de semaine</h2>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 18, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="rgba(26,26,26,.07)" vertical={false} />
          <ReferenceArea x1="S1" x2="S4" fill="rgba(26,26,26,.06)" strokeOpacity={0} />
          <ReferenceLine y={threshold} stroke="#DC4545" strokeDasharray="5 4" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--text-light)" }} interval={5} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-light)" }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
          <Tooltip
            formatter={(value: number, name: string) => [money.format(value), name === "objectif" ? "Objectif" : "Previsionnel"]}
            contentStyle={{
              background: "var(--white)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "var(--shadow)",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          />
          <Line type="monotone" dataKey="previsionnel" stroke="#5B4FE8" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="objectif" stroke="#3DAA7A" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
