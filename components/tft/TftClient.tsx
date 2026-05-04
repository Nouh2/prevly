"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { computeScenario } from "@/lib/tft/computeTft";
import { buildDaoAssumptions, DEFAULT_TFT_ASSUMPTIONS, DEFAULT_TFT_SETTINGS } from "@/lib/tft/defaults";
import { loadTftFromStorage, saveTftToStorage } from "@/lib/tft/storage";
import type { TftAssumptions, TftSettings } from "@/lib/tft/types";
import TftAssumptionsPanel from "./TftAssumptions";
import TftOnboarding from "./TftOnboarding";
import TftSettingsPanel from "./TftSettings";
import TftTable from "./TftTable";

const AuthNav = dynamic(() => import("@/components/auth/AuthNav"), {
  ssr: false,
  loading: () => (
    <div className="auth-nav">
      <a href="/login">Connexion</a>
    </div>
  ),
});

const TftComparisonChart = dynamic(() => import("./TftComparisonChart"), {
  ssr: false,
  loading: () => <div className="tft-chart-card">Chargement du graphique...</div>,
});

async function loadRemoteTftStateSafe() {
  const { loadRemoteTftState } = await import("@/lib/supabase/sync");
  return loadRemoteTftState();
}

function saveRemoteTftStateSafe(settings: TftSettings, assumptions: TftAssumptions): void {
  void import("@/lib/supabase/sync").then(({ saveRemoteTftState }) =>
    saveRemoteTftState(settings, assumptions)
  );
}

type TabKey = "settings" | "assumptions" | "previ" | "obj";

const TABS: { key: TabKey; label: string }[] = [
  { key: "settings", label: "Parametres" },
  { key: "assumptions", label: "Hypotheses" },
  { key: "previ", label: "TFT Previsionnel" },
  { key: "obj", label: "TFT Objectif" },
];

export default function TftClient() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("settings");
  const [settings, setSettings] = useState<TftSettings>(DEFAULT_TFT_SETTINGS);
  const [assumptions, setAssumptions] = useState<TftAssumptions>(DEFAULT_TFT_ASSUMPTIONS);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const remote = await loadRemoteTftStateSafe();
      const saved = remote ?? loadTftFromStorage();
      if (cancelled) return;

      if (saved) {
        setSettings(saved.settings);
        setAssumptions(saved.assumptions);
        setShowOnboarding(!saved.assumptions.onboardingCompleted);
      } else {
        setShowOnboarding(true);
      }
      setMounted(true);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    saveTftToStorage({ settings, assumptions });
    saveRemoteTftStateSafe(settings, assumptions);
  }, [assumptions, mounted, settings]);

  const previScenario = useMemo(
    () => computeScenario(settings, assumptions, "previ"),
    [assumptions, settings]
  );
  const objScenario = useMemo(
    () => computeScenario(settings, assumptions, "obj"),
    [assumptions, settings]
  );

  const handleSave = () => {
    saveTftToStorage({ settings, assumptions });
    saveRemoteTftStateSafe(settings, assumptions);
    setSavedAt(new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
  };

  const loadDao = () => {
    setAssumptions((prev) => ({
      ...buildDaoAssumptions(),
      onboardingCompleted: prev.onboardingCompleted,
    }));
  };

  const completeOnboarding = (nextSettings: TftSettings, nextAssumptions: TftAssumptions) => {
    const completed = { ...nextAssumptions, onboardingCompleted: true };
    setSettings(nextSettings);
    setAssumptions(completed);
    saveTftToStorage({ settings: nextSettings, assumptions: completed });
    saveRemoteTftStateSafe(nextSettings, completed);
    setShowOnboarding(false);
    setActiveTab("settings");
  };

  if (!mounted) {
    return (
      <div className="tft-page">
        <div className="tft-loading">Chargement du TFT...</div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="tft-page">
        <TftHeader />
        <main className="tft-container">
          <TftOnboarding
            settings={settings}
            assumptions={assumptions}
            onComplete={completeOnboarding}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="tft-page">
      <TftHeader />
      <main className="tft-container">
        <div className="tft-title-row">
          <div>
            <p className="tft-kicker">Pilotage hebdomadaire</p>
            <h1 className="tft-title">Tresorerie previsionnelle</h1>
          </div>
          <div className="tft-actions">
            {savedAt && <span className="tft-save-status">Enregistre a {savedAt}</span>}
            <button className="tft-secondary-btn" onClick={() => setShowOnboarding(true)}>
              Assistant
            </button>
          </div>
        </div>

        <div className="tft-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tft-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "settings" && (
          <TftSettingsPanel settings={settings} onChange={setSettings} onSave={handleSave} />
        )}

        {activeTab === "assumptions" && (
          <TftAssumptionsPanel
            assumptions={assumptions}
            onChange={setAssumptions}
            onLoadDao={loadDao}
          />
        )}

        {(activeTab === "previ" || activeTab === "obj") && (
          <>
            <TftComparisonChart
              previ={previScenario}
              objectif={objScenario}
              threshold={settings.cashAlertThreshold}
            />
            <TftTable
              scenarioLabel={activeTab === "previ" ? "Previsionnel" : "Objectif"}
              scenario={activeTab === "previ" ? previScenario : objScenario}
              settings={settings}
              assumptions={assumptions}
            />
          </>
        )}
      </main>
    </div>
  );
}

function TftHeader() {
  return (
    <header className="db-header">
      <div className="db-header-left">
        <Link href="/" className="db-logo">
          Prev<span>ly</span>
        </Link>
        <nav className="db-header-nav" aria-label="Navigation principale">
          <a href="/dashboard" className="db-header-nav-item">
            Dashboard
          </a>
          <span className="db-header-nav-item active">Tresorerie previsionnelle</span>
        </nav>
      </div>
      <div className="db-header-actions">
        <AuthNav />
      </div>
    </header>
  );
}
