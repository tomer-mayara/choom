import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { z } from "zod";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import type { Baseline } from "../../../src/domain/generated/contracts.ts";
import { accepted, baselineExample, fixtureItem, invalidBaseline, proposed, reviewedBaseline } from "../../support/baseline-fixtures.ts";

const validateStructure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }))
  .compile({ $ref: "Baseline.json" });

test("the validator returns the generated baseline contract", () => {
  expectTypeOf<z.output<typeof baselineSchema>>().toEqualTypeOf<Baseline>();
});

test("reviewed and synthetic baselines conform without changing recorded data", () => {
  const synthetic = baselineExample();
  fixtureItem(synthetic.rules).check = accepted(JSON.parse('{"__proto__":{"recorded":true},"nested":{"constructor":[]}}'));
  for (const input of [reviewedBaseline("empty"), reviewedBaseline("full"), synthetic]) {
    expect(validateStructure(input)).toBe(true);
    const baseline = baselineSchema.parse(input);
    expect(validateStructure(baseline)).toBe(true);
    expect<unknown>(baseline).toEqual(input);
  }
});

test.each([
  ["missing acceptance reference", { ...proposed("Create orders"), status: "accepted" }],
  ["proposed acceptance reference", { ...proposed("Create orders"), acceptanceRef: "review" }],
  ["blank evidence reference", { ...proposed("Create orders"), evidenceRefs: [" "] }],
  ["bare-null statement", null],
  ["unknown statement field", { ...proposed("Create orders"), confidence: 1 }],
])("both boundaries reject %s", (_name, purpose) => {
  const input = baselineExample();
  Object.assign(fixtureItem(input.components), { purpose });
  expect(validateStructure(input)).toBe(false);
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test("the runtime boundary owns references, cycles, IDs, and selector syntax", () => {
  for (const problem of [
    "a duplicate item ID", "an owner ID that does not exist", "a cycle of component parents",
    "an unsupported membership selector",
  ]) {
    const { input } = invalidBaseline(problem);
    expect(validateStructure(input)).toBe(true);
    expect(baselineSchema.safeParse(input).success).toBe(false);
  }
});
