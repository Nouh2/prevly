"use client";

import { useState } from "react";
import { buildDaoAssumptions, buildEmptyAssumptions, DEFAULT_TFT_SETTINGS } from "@/lib/tft/defaults";
import { TFT_CATALOG, TFT_SECTION_LABELS } from "@/lib/tft/catalog";
import type { TftAssumptions, TftLegalForm, TftSection, TftSettings, TftVatRegime } from "@/lib/tft/types";

interface Props {
  settings: TftSettings;
  assumptions: TftAssumptions;
  onComplete: (settings: TftSettings, assumptions: TftAssumptions) => void;
}

const SECTIONS = Object.keys(TFT_SECTION_LABELS) as TftSection[];

export default function TftOnboarding({ settings, assumptions, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [draftSettings, setDraftSettings] = useState<TftSettings>(settings);
  const [draftAssumptions, setDraftAssumptions] = useState<TftAssumptions>(assumptions);
  const [model, setModel] = useState<"dao" | "empty">("dao");
  const [enabledSections, setEnabledSections] = useState<Set<TftSection>>(
    () => new Set(SECTIONS)
  );

  const applyModel = (nextModel: "dao" | "empty") => {
    setModel(nextModel);
    setDraftAssumptions(nextModel === "dao" ? buildDaoAssumptions() : buildEmptyAssumptions());
    if (nextModel === "dao") setDraftSettings(DEFAULT_TFT_SETTINGS);
  };

  const finish = () => {
    const enabledLineIds = TFT_CATALOG.filter((line) => enabledSections.has(line.section)).map((line) => line.id);
    onComplete(draftSettings, {
      ...draftAssumptions,
      enabledLineIds,
      onboardingCompleted: true,
    });
  };

  return (
    <div className="fiscal-onboarding tft-onboarding">
      <div className="fiscal-onboarding-header">
        <div className="fiscal-onboarding-steps">
          {[0, 1, 2].map((item) => (
            <div key={item} className={`fiscal-step-dot${item === step ? " active" : item < step ? " done" : ""}`} />
          ))}
        </div>
        <p className="fiscal-onboarding-sub">Etape {step + 1} sur 3</p>
      </div>

      {step === 0 && (
        <div className="fiscal-onboarding-step">
          <p className="fiscal-onboarding-title">Parametres essentiels</p>
          <div className="tft-onboarding-form">
            <input
              className="fiscal-input tft-input"
              value={draftSettings.companyName}
              onChange={(event) => setDraftSettings({ ...draftSettings, companyName: event.target.value })}
              placeholder="Nom commercial"
            />
            <input
              className="fiscal-input tft-input"
              type="date"
              value={draftSettings.openingDate}
              onChange={(event) => setDraftSettings({ ...draftSettings, openingDate: event.target.value })}
            />
            <select
              className="fiscal-select"
              value={draftSettings.legalForm}
              onChange={(event) => setDraftSettings({ ...draftSettings, legalForm: event.target.value as TftLegalForm })}
            >
              {["SAS", "SARL", "EURL", "SASU", "EI", "AE"].map((form) => (
                <option key={form} value={form}>{form}</option>
              ))}
            </select>
            <select
              className="fiscal-select"
              value={draftSettings.vatRegime}
              onChange={(event) => setDraftSettings({ ...draftSettings, vatRegime: event.target.value as TftVatRegime })}
            >
              <option value="franchise">Franchise de TVA</option>
              <option value="reel-simplifie">Reel simplifie</option>
              <option value="reel-normal">Reel normal</option>
            </select>
          </div>
          <button className="fiscal-submit-btn" onClick={() => setStep(1)}>
            Continuer
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="fiscal-onboarding-step">
          <p className="fiscal-onboarding-title">Modele de depart</p>
          <div className="fiscal-choice-grid fiscal-choice-grid-2">
            <button className={`fiscal-choice-btn${model === "dao" ? " selected" : ""}`} onClick={() => applyModel("dao")}>
              Cas DAO demo
            </button>
            <button className={`fiscal-choice-btn${model === "empty" ? " selected" : ""}`} onClick={() => applyModel("empty")}>
              Vide
            </button>
          </div>
          <button className="fiscal-submit-btn" onClick={() => setStep(2)}>
            Continuer
          </button>
          <button className="fiscal-back-btn" onClick={() => setStep(0)}>Retour</button>
        </div>
      )}

      {step === 2 && (
        <div className="fiscal-onboarding-step">
          <p className="fiscal-onboarding-title">Sections a activer</p>
          <div className="tft-section-choice-grid">
            {SECTIONS.map((section) => (
              <button
                key={section}
                className={`fiscal-choice-btn${enabledSections.has(section) ? " selected" : ""}`}
                onClick={() => {
                  const next = new Set(enabledSections);
                  if (next.has(section)) next.delete(section);
                  else next.add(section);
                  setEnabledSections(next);
                }}
              >
                {TFT_SECTION_LABELS[section]}
              </button>
            ))}
          </div>
          <button className="fiscal-submit-btn" onClick={finish}>
            Creer mon TFT
          </button>
          <button className="fiscal-back-btn" onClick={() => setStep(1)}>Retour</button>
        </div>
      )}
    </div>
  );
}
