"use client";

import { useMemo, useState } from "react";
import { TFT_CATALOG, TFT_SECTION_LABELS } from "@/lib/tft/catalog";
import type { TftAssumptions, TftScenarioKey, TftSection } from "@/lib/tft/types";

interface Props {
  assumptions: TftAssumptions;
  onChange: (assumptions: TftAssumptions) => void;
  onLoadDao: () => void;
}

const SECTIONS = Object.keys(TFT_SECTION_LABELS) as TftSection[];
const MONTHS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"];

export default function TftAssumptionsPanel({ assumptions, onChange, onLoadDao }: Props) {
  const [openSections, setOpenSections] = useState<Record<TftSection, boolean>>(
    () => Object.fromEntries(SECTIONS.map((section) => [section, true])) as Record<TftSection, boolean>
  );

  const enabled = useMemo(() => new Set(assumptions.enabledLineIds), [assumptions.enabledLineIds]);
  const seasonalityWarning =
    Math.abs(assumptions.seasonality.previ.reduce((s, v) => s + v, 0) - 1) > 0.001 ||
    Math.abs(assumptions.seasonality.obj.reduce((s, v) => s + v, 0) - 1) > 0.001;

  const toggleLine = (id: string) => {
    onChange({
      ...assumptions,
      enabledLineIds: enabled.has(id)
        ? assumptions.enabledLineIds.filter((lineId) => lineId !== id)
        : [...assumptions.enabledLineIds, id],
    });
  };

  const updateValue = (id: string, scenario: TftScenarioKey, value: number) => {
    onChange({
      ...assumptions,
      values: {
        ...assumptions.values,
        [id]: {
          previ: assumptions.values[id]?.previ ?? 0,
          obj: assumptions.values[id]?.obj ?? 0,
          [scenario]: value,
        },
      },
    });
  };

  const updateSeasonality = (scenario: TftScenarioKey, index: number, value: number) => {
    const next = [...assumptions.seasonality[scenario]];
    next[index] = value / 100;
    onChange({
      ...assumptions,
      seasonality: { ...assumptions.seasonality, [scenario]: next },
    });
  };

  return (
    <section className="tft-panel">
      <div className="tft-panel-head">
        <div>
          <p className="tft-panel-label">Onglet 2</p>
          <h2 className="tft-panel-title">Hypotheses</h2>
        </div>
        <button className="tft-secondary-btn" onClick={onLoadDao}>
          Charger le modele DAO
        </button>
      </div>

      <div className="tft-seasonality">
        <div className="tft-section-title-row">
          <h3>Saisonnalite du CA</h3>
          {seasonalityWarning && <span className="tft-warning">La somme doit faire 100%</span>}
        </div>
        <div className="tft-seasonality-grid">
          {MONTHS.map((month, index) => (
            <div key={month} className="tft-seasonality-cell">
              <span>{month}</span>
              <input
                type="number"
                value={Math.round((assumptions.seasonality.previ[index] ?? 0) * 10000) / 100}
                onChange={(event) => updateSeasonality("previ", index, Number(event.target.value))}
                aria-label={`${month} previsionnel`}
              />
              <input
                type="number"
                value={Math.round((assumptions.seasonality.obj[index] ?? 0) * 10000) / 100}
                onChange={(event) => updateSeasonality("obj", index, Number(event.target.value))}
                aria-label={`${month} objectif`}
              />
            </div>
          ))}
        </div>
      </div>

      {SECTIONS.map((section) => {
        const lines = TFT_CATALOG.filter((line) => line.section === section);
        return (
          <div key={section} className="tft-assumption-section">
            <button
              className="tft-section-toggle"
              onClick={() => setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))}
            >
              <span>{TFT_SECTION_LABELS[section]}</span>
              <span>{openSections[section] ? "Masquer" : "Afficher"}</span>
            </button>
            {openSections[section] && (
              <div className="tft-assumption-table">
                <div className="tft-assumption-head">
                  <span>Poste</span>
                  <span>Previ</span>
                  <span>Objectif</span>
                </div>
                {lines.map((line) => {
                  const active = enabled.has(line.id);
                  return (
                    <div key={line.id} className={`tft-assumption-row${active ? "" : " disabled"}`}>
                      <label className="tft-check-label" title={line.comment}>
                        <input type="checkbox" checked={active} onChange={() => toggleLine(line.id)} />
                        <span>{line.label}</span>
                        <small>{line.unit}</small>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!active}
                        value={assumptions.values[line.id]?.previ ?? 0}
                        onChange={(event) => updateValue(line.id, "previ", Number(event.target.value))}
                      />
                      <input
                        type="number"
                        step="0.01"
                        disabled={!active}
                        value={assumptions.values[line.id]?.obj ?? 0}
                        onChange={(event) => updateValue(line.id, "obj", Number(event.target.value))}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
