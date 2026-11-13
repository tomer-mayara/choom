import { expect, test } from "bun:test";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { baselineExample, fixtureItem } from "../../support/baseline-fixtures.ts";
import { documentationAtBudget, enrichedBaseline, excessiveDocumentation } from "../../support/interface-documentation-fixtures.ts";

test.each([
  "entries per interface", "examples per entry", "descriptive text bytes", "sample text bytes", "total documentation bytes",
])("rejects excessive %s", (limit) => {
  const result = baselineSchema.safeParse(excessiveDocumentation(limit));
  expect(result.success).toBe(false);
  expect(result.error?.issues.some((issue) => /limit/i.test(issue.message))).toBe(true);
});

test("the exact documentation byte budget includes compact-array delimiters and metadata", () => {
  const input = documentationAtBudget(2 * 1024 * 1024);
  expect(baselineSchema.parse(input)).toEqual(input);
  fixtureItem(input.interfaces).documentation.summary.evidenceRefs.push("extra-metadata");
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test("UTF-8 byte limits accept exact multibyte values and reject one extra byte", () => {
  const input = enrichedBaseline();
  const docs = fixtureItem(input.interfaces).documentation;
  docs.summary.value = "é".repeat(4096);
  const sample = fixtureItem(fixtureItem(docs.entries).examples);
  sample.content.value.text = "é".repeat(8192);
  docs.summary.evidenceRefs = ["é".repeat(2048)];
  expect(baselineSchema.parse(input)).toEqual(input);
  docs.summary.evidenceRefs[0] += "x";
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test("new metadata limits do not tighten old baseline fields", () => {
  const input = baselineExample();
  fixtureItem(input.interfaces).promises.evidenceRefs = ["x".repeat(4097)];
  fixtureItem(input.interfaces).name = "x".repeat(8193);
  expect(baselineSchema.parse(input)).toEqual(input);
  expect(baselineSchema.parse({ ...input, formatVersion: 2 })).toEqual({ ...input, formatVersion: 2 });
});
