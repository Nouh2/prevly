import type { StatementImportResult } from "@/types";
import { parseCSVContent, readFileAsText } from "@/lib/csvParser";
import { parsePDFStatement } from "@/lib/pdfParser";

export const IMPORT_ACCEPT = ".csv,.pdf,text/csv,application/pdf";

function isCsvFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith(".csv") || file.type === "text/csv";
}

function isPdfFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith(".pdf") || file.type === "application/pdf";
}

export async function parseStatementFile(
  file: File
): Promise<StatementImportResult> {
  if (isCsvFile(file)) {
    try {
      const content = await readFileAsText(file);
      const result = parseCSVContent(content);
      if (!result.ok) {
        return {
          ok: false,
          source: "csv",
          code: "csv-invalid",
          error: result.error,
        };
      }
      return {
        ok: true,
        source: "csv",
        transactions: result.transactions,
      };
    } catch {
      return {
        ok: false,
        source: "csv",
        code: "file-read-error",
        error:
          "Impossible de lire ce fichier CSV. Verifiez son export puis reessayez.",
      };
    }
  }

  if (isPdfFile(file)) {
    return parsePDFStatement(file);
  }

  return {
    ok: false,
    source: "unknown",
    code: "unsupported-file-type",
    error:
      "Format non reconnu. Importez un fichier CSV ou un releve PDF texte natif.",
  };
}
