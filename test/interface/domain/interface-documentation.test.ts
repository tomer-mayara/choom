import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { accepted, fixtureItem } from "../../support/baseline-fixtures.ts";
import { enrichedBaseline } from "../../support/interface-documentation-fixtures.ts";

const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "Baseline.json" });

test("version 2 keeps every documented value and independently accepted statement", () => {
  const input = enrichedBaseline();
  const docs = fixtureItem(input.interfaces).documentation;
  Object.assign(docs, { summary: accepted("Create invoices.") });
  expect(structure(input)).toBe(true);
  expect(baselineSchema.parse(input)).toEqual(input);
});

test("documentation is optional in v2 and forbidden in v1", () => {
  const input = enrichedBaseline();
  expect(structure({ ...input, formatVersion: 1 })).toBe(false);
  expect(baselineSchema.safeParse({ ...input, formatVersion: 1 }).success).toBe(false);
  const plain = { ...input, interfaces: input.interfaces.map(({ documentation: _documentation, ...item }) => item) };
  expect(structure(plain)).toBe(true);
  expect(baselineSchema.parse(plain)).toEqual(plain);
});

test.each([
  ["missing accepted reference", { value: "Read invoices", status: "accepted", evidenceRefs: ["source"] }],
  ["bare null", null],
  ["empty evidence", { value: null, status: "proposed", evidenceRefs: [] }],
  ["unknown key", { value: null, status: "proposed", evidenceRefs: ["source"], confidence: 1 }],
])("new statement shape rejects %s at both boundaries", (_name, summary) => {
  const input = enrichedBaseline();
  Object.assign(fixtureItem(input.interfaces).documentation, { summary });
  expect(structure(input)).toBe(false);
  expect(baselineSchema.safeParse(input).success).toBe(false);
});
