# Prevly Beta QA Checklist

Last validated: 2026-04-08

## Functional checklist

- CSV parser accepts the simple banking fixture and keeps date, label, debit and credit mapping.
- CSV parser accepts the full fixture and reconstructs 8 months of flows.
- Dashboard analytics compute balance, recurring charges, health score and J+30/J+60/J+90 forecast without runtime errors.
- Fiscal onboarding covers `auto-entrepreneur`, `entreprise-individuelle / EURL / SARL`, and `SASU / SAS`.
- Auto-entrepreneur warns when observed annualized revenue exceeds the micro threshold.
- TNS monthly cadence creates monthly social deadlines in the calendar.
- TNS quarterly cadence uses the real URSSAF call amount when provided.
- SASU/SAS social charges use the declared manager gross salary.
- IS installments are hidden when estimated annual IS stays below `3 000 EUR`.
- Low-revenue scenarios stay in `TVA franchise` with no VAT provisioning.
- Production build succeeds.
- Production routes `/`, `/dashboard`, `/login`, and `/signup` return HTTP `200`.

## Re-run commands

```powershell
npm.cmd run build
node scripts/run-beta-qa.js
```

Optional fixture overrides:

```powershell
$env:PREVLY_QA_SIMPLE_CSV='C:\\path\\to\\transactions.csv'
$env:PREVLY_QA_FULL_CSV='C:\\path\\to\\transactions_completes.csv'
node scripts/run-beta-qa.js
```

## Current result

- All automated beta QA cases above passed on 2026-04-08.
- No blocking regression found in parser, analytics, fiscal logic or main production routes.
- Remaining beta work is manual UX QA on the onboarding and dashboard rendering.
