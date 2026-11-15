import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { baselineSchema } from "@choom/baseline-model";
import { invalidSymbolMembership, symbolMembershipBaseline, versionFourSymbolMembership } from "../../support/symbol-membership-fixtures.ts";

const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "Baseline.json" });

test("version 5 keeps symbol selectors through both contracts", () => {
  const input = symbolMembershipBaseline();
  expect(structure(input)).toBe(true);
  expect<unknown>(baselineSchema.parse(input)).toEqual(input);
});

test("version 4 refuses symbol selectors at both boundaries", () => {
  const { input } = versionFourSymbolMembership();
  expect(structure(input)).toBe(false);
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test("a repeated symbol selector fails at both boundaries", () => {
  const { input } = invalidSymbolMembership("the same symbol selector twice");
  expect(structure(input)).toBe(false);
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test.each([
  "a symbol path that names a subtree", 'a symbol path that contains "#"', "a symbol name that is not an identifier",
  "a membership with no paths or symbols",
])("the runtime boundary owns %s", (problem) => {
  const { input } = invalidSymbolMembership(problem);
  expect(structure(input)).toBe(true);
  expect(baselineSchema.safeParse(input).success).toBe(false);
});
