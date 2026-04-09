import type { StatementImportResult, Transaction } from "@/types";

type PDFJSImport = typeof import("pdfjs-dist");

type PDFTextToken = {
  text: string;
  x: number;
  y: number;
  width: number;
  page: number;
};

type PDFTextLine = {
  page: number;
  y: number;
  tokens: PDFTextToken[];
  text: string;
};

type ParsedAmountToken = {
  raw: string;
  value: number;
  x: number;
  width: number;
};

type ColumnAnchors = {
  debitX: number | null;
  creditX: number | null;
};

type BankProfile = {
  id: string;
  label: string;
  signatures: string[];
  ignoredLinePatterns: RegExp[];
};

const DATE_PREFIX =
  /^(\d{2}\/\d{2}(?:\/\d{2,4})?)(?:\s+\d{2}\/\d{2}(?:\/\d{2,4})?)?\s+/;
const AMOUNT_TOKEN =
  /^-?\d{1,3}(?:[ .]\d{3})*(?:,\d{2})\s*(?:EUR|€)?$|^-?\d+(?:,\d{2})\s*(?:EUR|€)?$/i;

const BANK_PROFILES: BankProfile[] = [
  {
    id: "bnp",
    label: "BNP Paribas",
    signatures: ["bnp paribas"],
    ignoredLinePatterns: [
      /releve/i,
      /titulaire/i,
      /solde .*debiteur/i,
      /solde .*crediteur/i,
      /page \d+/i,
      /iban/i,
    ],
  },
  {
    id: "sg",
    label: "Societe Generale",
    signatures: ["societe generale", "sg france"],
    ignoredLinePatterns: [
      /releve/i,
      /situation de compte/i,
      /solde .*debiteur/i,
      /solde .*crediteur/i,
      /page \d+/i,
      /iban/i,
    ],
  },
  {
    id: "ca",
    label: "Credit Agricole",
    signatures: ["credit agricole"],
    ignoredLinePatterns: [
      /releve/i,
      /compte de depot/i,
      /solde .*debiteur/i,
      /solde .*crediteur/i,
      /page \d+/i,
      /iban/i,
    ],
  },
  {
    id: "lcl",
    label: "LCL",
    signatures: [" lcl ", "lcl mon compte", "credit lyonnais"],
    ignoredLinePatterns: [
      /releve/i,
      /solde .*debiteur/i,
      /solde .*crediteur/i,
      /page \d+/i,
      /iban/i,
    ],
  },
];

let pdfJsPromise: Promise<PDFJSImport> | null = null;

