import type { Transaction, CSVRow, CSVColumnMap, CSVParseResult } from "@/types";

// ── Separator detection ──────────────────────────────────────────────────────

function detectSeparator(firstLine: string): ";" | "," | "\t" {
  const counts = {
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
  };
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] >= counts[","]) return "\t";
  return ",";
}

// ── Row parsing ──────────────────────────────────────────────────────────────

function parseRow(line: string, sep: string): CSVRow {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ── Date parsing ─────────────────────────────────────────────────────────────

function parseDate(raw: string): Date | null {
  const s = raw.trim().replace(/\s+/g, " ");

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const d = new Date(
      parseInt(dmy[3]),
      parseInt(dmy[2]) - 1,
      parseInt(dmy[1])
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const d = new Date(
      parseInt(ymd[1]),
      parseInt(ymd[2]) - 1,
      parseInt(ymd[3])
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback to native parser
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// ── Amount parsing ────────────────────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  if (!raw || !raw.trim()) return null;

  // Remove currency symbols, spaces used as thousands separators
  let s = raw.trim().replace(/[€$£\s]/g, "").replace(/\u00a0/g, "");

  // European format: 1.234,56 → 1234.56
  if (/^\-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // US/standard format: 1,234.56 → 1234.56
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Header detection ─────────────────────────────────────────────────────────

const DATE_HEADERS = [
  "date",
  "jour",
  "date operation",
  "date valeur",
  "date de l'opération",
  "date comptable",
];
const LABEL_HEADERS = [
  "libelle",
  "libellé",
  "intitule",
  "intitulé",
  "description",
  "motif",
  "reference",
  "référence",
  "label",
  "operation",
  "opération",
  "detail",
  "détail",
];
const DEBIT_HEADERS = [
  "debit",
  "débit",
  "montant debit",
  "montant débit",
  "sortie",
  "depense",
  "dépense",
  "debit eur",
  "montant (débit)",
];
const CREDIT_HEADERS = [
  "credit",
  "crédit",
  "montant credit",
  "montant crédit",
  "entree",
  "entrée",
  "credit eur",
  "montant (crédit)",
];
const AMOUNT_HEADERS = [
  "montant",
  "amount",
  "valeur",
  "somme",
  "montant eur",
  "montant en eur",
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findColumnIndex(
  headers: string[],
  candidates: string[]
): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex(
      (h) => normalize(h) === normalize(candidate)
    );
    if (idx !== -1) return idx;
  }
  // Partial match fallback
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) =>
      normalize(h).includes(normalize(candidate))
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectColumns(headerRow: CSVRow): CSVColumnMap | null {
  const dateIdx = findColumnIndex(headerRow, DATE_HEADERS);
  const labelIdx = findColumnIndex(headerRow, LABEL_HEADERS);

  if (dateIdx === -1 || labelIdx === -1) return null;

  const debitIdx = findColumnIndex(headerRow, DEBIT_HEADERS);
  const creditIdx = findColumnIndex(headerRow, CREDIT_HEADERS);
  const amountIdx = findColumnIndex(headerRow, AMOUNT_HEADERS);

  if (debitIdx !== -1 && creditIdx !== -1) {
    return { date: dateIdx, label: labelIdx, debit: debitIdx, credit: creditIdx };
  }
  if (amountIdx !== -1) {
    return { date: dateIdx, label: labelIdx, amount: amountIdx };
  }
  // If we only found debit or only credit, treat as amount
  if (debitIdx !== -1) {
    return { date: dateIdx, label: labelIdx, amount: debitIdx };
  }
  if (creditIdx !== -1) {
    return { date: dateIdx, label: labelIdx, amount: creditIdx };
  }

  return null;
}

// ── Header row finder ─────────────────────────────────────────────────────────

function findHeaderRow(rows: CSVRow[]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const normalized = rows[i].map((c) => normalize(c));
    const hasDate = DATE_HEADERS.some((h) => normalized.includes(normalize(h)));
    const hasLabel = LABEL_HEADERS.some((h) =>
      normalized.some((n) => n.includes(normalize(h)))
    );
    if (hasDate && hasLabel) return i;
  }
  return -1;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseCSVContent(content: string): CSVParseResult {
  // Normalize line endings
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      ok: false,
      error:
        "Fichier vide ou trop court. Assurez-vous que le fichier contient au moins une ligne d'en-tête et des transactions.",
    };
  }

  const sep = detectSeparator(lines[0]);
  const rows: CSVRow[] = lines.map((l) => parseRow(l, sep));

  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) {
    return {
      ok: false,
      error:
        'Format non reconnu. Vérifiez que votre fichier contient les colonnes date, libellé, débit/crédit.',
    };
  }

  const colMap = detectColumns(rows[headerIdx]);
  if (!colMap) {
    return {
      ok: false,
      error:
        'Format non reconnu. Vérifiez que votre fichier contient les colonnes date, libellé, débit/crédit.',
    };
  }

  const transactions: Transaction[] = [];
  let parseErrors = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= 1) continue;

    const rawDate = row[colMap.date] ?? "";
    const date = parseDate(rawDate);
    if (!date) {
      parseErrors++;
      continue;
    }

    const label = (row[colMap.label] ?? "").trim();
    if (!label) continue;

    let amount: number | null = null;

    if (colMap.debit !== undefined && colMap.credit !== undefined) {
      const debit = parseAmount(row[colMap.debit] ?? "");
      const credit = parseAmount(row[colMap.credit] ?? "");
      if (credit !== null && credit !== 0) {
        amount = Math.abs(credit);
      } else if (debit !== null && debit !== 0) {
        amount = -Math.abs(debit);
      } else {
        amount = 0;
      }
    } else if (colMap.amount !== undefined) {
      amount = parseAmount(row[colMap.amount] ?? "");
    }

    if (amount === null) {
      parseErrors++;
      continue;
    }

    transactions.push({ date, label, amount });
  }

  if (transactions.length === 0) {
    if (parseErrors > 0) {
      return {
        ok: false,
        error:
          'Aucune transaction valide trouvée. Format de date ou de montant non reconnu. Formats supportés : DD/MM/YYYY, YYYY-MM-DD.',
      };
    }
    return {
      ok: false,
      error:
        'Aucune transaction trouvée dans ce fichier. Vérifiez que le fichier contient des lignes de données.',
    };
  }

  // Sort by date ascending
  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

  return { ok: true, transactions };
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      // Heuristic: if content has replacement char, try ISO-8859-1
      if (content.includes("\uFFFD")) {
        const reader2 = new FileReader();
        reader2.onload = (e2) => resolve(e2.target?.result as string);
        reader2.onerror = reject;
        reader2.readAsText(file, "ISO-8859-1");
      } else {
        resolve(content);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file, "UTF-8");
  });
}
