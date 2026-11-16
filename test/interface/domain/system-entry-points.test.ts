import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { stringify } from "yaml";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { baselineSchema } from "@choom/baseline-model";
import { baselineCodec } from "../../../src/lib/baseline-yaml.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { systemEntryPointsAtBudget, systemEntryPointsBaseline } from "../../support/system-entry-points-fixtures.ts";

const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "Baseline.json" });
type EntryBaseline = ReturnType<typeof systemEntryPointsBaseline>;
const entryAt = (input: EntryBaseline, index: number) => fixtureItem(input.systemEntryPoints.entries, index);
function sourceAt(input: EntryBaseline, index: number) {
  const source = entryAt(input, index).source;
  if (!source) throw new Error("Missing source fixture");
  return source;
}

function invalidAt(input: unknown, path: string) {
  const parsed = baselineSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  expect(parsed.error?.issues.some((issue) => issue.path.join(".") === path)).toBe(true);
  const decoded = baselineCodec.decode(stringify(JSON.parse(JSON.stringify(input))));
  expect(decoded).toMatchObject({ status: "failure", code: "invalid-document" });
  if (decoded.status === "failure") expect(decoded.message).toContain(path);
}

test("version 4 keeps system entries, interface documentation, and source use through both contracts", () => {
  const input = systemEntryPointsBaseline();
  expect(structure(input)).toBe(true);
  expect(baselineSchema.parse(input)).toEqual(input);
  expect(baselineCodec.decode(stringify(input))).toMatchObject({ status: "success", baseline: input });
});

test("version 4 may omit both optional assessments", () => {
  const { systemEntryPoints: _entries, sourceUsage: _source, ...input } = systemEntryPointsBaseline();
  expect(structure(input)).toBe(true);
  expect(baselineSchema.parse(input)).toEqual(input);
  expect(baselineCodec.decode(stringify(input))).toMatchObject({ status: "success", baseline: input });
});

test("system entries remain valid when source use is absent", () => {
  const { sourceUsage: _source, ...input } = systemEntryPointsBaseline();
  expect(structure(input)).toBe(true);
  expect(baselineSchema.parse(input)).toEqual(input);
});

test("a present empty entry list keeps its review scope", () => {
  const input = systemEntryPointsBaseline();
  input.systemEntryPoints.entries = [];
  expect(structure(input)).toBe(true);
  expect(baselineSchema.parse(input)).toEqual(input);
});

test.each([1, 2, 3])("version %i rejects the version 4 assessment", (version) => {
  const { sourceUsage: _source, ...input } = systemEntryPointsBaseline();
  const older = {
    ...input, formatVersion: version,
    interfaces: version === 1 ? input.interfaces.map(({ documentation: _documentation, ...item }) => item) : input.interfaces,
  };
  expect(structure(older)).toBe(false);
  expect(baselineSchema.safeParse(older).success).toBe(false);
});

