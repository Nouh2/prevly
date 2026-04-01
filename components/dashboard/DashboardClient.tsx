"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DashboardData } from "@/types";
import { parseCSVContent, readFileAsText } from "@/lib/csvParser";
import { buildDashboardData, formatCurrency, formatDate, formatDateShort, forecastColor } from "@/lib/analytics";
import FlowChart from "./FlowChart";

const STORAGE_KEY = "prevly_dashboard_v1";

// ── Persistence ───────────────────────────────────────────────────────────────

function saveToStorage(data: DashboardData): void {
  try {
    const payload = {
      ...data,
      transactions: data.transactions.map((t) => ({
        ...t,
        date: t.date.toISOString(),
      })),
      lastTransactionDate: data.lastTransactionDate.toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or unavailable — fail silently
  }
}

function loadFromStorage(): DashboardData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return {
      ...payload,
      transactions: payload.transactions.map((t: { date: string; label: string; amount: number }) => ({
        ...t,
        date: new Date(t.date),
      })),
      lastTransactionDate: new Date(payload.lastTransactionDate),
    };
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) setData(saved);
  }, []);

  const processFile = useCallback(async (file: File) => {
    setImportError(null);
    try {
      const content = await readFileAsText(file);
      const result = parseCSVContent(content);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      const dashboard = buildDashboardData(result.transactions);
      setData(dashboard);
      saveToStorage(dashboard);
    } catch {
      setImportError(
        "Impossible de lire le fichier. Assurez-vous qu'il s'agit d'un fichier CSV valide."
      );
    }
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
        setImportError(
          "Format non reconnu. Importez un fichier .csv exporté depuis votre banque."
        );
        return;
      }
      if (data) {
        setPendingFile(file);
        setShowConfirm(true);
      } else {
        processFile(file);
      }
    },
    [data, processFile]
  );

  const confirmReplace = useCallback(() => {
    if (pendingFile) {
      processFile(pendingFile);
      setPendingFile(null);
    }
    setShowConfirm(false);
  }, [pendingFile, processFile]);

  const openFilePicker = () => fileInputRef.current?.click();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="db-page">
      {/* Header */}
      <header className="db-header">
        <a href="/" className="db-logo">
          Prev<span>ly</span>
        </a>
        {data && <span className="db-header-title">Dashboard</span>}
        <button className="db-import-btn" onClick={openFilePicker}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 10v1.5A1.5 1.5 0 002.5 13h9A1.5 1.5 0 0013 11.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Importer
        </button>
      </header>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="db-overlay" onClick={() => setShowConfirm(false)}>
          <div className="db-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="db-dialog-title">Remplacer les données existantes ?</p>
            <p className="db-dialog-text">
              Remplacer vos données actuelles par ce nouveau fichier ? Cette action est irréversible.
            </p>
            <div className="db-dialog-actions">
              <button className="db-btn-cancel" onClick={() => setShowConfirm(false)}>
                Annuler
              </button>
              <button className="db-btn-confirm" onClick={confirmReplace}>
                Remplacer
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="db-container">
        {/* Error banner */}
        {importError && (
          <div className="db-error-banner" role="alert">
            {importError}
            {" "}
            <a href="#" style={{ color: "inherit", textDecoration: "underline" }}>
              Voir le guide d&apos;import
            </a>
          </div>
        )}

        {/* Empty state */}
        {!data ? (
          <EmptyState
            onFileSelected={handleFile}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            openFilePicker={openFilePicker}
          />
        ) : (
          <DashboardView data={data} />
        )}
      </main>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  onFileSelected,
  isDragging,
  setIsDragging,
  openFilePicker,
}: {
  onFileSelected: (f: File) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  openFilePicker: () => void;
}) {
  return (
    <div className="db-empty">
      <svg className="db-empty-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="8" y="6" width="32" height="36" rx="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M16 18h16M16 24h16M16 30h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <div>
        <p className="db-empty-title">Importez vos relevés bancaires</p>
        <p className="db-empty-sub">
          Importez vos relevés des 6 derniers mois pour des prévisions fiables.
        </p>
      </div>
      <div
        className={`import-zone${isDragging ? " drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFileSelected(file);
        }}
        onClick={openFilePicker}
        role="button"
        tabIndex={0}
        aria-label="Zone d'import CSV"
        onKeyDown={(e) => e.key === "Enter" && openFilePicker()}
      >
        <svg className="import-zone-icon" viewBox="0 0 38 38" fill="none" aria-hidden="true">
          <path d="M19 4v20M11 12l8-8 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 28v4a2 2 0 002 2h26a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <p className="import-zone-title">
          {isDragging ? "Relâchez pour importer" : "Glissez votre fichier ici"}
        </p>
        <p className="import-zone-sub">ou</p>
        <button
          className="import-zone-btn"
          onClick={(e) => { e.stopPropagation(); openFilePicker(); }}
          type="button"
        >
          Sélectionner un fichier CSV
        </button>
        <p className="import-zone-hint">
          Formats supportés : exports CSV des banques françaises (BNP, Société Générale, LCL, CIC, Crédit Agricole…)
        </p>
      </div>
    </div>
  );
}

// ── Dashboard view ────────────────────────────────────────────────────────────

function DashboardView({ data }: { data: DashboardData }) {
  const { currentBalance, lastTransactionDate, healthScore, forecast, alerts, monthlyFlows, transactions } = data;

  const recent10 = [...transactions].reverse().slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="db-alerts">
          {alerts.map((alert, i) => (
            <div key={i} className={`db-alert-item ${alert.severity}`}>
              <svg className="db-alert-icon" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                {alert.severity === "red" ? (
                  <>
                    <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M7.5 4.5v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <circle cx="7.5" cy="10.5" r=".75" fill="currentColor"/>
                  </>
                ) : (
                  <>
                    <path d="M7.5 1.5 1.2 13.5h12.6L7.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    <path d="M7.5 5.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <circle cx="7.5" cy="11.5" r=".75" fill="currentColor"/>
                  </>
                )}
              </svg>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Row 1: Balance + Score */}
      <div className="db-grid-2">
        {/* Balance card */}
        <div className="db-card">
          <p className="db-card-label">Solde actuel</p>
          <p className="db-balance-amount">{formatCurrency(currentBalance)}</p>
          <p className="db-balance-date">
            Dernière transaction le {formatDate(lastTransactionDate)}
          </p>
        </div>

        {/* Score card */}
        <div className="db-card">
          <p className="db-card-label">Score de santé financière</p>
          <div className="db-score-row">
            <span
              className="db-score-number"
              style={{ color: healthScore.color }}
            >
              {healthScore.score}
            </span>
            <span className="db-score-denom">/100</span>
          </div>
          <div className="db-health-bar-track">
            <div
              className="db-health-bar-fill"
              style={{
                width: `${healthScore.score}%`,
                background: healthScore.color,
              }}
            />
          </div>
          <p className="db-score-label" style={{ color: healthScore.color }}>
            {healthScore.label}
          </p>
        </div>
      </div>

      {/* Row 2: Forecast */}
      <div className="db-card">
        <p className="db-card-label">Prévisions de trésorerie</p>
        <div className="db-forecast-grid">
          {(
            [
              { label: "J+30", value: forecast.j30 },
              { label: "J+60", value: forecast.j60 },
              { label: "J+90", value: forecast.j90 },
            ] as const
          ).map(({ label, value }) => (
            <div key={label} className="db-forecast-item">
              <p className="db-forecast-period">{label}</p>
              <p
                className="db-forecast-amount"
                style={{ color: forecastColor(value, currentBalance) }}
              >
                {formatCurrency(value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Chart */}
      <div className="db-card">
        <p className="db-card-label">Flux des 6 derniers mois</p>
        <FlowChart monthlyFlows={monthlyFlows.slice(-6)} />
      </div>

      {/* Row 4: Transactions + AI CFO */}
      <div className="db-grid-2">
        {/* Transactions */}
        <div className="db-card">
          <p className="db-card-label">Transactions récentes</p>
          <div className="db-txn-list">
            {recent10.map((tx, i) => (
              <div key={i} className="db-txn-item">
                <div className="db-txn-info">
                  <span className="db-txn-date">{formatDateShort(tx.date)}</span>
                  <span className="db-txn-label" title={tx.label}>
                    {tx.label.length > 40
                      ? tx.label.slice(0, 40) + "…"
                      : tx.label}
                  </span>
                </div>
                <span
                  className={`db-txn-amount ${tx.amount >= 0 ? "positive" : "negative"}`}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* AI CFO — coming soon */}
        <div className="db-card db-ai-cfo" aria-hidden="true">
          <div className="db-ai-badge">Bientôt disponible</div>
          <p className="db-ai-title">Votre expert-comptable IA</p>
          <p className="db-ai-desc">
            Posez vos questions en langage naturel &mdash; URSSAF, TVA,
            cotisations. Disponible très prochainement.
          </p>
        </div>
      </div>
    </div>
  );
}
