const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const moduleCache = new Map();

function loadTsModule(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  if (moduleCache.has(fullPath)) {
    return moduleCache.get(fullPath).exports;
  }

  const source = fs.readFileSync(fullPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: fullPath,
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(fullPath, module);

  function localRequire(spec) {
    if (spec === "@/types") return loadTsModule("types/index.ts");
    if (spec === "@/lib/fiscal") return loadTsModule("lib/fiscal.ts");
    if (spec === "@/lib/analytics") return loadTsModule("lib/analytics.ts");
    if (spec === "@/lib/csvParser") return loadTsModule("lib/csvParser.ts");
    return require(spec);
  }

  const wrapper = new vm.Script(
    `(function (require, module, exports, __filename, __dirname) { ${transpiled}\n})`,
    { filename: fullPath }
  );

  wrapper.runInThisContext()(
    localRequire,
    module,
    module.exports,
    fullPath,
    path.dirname(fullPath)
  );

  return module.exports;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readCsv(csvPath) {
  return fs.readFileSync(csvPath, "utf8");
}

function formatDateLocal(date) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) out[key] = obj[key];
  return out;
}

function main() {
  const simpleCsvPath =
    process.env.PREVLY_QA_SIMPLE_CSV ||
    "C:\\Users\\noete\\Downloads\\transactions.csv";
  const fullCsvPath =
    process.env.PREVLY_QA_FULL_CSV ||
    "C:\\Users\\noete\\Downloads\\transactions_completes.csv";

  const { parseCSVContent } = loadTsModule("lib/csvParser.ts");
  const analytics = loadTsModule("lib/analytics.ts");
  const fiscal = loadTsModule("lib/fiscal.ts");

  const cases = [];

  const simpleParsed = parseCSVContent(readCsv(simpleCsvPath));
  assert(simpleParsed.ok, "Parser should accept simple CSV fixture");
  assert(
    simpleParsed.transactions.length === 12,
    `Expected 12 transactions in simple fixture, got ${simpleParsed.transactions.length}`
  );
  cases.push({
    case: "parser_simple_csv",
    status: "pass",
    details: {
      transactions: simpleParsed.transactions.length,
      firstDate: formatDateLocal(simpleParsed.transactions[0].date),
      lastDate: formatDateLocal(
        simpleParsed.transactions[simpleParsed.transactions.length - 1].date
      ),
    },
  });

  const simpleDashboard = analytics.buildDashboardData(simpleParsed.transactions);
  assert(simpleDashboard.monthlyFlows.length === 3, "Expected 3 monthly buckets");
  assert(
    simpleDashboard.recurringCharges.some((charge) =>
      charge.label.toLowerCase().includes("loyer")
    ),
    "Expected to detect recurring rent on simple fixture"
  );
  cases.push({
    case: "dashboard_simple_csv",
    status: "pass",
    details: {
      currentBalance: simpleDashboard.currentBalance,
      healthScore: simpleDashboard.healthScore.score,
      recurringLabels: simpleDashboard.recurringCharges.map((charge) => charge.label),
      forecast: simpleDashboard.forecast,
    },
  });

  const fullParsed = parseCSVContent(readCsv(fullCsvPath));
  assert(fullParsed.ok, "Parser should accept full CSV fixture");
  assert(
    fullParsed.transactions.length === 75,
    `Expected 75 transactions in full fixture, got ${fullParsed.transactions.length}`
  );
  const fullFlows = analytics.computeMonthlyFlows(fullParsed.transactions);
  assert(fullFlows.length === 8, `Expected 8 monthly buckets, got ${fullFlows.length}`);
  cases.push({
    case: "parser_full_csv",
    status: "pass",
    details: {
      transactions: fullParsed.transactions.length,
      months: fullFlows.map((flow) => flow.month),
      lastTransactionDate: formatDateLocal(
        fullParsed.transactions[fullParsed.transactions.length - 1].date
      ),
    },
  });

  const aeDashboard = analytics.buildDashboardData(fullParsed.transactions, {
    legalStatus: "auto-entrepreneur",
    sector: "prestations-services",
    creationMonth: "2023-01",
  });
  assert(aeDashboard.fiscalSummary, "AE scenario should have fiscal summary");
  assert(
    aeDashboard.fiscalSummary.microThresholdExceeded === true,
    "AE scenario should exceed micro threshold"
  );
  assert(
    aeDashboard.fiscalSummary.microRevenueThreshold === 83600,
    "AE threshold should be 83_600 for services"
  );
  assert(
    aeDashboard.alerts.some(
      (alert) => alert.title === "Seuil micro-entreprise depasse"
    ),
    "AE scenario should surface threshold alert"
  );
  cases.push({
    case: "ae_services_over_threshold",
    status: "pass",
    details: {
      fiscal: pick(aeDashboard.fiscalSummary, [
        "annualCAEstimate",
        "tvaRegime",
        "microRevenueThreshold",
        "microThresholdExceeded",
        "cotisationsEstimated",
      ]),
      alerts: aeDashboard.alerts.map((alert) => alert.title),
    },
  });

  const eiMonthlyDashboard = analytics.buildDashboardData(fullParsed.transactions, {
    legalStatus: "entreprise-individuelle",
    sector: "prestations-services",
    creationMonth: "2023-01",
    tnsPaymentFrequency: "monthly",
  });
  const eiMonthlyDeadlines = eiMonthlyDashboard.deadlines.filter((deadline) =>
    deadline.label.includes("TNS")
  );
  assert(eiMonthlyDeadlines.length >= 3, "EI monthly should create 3 TNS deadlines");
  cases.push({
    case: "ei_monthly_tns",
    status: "pass",
    details: {
      cotisationsEstimated: eiMonthlyDashboard.fiscalSummary.cotisationsEstimated,
      deadlines: eiMonthlyDeadlines.slice(0, 3).map((deadline) => ({
        label: deadline.label,
        amount: deadline.amount,
        date: formatDateLocal(deadline.date),
      })),
    },
  });

  const eiQuarterlyDashboard = analytics.buildDashboardData(fullParsed.transactions, {
    legalStatus: "entreprise-individuelle",
    sector: "prestations-services",
    creationMonth: "2023-01",
    tnsPaymentFrequency: "quarterly",
    tnsContributionAmount: 1840,
  });
  const eiQuarterlyDeadline = eiQuarterlyDashboard.deadlines.find(
    (deadline) => deadline.label === "Cotisations TNS trimestrielles"
  );
  assert(eiQuarterlyDeadline, "EI quarterly should create a quarterly deadline");
  assert(
    eiQuarterlyDeadline.amount === -1840,
    `Expected quarterly TNS amount -1840, got ${eiQuarterlyDeadline.amount}`
  );
  cases.push({
    case: "ei_quarterly_actual_call",
    status: "pass",
    details: {
      fiscal: pick(eiQuarterlyDashboard.fiscalSummary, [
        "cotisationsEstimated",
        "totalQuarterlyProvisioning",
        "monthlySuggested",
      ]),
      deadline: {
        label: eiQuarterlyDeadline.label,
        amount: eiQuarterlyDeadline.amount,
        date: formatDateLocal(eiQuarterlyDeadline.date),
      },
    },
  });

  const sasuDashboard = analytics.buildDashboardData(fullParsed.transactions, {
    legalStatus: "sasu",
    sector: "prestations-services",
    creationMonth: "2023-01",
    managerGrossMonthly: 3500,
  });
  const dsnDeadlines = sasuDashboard.deadlines.filter(
    (deadline) => deadline.label === "Cotisations DSN"
  );
  assert(
    sasuDashboard.fiscalSummary.cotisationsEstimated === 2240,
    `Expected SASU DSN 2240, got ${sasuDashboard.fiscalSummary.cotisationsEstimated}`
  );
  assert(
    sasuDashboard.fiscalSummary.annualISEstimate === 1682,
    `Expected annual IS 1682, got ${sasuDashboard.fiscalSummary.annualISEstimate}`
  );
  assert(
    sasuDashboard.fiscalSummary.isInstallmentsRequired === false,
    "SASU scenario should not require IS installments"
  );
  assert(dsnDeadlines.length >= 3, "SASU should create 3 DSN deadlines");
  assert(
    !sasuDashboard.deadlines.some((deadline) => deadline.label === "Acompte IS"),
    "SASU scenario should not show IS installment under 3000 EUR"
  );
  cases.push({
    case: "sasu_with_salary",
    status: "pass",
    details: {
      fiscal: pick(sasuDashboard.fiscalSummary, [
        "cotisationsEstimated",
        "annualISEstimate",
        "isInstallmentsRequired",
        "tvaEstimated",
      ]),
      deadlines: dsnDeadlines.slice(0, 3).map((deadline) => ({
        label: deadline.label,
        amount: deadline.amount,
        date: formatDateLocal(deadline.date),
      })),
    },
  });

  const franchiseSummary = fiscal.computeFiscalSummary(
    {
      legalStatus: "auto-entrepreneur",
      sector: "prestations-services",
      creationMonth: "2023-01",
    },
    [
      { month: "2025-09", income: 2500, expenses: 1000, net: 1500 },
      { month: "2025-10", income: 2600, expenses: 1200, net: 1400 },
      { month: "2025-11", income: 2400, expenses: 900, net: 1500 },
      { month: "2025-12", income: 2550, expenses: 1100, net: 1450 },
      { month: "2026-01", income: 2450, expenses: 1050, net: 1400 },
      { month: "2026-02", income: 2500, expenses: 950, net: 1550 },
    ],
    10000
  );
  assert(franchiseSummary.tvaRegime === "franchise", "Low CA should stay in franchise");
  assert(franchiseSummary.tvaEstimated === 0, "Franchise should not provision TVA");
  cases.push({
    case: "low_ca_franchise_tva",
    status: "pass",
    details: {
      fiscal: pick(franchiseSummary, [
        "annualCAEstimate",
        "tvaRegime",
        "tvaThresholdPct",
        "tvaEstimated",
        "cotisationsEstimated",
      ]),
    },
  });

  console.log(JSON.stringify({ ok: true, cases }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
}
