import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { z } from "zod";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { discoveryResultSchema } from "@choom/baseline-model/discovery-result";
import type { DiscoveryResult } from "@choom/baseline-model/contracts";
import { discoveryFixture } from "../../support/discovery-fixtures.ts";

// The discovery result contract: the generated structural schema and the runtime
// schema of @choom/baseline-model accept and refuse the same shapes. The runtime
// schema also owns the UTF-8 byte limits, the limit of 5,000 questions and gaps
// together, the 4 MiB text budget and the unique IDs.
const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }))
  .compile({ $ref: "DiscoveryResult.json" });
type Input = Record<string, unknown> & { questions: Record<string, unknown>[]; gaps: Record<string, unknown>[] };
type Change = (input: Input) => void;

function changed(change: Change): unknown {
  const input = structuredClone(discoveryFixture().result) as unknown as Input;
  change(input);
  return input;
}

function record(list: Record<string, unknown>[], index = 0): Record<string, unknown> {
  const item = list[index];
  if (item === undefined) throw new Error(`The discovery fixture needs record ${index}.`);
  return item;
}

function copies(list: Record<string, unknown>[], count: number, prefix: string): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({ ...record(list), id: `${prefix}-${index}` }));
}

test("the runtime schema returns the generated discovery contract", () => {
  expectTypeOf<z.output<typeof discoveryResultSchema>>().toEqualTypeOf<DiscoveryResult>();
});

test.each<[string, Change]>([
  ["without a change", () => {}],
  ["with any value in the fields that the viewer does not read", (input) => {
    Object.assign(input, { runRef: null, overview: "not read", inspectedPaths: { any: [1, true, null] } });
  }],
  ["with no questions or gaps", (input) => { input.questions = []; input.gaps = []; }],
  ["with a gap kind that the viewer does not know", (input) => { record(input.gaps).kind = "a-new-kind"; }],
  ["with 100 subjects and exact UTF-8 limits", (input) => {
    Object.assign(record(input.questions), { subjectRefs: Array.from({ length: 100 }, (_, index) => `s${index}`),
      text: "é".repeat(8192), evidenceRefs: ["é".repeat(2048)] });
  }],
])("a discovery result conforms at both boundaries %s", (_name, change) => {
  const input = changed(change);
  expect(structure(input)).toBe(true);
  expect<unknown>(discoveryResultSchema.parse(input)).toEqual(input);
});

test.each<[string, Change]>([
  ["format version 1", (input) => { input.formatVersion = 1; }],
  ["another kind", (input) => { input.kind = "interface-duplication-review"; }],
  ["a baseline reference that is not an ID", (input) => { input.baselineRef = "Baseline 1"; }],
  ["a digest with capital letters", (input) => { input.baselineDigest = "0123456789ABCDEF".repeat(4); }],
  ["no digest", (input) => { delete input.baselineDigest; }],
  ["no field that the viewer does not read", (input) => { delete input.inspectedPaths; }],
  ["an unknown top-level field", (input) => { input.notes = []; }],
  ["a question with another field", (input) => { record(input.questions).answer = "Yes"; }],
  ["a question without text", (input) => { delete record(input.questions).text; }],
  ["a question with blank text", (input) => { record(input.questions).text = " \n"; }],
  ["a question without a subject", (input) => { record(input.questions).subjectRefs = []; }],
  ["a question with 101 subjects", (input) => {
    record(input.questions).subjectRefs = Array.from({ length: 101 }, (_, index) => `s${index}`);
  }],
  ["a question without evidence", (input) => { record(input.questions).evidenceRefs = []; }],
  ["a gap without a kind", (input) => { delete record(input.gaps).kind; }],
  ["a gap with a blank reason", (input) => { record(input.gaps).reason = " "; }],
  ["a gap with a blank subject", (input) => { record(input.gaps).subjectRefs = [" "]; }],
  ["5,001 questions", (input) => { input.questions = copies(input.questions, 5_001, "question"); }],
])("both boundaries refuse %s", (_name, change) => {
  const input = changed(change);
  expect(structure(input)).toBe(false);
  expect(discoveryResultSchema.safeParse(input).success).toBe(false);
});

test.each<[string, Change]>([
  ["a reference of 4,098 UTF-8 bytes in 2,049 characters", (input) => { record(input.questions).subjectRefs = ["é".repeat(2049)]; }],
  ["a text of 16,386 UTF-8 bytes in 8,193 characters", (input) => { record(input.gaps).reason = "é".repeat(8193); }],
  ["5,001 questions and gaps together", (input) => {
    input.questions = copies(input.questions, 2_600, "question");
    input.gaps = copies(input.gaps, 2_401, "gap");
  }],
  ["a question and a gap with the same ID", (input) => { record(input.gaps).id = record(input.questions).id; }],
  ["more than 4 MiB of text values", (input) => {
    input.questions = copies(input.questions, 263, "question").map((question) => ({ ...question, text: "x".repeat(16_000) }));
  }],
])("the runtime boundary owns the limit: it refuses %s", (_name, change) => {
  const input = changed(change);
  expect(structure(input)).toBe(true);
  expect(discoveryResultSchema.safeParse(input).success).toBe(false);
});
