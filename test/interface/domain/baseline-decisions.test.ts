import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { z } from "zod";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { baselineDecisionsSchema } from "@choom/baseline-model/baseline-decisions";
import type { BaselineDecisions } from "@choom/baseline-model/contracts";

// The decision file contract: the generated structural schema and the runtime
// schema of @choom/baseline-model accept and refuse the same shapes. The runtime
// schema also owns the calendar date and the JSON data of the values.
const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }))
  .compile({ $ref: "BaselineDecisions.json" });
type Change = (input: Record<string, unknown> & { entries: Record<string, unknown>[] }) => void;

function decisions(): BaselineDecisions {
  return {
    formatVersion: 1, id: "decisions-001", baselineRef: "baseline-example", baselineDigest: "0123456789abcdef".repeat(4),
    decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-15T10:30:00Z",
    entries: [
      { action: "accept", itemId: "billing", field: "purpose" },
      { action: "correct", itemId: "invoice-api", field: "documentation.entries.create.description",
        oldValue: "Create an invoice", newValue: null },
      { action: "correct", itemId: "invoice-access", field: "expected", oldValue: { expression: "Only checkout" },
        newValue: { expression: "Only checkout", nested: [1, true, null, { text: "x" }] } },
    ],
  };
}

function changed(change: Change): unknown {
  const input = decisions() as unknown as Parameters<Change>[0];
  change(input);
  return input;
}

const entry = (input: Parameters<Change>[0], index: number): Record<string, unknown> => {
  const item = input.entries[index];
  if (item === undefined) throw new Error(`The decision fixture needs entry ${index}.`);
  return item;
};

test("the runtime schema returns the generated decision contract", () => {
  expectTypeOf<z.output<typeof baselineDecisionsSchema>>().toEqualTypeOf<BaselineDecisions>();
});

test("accept and correct entries conform at both boundaries without a change", () => {
  for (const input of [decisions(), changed((value) => { value.decidedAt = "2026-11-15T10:30:00.125Z"; })]) {
    expect(structure(input)).toBe(true);
    expect<unknown>(baselineDecisionsSchema.parse(input)).toEqual(input);
  }
});

test.each<[string, Change]>([
  ["another format version", (input) => { input.formatVersion = 2; }],
  ["an ID that is not a lowercase ID", (input) => { input.id = "Decisions_001"; }],
  ["an ID longer than 128 characters", (input) => { input.id = "d".repeat(129); }],
  ["a baseline reference that is not an ID", (input) => { input.baselineRef = "baseline 1"; }],
  ["a digest with capital letters", (input) => { input.baselineDigest = "0123456789ABCDEF".repeat(4); }],
  ["a digest that is too short", (input) => { input.baselineDigest = "0123456789abcdef"; }],
  ["a decider that is a model", (input) => { input.decider = { name: "Ada Example", kind: "model" }; }],
  ["a decider with a blank name", (input) => { input.decider = { name: " \n", kind: "human" }; }],
  ["a decider with another field", (input) => { input.decider = { name: "Ada Example", kind: "human", role: "owner" }; }],
  ["a time with an offset", (input) => { input.decidedAt = "2026-11-15T11:30:00+01:00"; }],
  ["a time without seconds", (input) => { input.decidedAt = "2026-11-15T10:30Z"; }],
  ["a date only", (input) => { input.decidedAt = "2026-11-15"; }],
  ["no entries", (input) => { input.entries = []; }],
  ["a reject action", (input) => { entry(input, 0).action = "reject"; }],
  ["an accept entry with values", (input) => { Object.assign(entry(input, 0), { oldValue: "a", newValue: "b" }); }],
  ["a correct entry without its old value", (input) => { delete entry(input, 1).oldValue; }],
  ["a correct entry without its new value", (input) => { delete entry(input, 1).newValue; }],
  ["an entry with a blank field", (input) => { entry(input, 0).field = " "; }],
  ["an entry whose item is not an ID", (input) => { entry(input, 0).itemId = "Billing"; }],
  ["an unknown top-level field", (input) => { input.reason = "Reviewed"; }],
])("both boundaries refuse %s", (_name, change) => {
  const input = changed(change);
  expect(structure(input)).toBe(false);
  expect(baselineDecisionsSchema.safeParse(input).success).toBe(false);
});

test.each<[string, Change]>([
  ["a day that the month does not have", (input) => { input.decidedAt = "2026-02-30T10:30:00Z"; }],
  ["an hour after 23", (input) => { input.decidedAt = "2026-11-15T24:00:00Z"; }],
])("the runtime boundary owns the calendar: it refuses %s", (_name, change) => {
  const input = changed(change);
  expect(structure(input)).toBe(true);
  expect(baselineDecisionsSchema.safeParse(input).success).toBe(false);
});

test.each<[string, unknown]>([
  ["a value that is not a number", Number.NaN], ["an undefined value", undefined], ["a date", new Date(0)],
  ["a function", () => 1], ["a map", new Map()],
])("the runtime boundary refuses an old value that is not JSON data: %s", (_name, value) => {
  const input = changed((item) => { entry(item, 1).oldValue = value; });
  expect(baselineDecisionsSchema.safeParse(input).success).toBe(false);
});
