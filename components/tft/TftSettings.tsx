"use client";

import type { TftLegalForm, TftSettings, TftVatRegime } from "@/lib/tft/types";

interface Props {
  settings: TftSettings;
  onChange: (settings: TftSettings) => void;
  onSave: () => void;
}

const LEGAL_FORMS: TftLegalForm[] = ["SAS", "SARL", "EURL", "SASU", "EI", "AE"];
const VAT_REGIMES: { value: TftVatRegime; label: string }[] = [
  { value: "franchise", label: "Franchise de TVA" },
  { value: "reel-simplifie", label: "Reel simplifie" },
  { value: "reel-normal", label: "Reel normal" },
];

export default function TftSettingsPanel({ settings, onChange, onSave }: Props) {
  const patch = (value: Partial<TftSettings>) => onChange({ ...settings, ...value });
  const patchDelay = (key: keyof TftSettings["delays"], value: number) =>
    onChange({ ...settings, delays: { ...settings.delays, [key]: value } });

  return (
    <section className="tft-panel">
      <div className="tft-panel-head">
        <div>
          <p className="tft-panel-label">Onglet 1</p>
          <h2 className="tft-panel-title">Parametres generaux</h2>
        </div>
        <button className="tft-primary-btn" onClick={onSave}>
          Enregistrer
        </button>
      </div>

      <div className="tft-form-grid">
        <Field label="Nom commercial">
          <input
            className="tft-input"
            value={settings.companyName}
            onChange={(event) => patch({ companyName: event.target.value })}
          />
        </Field>
        <Field label="Date d'ouverture">
          <input
            className="tft-input"
            type="date"
            value={settings.openingDate}
            onChange={(event) => patch({ openingDate: event.target.value })}
          />
        </Field>
        <Field label="Forme juridique">
          <select
            className="tft-input"
            value={settings.legalForm}
            onChange={(event) => patch({ legalForm: event.target.value as TftLegalForm })}
          >
            {LEGAL_FORMS.map((form) => (
              <option key={form} value={form}>
                {form}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Regime TVA">
          <select
            className="tft-input"
            value={settings.vatRegime}
            onChange={(event) => patch({ vatRegime: event.target.value as TftVatRegime })}
          >
            {VAT_REGIMES.map((regime) => (
              <option key={regime.value} value={regime.value}>
                {regime.label}
              </option>
            ))}
          </select>
        </Field>
        <NumberField label="TVA ventes" value={settings.vatRateSales * 100} suffix="%" onChange={(value) => patch({ vatRateSales: value / 100 })} />
        <NumberField label="TVA achats/charges" value={settings.vatRatePurchases * 100} suffix="%" onChange={(value) => patch({ vatRatePurchases: value / 100 })} />
        <NumberField label="Tresorerie initiale" value={settings.initialCash} suffix="EUR" onChange={(value) => patch({ initialCash: value })} />
        <NumberField label="Seuil d'alerte" value={settings.cashAlertThreshold} suffix="EUR" onChange={(value) => patch({ cashAlertThreshold: value })} />
        <NumberField label="Encaissement clients" value={settings.delays.customerPayment} suffix="sem." onChange={(value) => patchDelay("customerPayment", value)} />
        <NumberField label="Paiement fournisseurs" value={settings.delays.supplierPayment} suffix="sem." onChange={(value) => patchDelay("supplierPayment", value)} />
        <NumberField label="Charges externes" value={settings.delays.externalCharges} suffix="sem." onChange={(value) => patchDelay("externalCharges", value)} />
        <NumberField label="Paiement TVA" value={settings.delays.vatPayment} suffix="sem." onChange={(value) => patchDelay("vatPayment", value)} />
        <NumberField label="Charges sociales" value={settings.delays.socialCharges} suffix="sem." onChange={(value) => patchDelay("socialCharges", value)} />
      </div>

      <div className="tft-legend">
        <span><i className="tft-dot blue" /> Bleu = saisie</span>
        <span><i className="tft-dot yellow" /> Jaune = hypothese cle</span>
        <span><i className="tft-dot green" /> Vert = lien calcule</span>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="tft-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="tft-number-wrap">
        <input
          className="tft-input"
          type="number"
          step="0.01"
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span>{suffix}</span>
      </div>
    </Field>
  );
}
