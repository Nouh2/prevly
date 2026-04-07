"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DashboardData,
  Deadline,
  RecurringCharge,
  FiscalProfile,
  FiscalSummary,
  LegalStatus,
  ActivitySector,
} from "@/types";
import { parseCSVContent, readFileAsText } from "@/lib/csvParser";
import {
  buildDashboardData,
  formatCurrency,
  formatDate,
  formatDateShort,
  formatDateDeadline,
  forecastColor,
} from "@/lib/analytics";
import FlowChart from "./FlowChart";

const STORAGE_KEY = "prevly_dashboard_v2";
const FISCAL_KEY = "prevly_fiscal_v1";

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
      recurringCharges: data.recurringCharges.map((c) => ({
        ...c,
        lastSeen: c.lastSeen.toISOString(),
      })),
      deadlines: data.deadlines.map((d) => ({
        ...d,
        date: d.date.toISOString(),
      })),
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
      recurringCharges: (payload.recurringCharges ?? []).map((c: { lastSeen: string } & Omit<RecurringCharge, "lastSeen">) => ({
        ...c,
        lastSeen: new Date(c.lastSeen),
      })),
      deadlines: (payload.deadlines ?? []).map((d: { date: string } & Omit<Deadline, "date">) => ({
        ...d,
        date: new Date(d.date),
      })),
      recommendations: payload.recommendations ?? [],
      monthlyRecurring: payload.monthlyRecurring ?? 0,
    };
  } catch {
    return null;
  }
}

function saveFiscalProfile(profile: FiscalProfile): void {
  try {
    localStorage.setItem(FISCAL_KEY, JSON.stringify(profile));
  } catch {
    // fail silently
  }
}

