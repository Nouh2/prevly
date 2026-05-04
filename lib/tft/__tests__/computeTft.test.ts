import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDaoAssumptions, DEFAULT_TFT_SETTINGS } from "../defaults";
import { computeScenario } from "../computeTft";

test("DAO preset reproduces the Excel S5 cash checkpoint", () => {
  const scenario = computeScenario(DEFAULT_TFT_SETTINGS, buildDaoAssumptions(), "previ");
  assert.equal(scenario.weeks.length, 56);
  assert.ok(Math.abs(scenario.weeks[4].totals.cashEnd - 9329.49) <= 1);
});
