import { expect, test } from "bun:test";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { checkBaselineDisplayLimits } from "../../../src/lib/baseline-display-limits.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { documentationAtBudget } from "../../support/interface-documentation-fixtures.ts";
import { sourceUsageAtBudget, sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";

test("all use records count before filtering or combining", () => {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const original = fixtureItem(assessment.uses);
  assessment.uses = Array.from({ length: 2000 }, (_, index) => ({
    ...structuredClone(original), id: `use-${index}`, kind: "type", context: "test",
  }));
  expect(baselineSchema.parse(input)).toEqual(input);
  assessment.uses.push({ ...structuredClone(original), id: "use-over-limit" });
  expect(baselineSchema.safeParse(input).error?.issues).toContainEqual(expect.objectContaining({
    path: ["sourceUsage", "assessments"], message: "The source-use limit is 2000 records.",
  }));
});

test("the source-note cap is separate from the use-record cap", () => {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const original = fixtureItem(assessment.sourceNotes);
  for (let index = 2; index < 4000; index += 1) {
    const evidenceRef = `scope-${index}`;
    assessment.evidenceRefs.push(evidenceRef);
    assessment.sourceNotes.push({ ...structuredClone(original), evidenceRef });
  }
  expect(baselineSchema.parse(input)).toEqual(input);
  assessment.evidenceRefs.push("scope-over-limit");
  assessment.sourceNotes.push({ ...structuredClone(original), evidenceRef: "scope-over-limit" });
  expect(baselineSchema.safeParse(input).error?.issues).toContainEqual(expect.objectContaining({
    path: ["sourceUsage", "assessments"], message: "The source-note limit is 4000 records.",
  }));
});

test("compact serialization measures the complete source-use object", () => {
  const input = sourceUsageAtBudget(2 * 1024 * 1024);
  expect(baselineSchema.parse(input)).toEqual(input);
  input.sourceUsage.mappingRef += "x";
  expect(baselineSchema.safeParse(input).error?.issues).toContainEqual(expect.objectContaining({
    path: ["sourceUsage"], message: "The combined source-use limit is 2097152 UTF-8 bytes.",
  }));
});

test("new references and descriptions count UTF-8 bytes", () => {
  const input = sourceUsageBaseline();
  input.sourceUsage.mappingRef = "é".repeat(2048);
  fixtureItem(input.sourceUsage.assessments).scope = "é".repeat(4096);
  expect(baselineSchema.parse(input)).toEqual(input);
  input.sourceUsage.mappingRef += "x";
  expect(baselineSchema.safeParse(input).success).toBe(false);
  input.sourceUsage.mappingRef = "selected-mapping";
  fixtureItem(input.sourceUsage.assessments).scope += "x";
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test("source-use and legacy-link budgets remain independent", () => {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const original = fixtureItem(assessment.uses);
  assessment.uses = Array.from({ length: 2000 }, (_, index) => ({ ...structuredClone(original), id: `use-${index}` }));
  fixtureItem(input.interfaces).allowedConsumers.value = ["checkout", "billing"];
  const parsed = baselineSchema.parse(input);
  expect(() => checkBaselineDisplayLimits(parsed)).not.toThrow();
});

test("version 3 retains the independent documentation budget", () => {
  const input = { ...documentationAtBudget(2 * 1024 * 1024), formatVersion: 3 as const };
  expect(baselineSchema.parse(input)).toEqual(input);
  fixtureItem(input.interfaces).documentation.summary.value += "x";
  expect(baselineSchema.safeParse(input).error?.issues).toContainEqual(expect.objectContaining({
    path: ["interfaces"], message: "The combined documentation limit is 2097152 UTF-8 bytes.",
  }));
});