function loadFiscalProfile(): FiscalProfile | null {
  try {
    const raw = localStorage.getItem(FISCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FiscalProfile;
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
  const [fiscalProfile, setFiscalProfile] = useState<FiscalProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fiscalProfileRef = useRef<FiscalProfile | null>(null);

  useEffect(() => {
    const profile = loadFiscalProfile();
    fiscalProfileRef.current = profile;
    setFiscalProfile(profile);

    const saved = loadFromStorage();
    if (saved) {
      if (profile) {
        // Recompute with fiscal profile to get fresh fiscal data
        const fresh = buildDashboardData(saved.transactions, profile);
        setData(fresh);
      } else {
        setData(saved);
      }
    } else if (!profile) {
      // New user — show onboarding before CSV import
      setShowOnboarding(true);
    }
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
      const dashboard = buildDashboardData(
        result.transactions,
        fiscalProfileRef.current ?? undefined
      );
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

  const handleOnboardingComplete = useCallback((profile: FiscalProfile) => {
    fiscalProfileRef.current = profile;
    setFiscalProfile(profile);
    saveFiscalProfile(profile);
    setShowOnboarding(false);
    // If data was already loaded (rare edge case), recompute with new profile
    setData((prev) => {
      if (!prev) return prev;
      const fresh = buildDashboardData(prev.transactions, profile);
      saveToStorage(fresh);
      return fresh;
    });
  }, []);

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
        {importError && (
          <div className="db-error-banner" role="alert">
            {importError}{" "}
            <a href="#" style={{ color: "inherit", textDecoration: "underline" }}>
              Voir le guide d&apos;import
            </a>
          </div>
        )}

        {showOnboarding ? (
          <FiscalOnboarding onComplete={handleOnboardingComplete} />
        ) : !data ? (
          <EmptyState
            onFileSelected={handleFile}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            openFilePicker={openFilePicker}
          />
        ) : (
          <DashboardView
            data={data}
            fiscalProfile={fiscalProfile}
            onConfigureFiscal={() => setShowOnboarding(true)}
          />
        )}
      </main>
    </div>
  );
}

// ── Fiscal onboarding wizard ──────────────────────────────────────────────────

const LEGAL_STATUSES: { value: LegalStatus; label: string }[] = [
  { value: "auto-entrepreneur", label: "Auto-entrepreneur" },
  { value: "entreprise-individuelle", label: "Entreprise individuelle" },
  { value: "eurl", label: "EURL" },
  { value: "sasu", label: "SASU" },
  { value: "sarl", label: "SARL" },
  { value: "sas", label: "SAS" },
];

const SECTORS: { value: ActivitySector; label: string }[] = [
  { value: "vente-marchandises", label: "Vente de marchandises" },
  { value: "prestations-services", label: "Prestations de services" },
  { value: "liberal", label: "Activité libérale" },
  { value: "artisan", label: "Artisan" },
  { value: "restauration", label: "Restauration / Hôtellerie" },
  { value: "btp", label: "BTP" },
  { value: "autre", label: "Autre" },
];

function FiscalOnboarding({ onComplete }: { onComplete: (p: FiscalProfile) => void }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [legalStatus, setLegalStatus] = useState<LegalStatus | null>(null);
  const [sector, setSector] = useState<ActivitySector | null>(null);
  const [creationYear, setCreationYear] = useState<string>("");
  const [creationMonth, setCreationMonthVal] = useState<string>("");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - i);
  const months = [
    { v: "01", l: "Janvier" }, { v: "02", l: "Février" }, { v: "03", l: "Mars" },
    { v: "04", l: "Avril" }, { v: "05", l: "Mai" }, { v: "06", l: "Juin" },
    { v: "07", l: "Juillet" }, { v: "08", l: "Août" }, { v: "09", l: "Septembre" },
    { v: "10", l: "Octobre" }, { v: "11", l: "Novembre" }, { v: "12", l: "Décembre" },
  ];

  const handleSubmit = () => {
    if (!legalStatus || !sector || !creationYear || !creationMonth) return;
    onComplete({
      legalStatus,
      sector,
      creationMonth: `${creationYear}-${creationMonth}`,
    });
  };

  return (
    <div className="fiscal-onboarding">
      <div className="fiscal-onboarding-header">
        <div className="fiscal-onboarding-steps">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`fiscal-step-dot${i === step ? " active" : i < step ? " done" : ""}`}
            />
          ))}
        </div>
        <p className="fiscal-onboarding-sub">
          {step === 0 && "Étape 1 sur 3"}
          {step === 1 && "Étape 2 sur 3"}
          {step === 2 && "Étape 3 sur 3"}
        </p>
      </div>

      {step === 0 && (
        <div className="fiscal-onboarding-step">
          <p className="fiscal-onboarding-title">Quel est votre statut juridique ?</p>
          <p className="fiscal-onboarding-desc">
            Prevly adapte vos obligations fiscales à votre statut.
          </p>
          <div className="fiscal-choice-grid">
            {LEGAL_STATUSES.map(({ value, label }) => (
              <button
                key={value}
                className={`fiscal-choice-btn${legalStatus === value ? " selected" : ""}`}
                onClick={() => {
                  setLegalStatus(value);
                  setTimeout(() => setStep(1), 180);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="fiscal-onboarding-step">
          <p className="fiscal-onboarding-title">Quel est votre secteur d&apos;activité ?</p>
          <p className="fiscal-onboarding-desc">
            Le secteur détermine vos taux de TVA et cotisations applicables.
          </p>
          <div className="fiscal-choice-grid">
            {SECTORS.map(({ value, label }) => (
              <button
                key={value}
                className={`fiscal-choice-btn${sector === value ? " selected" : ""}`}
                onClick={() => {
                  setSector(value);
                  setTimeout(() => setStep(2), 180);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="fiscal-back-btn" onClick={() => setStep(0)}>
            ← Retour
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="fiscal-onboarding-step">
          <p className="fiscal-onboarding-title">Quand avez-vous créé votre entreprise ?</p>
          <p className="fiscal-onboarding-desc">
            Utilisé pour détecter votre première année d&apos;activité et les aides applicables (ACRE…).
          </p>
          <div className="fiscal-date-row">
            <select
              className="fiscal-select"
              value={creationMonth}
              onChange={(e) => setCreationMonthVal(e.target.value)}
            >
              <option value="">Mois</option>
              {months.map(({ v, l }) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select
              className="fiscal-select"
              value={creationYear}
              onChange={(e) => setCreationYear(e.target.value)}
            >
              <option value="">Année</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
          <button
            className="fiscal-submit-btn"
            onClick={handleSubmit}
            disabled={!creationYear || !creationMonth}
          >
            Accéder à mon dashboard →
          </button>
          <button className="fiscal-back-btn" onClick={() => setStep(1)}>
            ← Retour
          </button>
        </div>
      )}
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

function DashboardView({
  data,
  fiscalProfile,
  onConfigureFiscal,
}: {
  data: DashboardData;
  fiscalProfile: FiscalProfile | null;
  onConfigureFiscal: () => void;
}) {
  const {
    currentBalance,
    lastTransactionDate,
    healthScore,
    forecast,
    monthlyRecurring,
    alerts,
    monthlyFlows,
    transactions,
    recurringCharges,
    deadlines,
    recommendations,
    fiscalSummary,
  } = data;

  const recent10 = [...transactions].reverse().slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Smart Alerts ── */}
      {alerts.length > 0 && (
        <div className="db-smart-alerts">
          {alerts.map((alert, i) => (
            <div key={i} className={`db-smart-alert ${alert.severity}`}>
              <p className="db-smart-alert-title">{alert.title}</p>
              <p className="db-smart-alert-text">{alert.message}</p>
              {alert.action && (
                <span className="db-smart-alert-action">{alert.action} →</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Row 1: Balance + Score ── */}
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
            <span className="db-score-number" style={{ color: healthScore.color }}>
              {healthScore.score}
            </span>
            <span className="db-score-denom">/100</span>
          </div>
          <div className="db-health-bar-track">
            <div
              className="db-health-bar-fill"
              style={{ width: `${healthScore.score}%`, background: healthScore.color }}
            />
          </div>
          <p className="db-score-label" style={{ color: healthScore.color }}>
            {healthScore.label}
          </p>
          {healthScore.explanation.length > 0 && (
            <div className="db-score-why">
              <p className="db-score-why-title">Pourquoi ce score ?</p>
              <ul className="db-score-why-list">
                {healthScore.explanation.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Forecast ── */}
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

        {/* Recurring charges summary */}
        {recurringCharges.length > 0 && (
          <div className="db-recurring-summary">
            <p className="db-recurring-title">Charges récurrentes intégrées dans les prévisions :</p>
            <div className="db-recurring-list">
              {recurringCharges.slice(0, 4).map((c, i) => (
                <span key={i} className="db-recurring-chip">
                  {shortLabelUI(c.label)} {c.frequency === "monthly" ? `−${formatCurrency(Math.abs(c.amount))}/mois` : `−${formatCurrency(Math.abs(c.amount))}/trim.`}
                </span>
              ))}
              {recurringCharges.length > 4 && (
                <span className="db-recurring-chip db-recurring-more">
                  +{recurringCharges.length - 4} autre{recurringCharges.length - 4 > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Row 3: Chart ── */}
      <div className="db-card">
        <p className="db-card-label">Flux — historique & prévisions 90 jours</p>
        <FlowChart
          monthlyFlows={monthlyFlows.slice(-6)}
          forecast={forecast}
          currentBalance={currentBalance}
        />
      </div>

      {/* ── Row 4: Deadlines ── */}
      {deadlines.length > 0 && (
        <div className="db-card">
          <p className="db-card-label">Prochaines échéances</p>
          <div className="db-deadlines-list">
            {deadlines.map((d, i) => (
              <div key={i} className="db-deadline-item">
                <div className="db-deadline-left">
                  <span className="db-deadline-date">{formatDateDeadline(d.date)}</span>
                  {d.isFiscal && d.fiscalTag && (
                    <span className="db-fiscal-tag">{d.fiscalTag}</span>
                  )}
                  <span className="db-deadline-label" title={d.label}>
                    {shortLabelUI(d.label)}
                  </span>
                  <span className="db-deadline-amount">
                    {formatCurrency(d.amount)}
                  </span>
                </div>
                <div className="db-deadline-right">
                  <span className="db-deadline-balance-label">Solde estimé</span>
                  <span
                    className={`db-deadline-balance ${d.balanceStatus}`}
                  >
                    {formatCurrency(d.estimatedBalance)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Contextual deadline alert */}
          {deadlines.some((d) => d.balanceStatus === "red") && (() => {
            const redDeadline = deadlines.find((d) => d.balanceStatus === "red")!;
            const nextAfter = deadlines.find((d) => d.date > redDeadline.date);
            return (
              <div className="db-deadline-warning">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M7 4.5V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <circle cx="7" cy="9.5" r=".65" fill="currentColor"/>
                </svg>
                <span>
                  Votre {shortLabelUI(redDeadline.label)} du {formatDateDeadline(redDeadline.date)} ramènera votre solde à {formatCurrency(redDeadline.estimatedBalance)}.
                  {nextAfter && ` À ce rythme, votre ${shortLabelUI(nextAfter.label)} du ${formatDateDeadline(nextAfter.date)} sera difficile à couvrir. Anticipez dès maintenant.`}
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Row 5: Fiscal card ── */}
      {fiscalSummary ? (
        <FiscalCard
          fiscalSummary={fiscalSummary}
          currentBalance={currentBalance}
          fiscalProfile={fiscalProfile}
        />
      ) : !fiscalProfile ? (
        <FiscalSetupPrompt onConfigure={onConfigureFiscal} />
      ) : null}

      {/* ── Row 6: Transactions + AI CFO ── */}
      <div className="db-grid-2">
        <div className="db-card">
          <p className="db-card-label">Transactions récentes</p>
          <div className="db-txn-list">
            {recent10.map((tx, i) => (
              <div key={i} className="db-txn-item">
                <div className="db-txn-info">
                  <span className="db-txn-date">{formatDateShort(tx.date)}</span>
                  <span className="db-txn-label" title={tx.label}>
                    {tx.label.length > 40 ? tx.label.slice(0, 40) + "…" : tx.label}
                  </span>
                </div>
                <span className={`db-txn-amount ${tx.amount >= 0 ? "positive" : "negative"}`}>
                  {tx.amount >= 0 ? "+" : ""}
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="db-card db-ai-cfo" aria-hidden="true">
          <div className="db-ai-badge">Bientôt disponible</div>
          <p className="db-ai-title">Votre expert-comptable IA</p>
          <p className="db-ai-desc">
            Posez vos questions en langage naturel &mdash; URSSAF, TVA,
            cotisations. Disponible très prochainement.
          </p>
        </div>
      </div>

      {/* ── Row 7: Recommendations ── */}
      {recommendations.length > 0 && (
        <div className="db-card db-reco-card">
          <p className="db-card-label">Ce que Prevly vous recommande</p>
          <div className="db-reco-list">
            {recommendations.map((r, i) => (
              <div key={i} className="db-reco-item">
                <p className="db-reco-action">— {r.action}</p>
                <p className="db-reco-impact">{r.impact}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Fiscal card ───────────────────────────────────────────────────────────────

function FiscalCard({
  fiscalSummary,
  currentBalance,
  fiscalProfile,
}: {
  fiscalSummary: FiscalSummary;
  currentBalance: number;
  fiscalProfile: FiscalProfile | null;
}) {
  const {
    tvaRegime,
    tvaEstimated,
    vatRate,
    isApplicable,
    isEstimated,
    beneficeImposable,
    cotisationsEstimated,
    totalQuarterlyProvisioning,
    monthlySuggested,
    isFirstYear,
    acreApplicable,
    acreSavings,
    annualCAEstimate,
    tvaThreshold,
    tvaThresholdPct,
  } = fiscalSummary;

  // Color for the total provisioning amount
  const totalRatio = currentBalance > 0 ? totalQuarterlyProvisioning / currentBalance : 0;
  const totalColor =
    totalRatio > 0.4 ? "var(--red)" : totalRatio > 0.2 ? "var(--orange)" : "var(--text)";

  // Next quarterly TVA deadline label
  const now = new Date();
  const tvaDeadlineLabel = getTvaDeadlineLabelForQuarter(now, tvaRegime);

  return (
    <div className="db-card">
      <p className="db-card-label">Mes obligations fiscales</p>

      {/* ACRE / First year notice */}
      {acreApplicable && (
        <div className="db-fiscal-acre-notice">
          <span className="db-fiscal-acre-icon">★</span>
          <div>
            <p className="db-fiscal-acre-title">ACRE — Première année d&apos;activité</p>
            <p className="db-fiscal-acre-text">
              Vos cotisations sont réduites de 50% cette année.{" "}
              {acreSavings > 0 && (
                <>Économie estimée : <strong>{formatCurrency(acreSavings)}/mois</strong>.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* IS first year notice */}
      {isApplicable && isFirstYear && (
        <div className="db-fiscal-notice">
          Pas d&apos;acompte IS requis pour votre première année d&apos;exercice.
        </div>
      )}

      {/* TVA regime info */}
      {tvaRegime === "franchise" && (
        <div className="db-fiscal-notice">
          Vous êtes en franchise de TVA — vous ne facturez pas de TVA.
          {tvaThresholdPct >= 80 && (
            <strong> Attention : vous avez atteint {tvaThresholdPct}% du seuil ({formatCurrency(tvaThreshold)}).</strong>
          )}
        </div>
      )}

      {/* Quarterly summary table */}
      <div className="db-fiscal-rows">
        {/* TVA line */}
        <div className="db-fiscal-row">
          <div className="db-fiscal-row-label">
            <span className="db-fiscal-row-name">
              {tvaRegime === "franchise"
                ? "TVA"
                : tvaRegime === "simplifie"
                ? "TVA trimestrielle"
                : "TVA mensuelle"}
            </span>
            {tvaDeadlineLabel && (
              <span className="db-fiscal-row-due">Échéance : {tvaDeadlineLabel}</span>
            )}
          </div>
          <span className="db-fiscal-row-amount">
            {tvaRegime === "franchise"
              ? "Non applicable"
              : formatCurrency(tvaEstimated)}
          </span>
        </div>

        {/* Cotisations line */}
        <div className="db-fiscal-row">
          <div className="db-fiscal-row-label">
            <span className="db-fiscal-row-name">Cotisations sociales</span>
            <span className="db-fiscal-row-due">
              Mensuel — {formatCurrency(cotisationsEstimated)}/mois
              {acreApplicable && <> (taux ACRE)</>}
            </span>
          </div>
          <span className="db-fiscal-row-amount">
            {formatCurrency(cotisationsEstimated * 3)}
            <span className="db-fiscal-row-period"> /trimestre</span>
          </span>
        </div>

        {/* IS / IR line */}
        <div className="db-fiscal-row">
          <div className="db-fiscal-row-label">
            <span className="db-fiscal-row-name">
              {isApplicable ? "Impôt sur les sociétés" : "Bénéfice imposable (IR)"}
            </span>
            {isApplicable && !isFirstYear && isEstimated > 0 && (
              <span className="db-fiscal-row-due">Acompte trimestriel</span>
            )}
            {isApplicable && isFirstYear && (
              <span className="db-fiscal-row-due">Exonéré — 1ère année</span>
            )}
            {!isApplicable && (
              <span className="db-fiscal-row-due">Imposé à votre taux marginal IR</span>
            )}
          </div>
          <span className="db-fiscal-row-amount">
            {isApplicable
              ? isFirstYear
                ? "—"
                : formatCurrency(isEstimated)
              : formatCurrency(beneficeImposable)}
          </span>
        </div>

        {/* Divider */}
        <div className="db-fiscal-divider" />

        {/* Total */}
        <div className="db-fiscal-total-row">
          <span className="db-fiscal-total-label">Total à provisionner ce trimestre</span>
          <span className="db-fiscal-total-amount" style={{ color: totalColor }}>
            {formatCurrency(totalQuarterlyProvisioning)}
          </span>
        </div>

        {/* Monthly suggestion */}
        {monthlySuggested > 0 && (
          <div className="db-fiscal-monthly-suggest">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7 4v4M7 10v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Montant suggéré à mettre de côté ce mois-ci :{" "}
            <strong>{formatCurrency(monthlySuggested)}</strong>
          </div>
        )}
      </div>

      {/* TVA rate info */}
      {tvaRegime !== "franchise" && (
        <p className="db-fiscal-note">
          TVA calculée au taux de {Math.round(vatRate * 100)}%. Vérifiez le taux applicable à votre activité.
        </p>
      )}

      {/* Disclaimer */}
      <p className="db-fiscal-disclaimer">
        Estimations calculées sur la base des données importées. Consultez votre expert-comptable pour validation.
      </p>
    </div>
  );
}

/** Returns a human-readable label for the next TVA deadline */
function getTvaDeadlineLabelForQuarter(
  now: Date,
  regime: FiscalSummary["tvaRegime"]
): string | null {
  if (regime === "franchise") return null;
  if (regime === "simplifie") {
    const month = now.getMonth(); // 0-indexed
    const year = now.getFullYear();
    // Quarterly: 15 avril (3), 15 juillet (6), 15 octobre (9), 15 janvier (0)
    if (month <= 2) return `15 avril ${year}`;
    if (month <= 5) return `15 juillet ${year}`;
    if (month <= 8) return `15 octobre ${year}`;
    return `15 janvier ${year + 1}`;
  }
  // Normal: next month's 15th
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(next);
}

// ── Fiscal setup prompt (no profile yet, but has data) ───────────────────────

function FiscalSetupPrompt({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="db-card db-fiscal-setup-prompt">
      <p className="db-card-label">Mes obligations fiscales</p>
      <p className="db-fiscal-setup-text">
        Configurez votre profil fiscal pour voir vos obligations TVA, cotisations et IS personnalisées.
      </p>
      <button className="db-fiscal-setup-btn" onClick={onConfigure}>
        Configurer mon profil fiscal →
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortLabelUI(label: string): string {
  const words = label.trim().split(/\s+/).slice(0, 3).join(" ");
  return words.length > 28 ? words.slice(0, 28) + "…" : words;
}
