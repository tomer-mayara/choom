import { expect, test } from "bun:test";
import { baselineSchema } from "@choom/baseline-model";
import { checkBaselineDisplayLimits } from "../../../src/lib/baseline-display-limits.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";

test("source-use and legacy-link budgets remain independent", () => {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const original = fixtureItem(assessment.uses);
  assessment.uses = Array.from({ length: 2000 }, (_, index) => ({ ...structuredClone(original), id: `use-${index}` }));
  fixtureItem(input.interfaces).allowedConsumers.value = ["checkout", "billing"];
  const parsed = baselineSchema.parse(input);
  expect(() => checkBaselineDisplayLimits(parsed)).not.toThrow();
});