function normalizeText(value: string): string {
  return ` ${value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function parseFrenchAmount(value: string): number | null {
  const normalized = value
    .replace(/[€\s]/g, "")
    .replace(/\u00a0/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePdfDate(value: string, fallbackYear: number): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const rawYear = match[3];
  const year = rawYear
    ? rawYear.length === 2
      ? 2000 + Number.parseInt(rawYear, 10)
      : Number.parseInt(rawYear, 10)
    : fallbackYear;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAmountToken(value: string): boolean {
  return AMOUNT_TOKEN.test(value.trim());
}

function joinTokens(tokens: PDFTextToken[]): string {
  if (tokens.length === 0) return "";
  const sorted = [...tokens].sort((a, b) => a.x - b.x);
  let text = sorted[0].text.trim();
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const gap = current.x - (previous.x + previous.width);
    text += gap > 3 ? ` ${current.text.trim()}` : current.text.trim();
  }
  return text.replace(/\s+/g, " ").trim();
}

function groupTokensIntoLines(tokens: PDFTextToken[]): PDFTextLine[] {
  const byPage = new Map<number, PDFTextToken[]>();
  for (const token of tokens) {
    if (!byPage.has(token.page)) byPage.set(token.page, []);
    byPage.get(token.page)!.push(token);
  }

  const lines: PDFTextLine[] = [];
  for (const [page, pageTokens] of byPage.entries()) {
    const sorted = [...pageTokens].sort((a, b) => {
      if (Math.abs(a.y - b.y) > 1.5) return b.y - a.y;
      return a.x - b.x;
    });

    const pageLines: { y: number; tokens: PDFTextToken[] }[] = [];
    for (const token of sorted) {
      const existing = pageLines.find((line) => Math.abs(line.y - token.y) <= 2);
      if (existing) {
        existing.tokens.push(token);
        existing.y = (existing.y + token.y) / 2;
      } else {
        pageLines.push({ y: token.y, tokens: [token] });
      }
    }

    pageLines
      .sort((a, b) => b.y - a.y)
      .forEach((line) => {
        const cleanTokens = line.tokens
          .filter((token) => token.text.trim().length > 0)
          .sort((a, b) => a.x - b.x);
        const text = joinTokens(cleanTokens);
        if (text) {
          lines.push({
            page,
            y: line.y,
            tokens: cleanTokens,
            text,
          });
        }
      });
  }

  return lines.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return b.y - a.y;
  });
}

function detectBankProfile(documentText: string): BankProfile | null {
  const normalized = normalizeText(documentText);
  return (
    BANK_PROFILES.find((profile) =>
      profile.signatures.some((signature) => normalized.includes(signature))
    ) ?? null
  );
}

function inferDocumentYear(documentText: string): number {
  const matches = documentText.match(/\b20\d{2}\b/g) ?? [];
  if (matches.length === 0) return new Date().getFullYear();
  const counts = new Map<number, number>();
  for (const match of matches) {
    const year = Number.parseInt(match, 10);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function inferPageYear(lines: PDFTextLine[], fallbackYear: number): number {
  const matches = lines
    .flatMap((line) => line.text.match(/\b20\d{2}\b/g) ?? [])
    .map((value) => Number.parseInt(value, 10));
  if (matches.length === 0) return fallbackYear;
  return matches[matches.length - 1];
}

function detectColumnAnchors(lines: PDFTextLine[]): ColumnAnchors {
  let debitX: number | null = null;
  let creditX: number | null = null;

  for (const line of lines) {
    const normalized = normalizeText(line.text);
    if (!normalized.includes(" debit ") && !normalized.includes(" credit ")) {
      continue;
    }

    for (const token of line.tokens) {
      const tokenText = normalizeText(token.text);
      if (debitX === null && tokenText.includes(" debit ")) {
        debitX = token.x;
      }
      if (creditX === null && tokenText.includes(" credit ")) {
        creditX = token.x;
      }
    }
  }

  return { debitX, creditX };
}

function extractAmount(
  tokens: PDFTextToken[],
  anchors: ColumnAnchors
): number | null {
  const amountTokens: ParsedAmountToken[] = tokens
    .filter((token) => isAmountToken(token.text))
    .map((token) => {
      const value = parseFrenchAmount(token.text);
      return value === null
        ? null
        : {
            raw: token.text.trim(),
            value: Math.abs(value),
            x: token.x,
            width: token.width,
          };
    })
    .filter((token): token is ParsedAmountToken => token !== null);

  if (amountTokens.length === 0) return null;

  let bestDebit: { token: ParsedAmountToken; distance: number } | null = null;
  let bestCredit: { token: ParsedAmountToken; distance: number } | null = null;

  for (const token of amountTokens) {
    if (anchors.debitX !== null) {
      const distance = Math.abs(token.x - anchors.debitX);
      if (distance <= 42 && (!bestDebit || distance < bestDebit.distance)) {
        bestDebit = { token, distance };
      }
    }
    if (anchors.creditX !== null) {
      const distance = Math.abs(token.x - anchors.creditX);
      if (distance <= 42 && (!bestCredit || distance < bestCredit.distance)) {
        bestCredit = { token, distance };
      }
    }
  }

  if (bestDebit && !bestCredit) {
    return -bestDebit.token.value;
  }
  if (bestCredit && !bestDebit) {
    return bestCredit.token.value;
  }
  if (bestCredit && bestDebit) {
    return bestCredit.distance <= bestDebit.distance
      ? bestCredit.token.value
      : -bestDebit.token.value;
  }

  const explicitSigned = amountTokens.find((token) => token.raw.startsWith("-"));
  return explicitSigned ? -explicitSigned.value : null;
}

function shouldIgnoreLine(line: PDFTextLine, profile: BankProfile): boolean {
  const text = line.text.trim();
  if (!text) return true;
  if (profile.ignoredLinePatterns.some((pattern) => pattern.test(text))) {
    return true;
  }
  return false;
}

function cleanTransactionLabel(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/(?:\s+-?\d[\d .]*,\d{2}\s*(?:EUR|€)?)+\s*$/i, "")
    .trim();
}

function extractLeadingDate(text: string): string | null {
  const match = text.match(DATE_PREFIX);
  return match ? match[1] : null;
}

function stripLeadingDatePrefix(text: string): string {
  return text.replace(DATE_PREFIX, "").trim();
}

function buildTransactionsFromLines(
  lines: PDFTextLine[],
  profile: BankProfile,
  fallbackYear: number
): { transactions: Transaction[]; candidateCount: number } {
  const byPage = new Map<number, PDFTextLine[]>();
  for (const line of lines) {
    if (!byPage.has(line.page)) byPage.set(line.page, []);
    byPage.get(line.page)!.push(line);
  }

  const transactions: Transaction[] = [];
  let candidateCount = 0;

  for (const pageLines of byPage.values()) {
    const pageYear = inferPageYear(pageLines, fallbackYear);
    const pageAnchors = detectColumnAnchors(pageLines);
    let current:
      | {
          date: Date;
          amount: number;
          labelParts: string[];
        }
      | null = null;

    const flushCurrent = () => {
      if (!current) return;
      const label = cleanTransactionLabel(current.labelParts.join(" ").trim());
      if (label.length >= 2) {
        transactions.push({
          date: current.date,
          amount: current.amount,
          label,
        });
      }
      current = null;
    };

    for (const line of pageLines) {
      if (shouldIgnoreLine(line, profile)) continue;
      const leadingDate = extractLeadingDate(line.text);

      if (leadingDate) {
        flushCurrent();
        candidateCount += 1;

        const parsedDate = parsePdfDate(leadingDate, pageYear);
        const amount = extractAmount(line.tokens, pageAnchors);
        if (!parsedDate || amount === null) {
          continue;
        }

        current = {
          date: parsedDate,
          amount,
          labelParts: [cleanTransactionLabel(stripLeadingDatePrefix(line.text))],
        };
        continue;
      }

      if (
        current &&
        !isAmountToken(line.text) &&
        !normalizeText(line.text).includes(" debit ") &&
        !normalizeText(line.text).includes(" credit ")
      ) {
        current.labelParts.push(line.text.trim());
      }
    }

    flushCurrent();
  }

  return { transactions, candidateCount };
}

async function loadPDFJS(): Promise<PDFJSImport> {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function extractPdfLines(file: File): Promise<{
  lines: PDFTextLine[];
  documentText: string;
}> {
  const pdfjs = await loadPDFJS();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const document = await loadingTask.promise;

  const tokens: PDFTextToken[] = [];
  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if (!("str" in item) || typeof item.str !== "string") continue;
      const [x, y] = [item.transform[4], item.transform[5]];
      tokens.push({
        text: item.str,
        x,
        y,
        width: item.width ?? 0,
        page: pageIndex,
      });
    }
  }

  const lines = groupTokensIntoLines(tokens);
  const documentText = lines.map((line) => line.text).join("\n");
  return { lines, documentText };
}

export async function parsePDFStatement(
  file: File
): Promise<StatementImportResult> {
  try {
    const { lines, documentText } = await extractPdfLines(file);
    const visibleCharacterCount = documentText.replace(/\s/g, "").length;

    if (visibleCharacterCount < 120) {
      return {
        ok: false,
        source: "pdf",
        code: "pdf-scan-unsupported",
        error:
          "Ce PDF ne contient pas assez de texte exploitable. Les relevés scannés ne sont pas encore supportés. Importez plutôt le CSV.",
      };
    }

    const profile = detectBankProfile(documentText);
    if (!profile) {
      return {
        ok: false,
        source: "pdf",
        code: "pdf-bank-unsupported",
        error:
          "Cette banque PDF n'est pas encore supportée en bêta. Importez plutôt le CSV ou utilisez un PDF BNP, Société Générale, Crédit Agricole ou LCL.",
      };
    }

    const fallbackYear = inferDocumentYear(documentText);
    const { transactions, candidateCount } = buildTransactionsFromLines(
      lines,
      profile,
      fallbackYear
    );

    if (transactions.length === 0) {
      return {
        ok: false,
        source: "pdf",
        code: "pdf-no-transactions",
        error:
          "Aucune transaction exploitable n'a été trouvée dans ce PDF. Importez plutôt le CSV de la banque.",
      };
    }

    const confidence =
      candidateCount > 0 ? transactions.length / candidateCount : 0;
    if (transactions.length < 3 || confidence < 0.45) {
      return {
        ok: false,
        source: "pdf",
        code: "pdf-low-confidence",
        error:
          "Le relevé PDF a été lu avec une confiance insuffisante. Pour éviter un dashboard faux, importez plutôt le CSV.",
      };
    }

    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      ok: true,
      source: "pdf",
      transactions,
      bankLabel: profile.label,
    };
  } catch {
    return {
      ok: false,
      source: "pdf",
      code: "file-read-error",
      error:
        "Impossible de lire ce PDF. Vérifiez qu'il s'agit d'un relevé texte natif puis réessayez.",
    };
  }
}