test.each(["systemEntryPoints", "entry", "source", "location"])("version 4 %s rejects undeclared fields", (target) => {
  const input = systemEntryPointsBaseline();
  const entry = entryAt(input, 1);
  const source = sourceAt(input, 1);
  const targets = { systemEntryPoints: input.systemEntryPoints, entry, source, location: source.location };
  Object.assign(targets[target as keyof typeof targets], { invented: true });
  expect(structure(input)).toBe(false);
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test.each([
  ["unknown component", (input: EntryBaseline) => { entryAt(input, 0).componentId = "missing"; }, "entries.0.componentId"],
  ["unknown interface", (input: EntryBaseline) => { entryAt(input, 1).interfaceId = "missing"; }, "entries.1.interfaceId"],
  ["unknown documented entry", (input: EntryBaseline) => { entryAt(input, 1).entryId = "missing"; }, "entries.1.entryId"],
  ["entry without interface", (input: EntryBaseline) => { Reflect.deleteProperty(entryAt(input, 1), "interfaceId"); }, "entries.1.entryId"],
  ["duplicate entry ID", (input: EntryBaseline) => { entryAt(input, 1).id = "checkout-cli"; }, "entries.1.id"],
  ["unsafe path", (input: EntryBaseline) => { entryAt(input, 0).path = "../main.ts"; }, "entries.0.path"],
  ["uncited source", (input: EntryBaseline) => { sourceAt(input, 1).evidenceRef = "unlisted-source"; }, "entries.1.source.evidenceRef"],
  ["fragmented source", (input: EntryBaseline) => {
    const source = sourceAt(input, 1);
    source.evidenceRef = "reviewed-invoice-route#/line/1";
    entryAt(input, 1).evidenceRefs = [source.evidenceRef];
  }, "entries.1.source.evidenceRef"],
  ["other source snapshot", (input: EntryBaseline) => { sourceAt(input, 1).location.snapshotRef = "other"; }, "entries.1.source.location.snapshotRef"],
  ["other source path", (input: EntryBaseline) => { sourceAt(input, 1).location.path = "other/invoice.ts"; }, "entries.1.source.location.path"],
  ["reversed source lines", (input: EntryBaseline) => { sourceAt(input, 1).location.lines = [12, 1]; }, "entries.1.source.location.lines"],
  ["duplicate scope evidence", (input: ReturnType<typeof systemEntryPointsBaseline>) => { input.systemEntryPoints.evidenceRefs.push("reviewed-entry-scope"); }, "evidenceRefs"],
  ["duplicate entry evidence", (input: EntryBaseline) => { entryAt(input, 0).evidenceRefs.push("reviewed-cli-start"); }, "entries.0.evidenceRefs"],
  ["blank scope evidence", (input: ReturnType<typeof systemEntryPointsBaseline>) => { input.systemEntryPoints.evidenceRefs = []; }, "evidenceRefs"],
  ["blank entry evidence", (input: EntryBaseline) => { entryAt(input, 0).evidenceRefs = []; }, "entries.0.evidenceRefs"],
] as const)("rejects %s", (_description, mutate, suffix) => {
  const input = systemEntryPointsBaseline();
  mutate(input);
  invalidAt(input, `systemEntryPoints.${suffix}`);
});

test.each([
  ["snapshot", "snapshotRef"], ["mapping", "mappingRef"],
] as const)("entry and source-use %s refs must agree", (_description, field) => {
  const input = systemEntryPointsBaseline();
  input.systemEntryPoints[field] = "other-ref";
  invalidAt(input, `systemEntryPoints.${field}`);
});

test("version 4 still validates source uses", () => {
  const input = systemEntryPointsBaseline();
  fixtureItem(fixtureItem(input.sourceUsage.assessments).uses).consumerId = "missing";
  invalidAt(input, "sourceUsage.assessments.0.uses.0.consumerId");
});

test("2,000 entries pass; 2,001 entries fail", () => {
  const input = systemEntryPointsBaseline();
  const first = input.systemEntryPoints.entries[0];
  if (!first) throw new Error("Missing entry fixture");
  input.systemEntryPoints.entries = Array.from({ length: 2000 }, (_, index) => ({ ...first, id: `start-${index}` }));
  expect(baselineSchema.safeParse(input).success).toBe(true);
  input.systemEntryPoints.entries.push({ ...first, id: "start-2000" });
  invalidAt(input, "systemEntryPoints.entries");
});

test.each([
  ["ID", "entries.0.id", (input: EntryBaseline) => { entryAt(input, 0).id = `entry-${"a".repeat(4091)}`; }],
  ["reference", "entries.0.evidenceRefs.0", (input: EntryBaseline) => { entryAt(input, 0).evidenceRefs[0] = "é".repeat(2049); }],
  ["path", "entries.0.path", (input: EntryBaseline) => { entryAt(input, 0).path = `src/${"a".repeat(4093)}`; }],
  ["label", "entries.0.label", (input: EntryBaseline) => { entryAt(input, 0).label = "é".repeat(4097); }],
  ["scope", "scope", (input: ReturnType<typeof systemEntryPointsBaseline>) => { input.systemEntryPoints.scope = "é".repeat(4097); }],
  ["limitation", "limitations.0", (input: ReturnType<typeof systemEntryPointsBaseline>) => { input.systemEntryPoints.limitations.push("é".repeat(4097)); }],
] as const)("rejects overlong %s in UTF-8 bytes", (_description, suffix, mutate) => {
  const input = systemEntryPointsBaseline();
  mutate(input);
  invalidAt(input, `systemEntryPoints.${suffix}`);
});

test("the assessment accepts exactly 2 MiB of compact JSON and rejects one byte more", () => {
  const input = systemEntryPointsAtBudget(2 * 1024 * 1024);
  expect(new TextEncoder().encode(JSON.stringify(input.systemEntryPoints)).byteLength).toBe(2 * 1024 * 1024);
  expect(baselineSchema.safeParse(input).success).toBe(true);
  const expandable = input.systemEntryPoints.entries.find((entry) => entry.label.length < 8 * 1024);
  if (!expandable) throw new Error("Missing expandable entry label");
  expandable.label += "x";
  invalidAt(input, "systemEntryPoints");
});

test("unknown entry fields do not appear in decoder errors", () => {
  const input = systemEntryPointsBaseline();
  Object.assign(input.systemEntryPoints, { "secret-private-key": "secret-value" });
  const result = baselineCodec.decode(stringify(input));
  expect(result).toMatchObject({ status: "failure", code: "invalid-document" });
  if (result.status === "failure") {
    expect(result.message).toContain("systemEntryPoints");
    expect(result.message).not.toContain("secret-private-key");
    expect(result.message).not.toContain("secret-value");
  }
});
