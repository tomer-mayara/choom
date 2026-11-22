import { describe, expect, test } from "bun:test";
import type { Baseline, BaselineDecision, BaselineDecisionValue } from "@choom/baseline-model/contracts";
import { checkBaselineDocument, validateBaseline, validateDocumentation, type VersionDecisions }
  from "../../../src/record-baseline.ts";

// The statements of a baseline in the producer's record checks: the order in which
// the checks visit them, and the statement names in their messages. The checks run
// the shared baseline rules of @choom/baseline-model, so this is an integration suite.
type Fields = Record<string, unknown>;
interface Issue { id: string; kind: string; reason: string; subjectRefs: string[]; evidenceRefs: string[] }

const proposed = (value: unknown): Fields => ({ value, status: "proposed", evidenceRefs: ["launch"] });
const entryPath = "orders-api.documentation.entries.list-orders";
// Every statement of the fixture, in the order of the baseline.
const statementNames = ["cli.purpose", "cli.membership", "cli.groupingReason", "cli.parent", "http.purpose", "http.membership",
  "http.groupingReason", "orders-api.owner", "orders-api.publicAccess", "orders-api.allowedConsumers", "orders-api.promises",
  "orders-api.documentation.summary", `${entryPath}.kind`, `${entryPath}.description`, `${entryPath}.signature`,
  `${entryPath}.interaction`, `${entryPath}.examples.all.content`, `${entryPath}.examples.empty.content`, "orders.identity",
  "orders.owner", "orders.accessRules", "only-http.subject", "only-http.expected", "only-http.check"];

// A version 2 baseline with a component parent, one documented interface, a resource and a rule.
function documentedBaseline(): Fields {
  const component = (id: string, file: string): Fields => ({ id, name: id.toUpperCase(), purpose: proposed(`Run ${file}.`),
    membership: proposed({ paths: [file] }), groupingReason: proposed("One file.") });
  return {
    formatVersion: 2, id: "base-1", parentId: null,
    components: [{ ...component("cli", "cli.ts"), parent: proposed(null) }, component("http", "http.ts")],
    interfaces: [{ id: "orders-api", name: "Orders API", owner: proposed("http"), publicAccess: proposed(["GET /orders"]),
      allowedConsumers: proposed(["cli"]), promises: proposed({ behavior: "List orders.", data: "Orders.", errors: "Errors.",
        lifecycle: "Active." }),
      documentation: { summary: proposed("Order operations."), sourceNotes: [], entries: [{ id: "list-orders",
        name: "List orders", accessPoint: "GET /orders", kind: proposed("function"), description: proposed("Return the orders."),
        signature: proposed("listOrders(): Order[]"),
        interaction: proposed({ input: "None.", success: "The orders.", failures: "Errors.", effects: "None." }),
        examples: [{ id: "all", name: "All orders", basis: "illustrative", content: proposed({ text: "listOrders()" }) },
          { id: "empty", name: "No orders", basis: "illustrative", content: proposed({ text: "listOrders() // []" }) }] }] } }],
    resources: [{ id: "orders", name: "Orders", identity: proposed("The order table."), owner: proposed("http"),
      accessRules: proposed("Only http writes.") }],
    rules: [{ id: "only-http", name: "Only HTTP", subject: proposed({ component: "http" }), expected: proposed({ writes: "orders" }),
      check: proposed({ method: "review" }) }],
  };
}

// The statement that a name such as orders-api.documentation.entries.list-orders.kind gives.
function statementOf(baseline: Fields, name: string): Fields {
  const [itemId, ...path] = name.split(".");
  let value: unknown = (["components", "interfaces", "resources", "rules"] as const)
    .flatMap((key) => baseline[key] as Fields[]).find((item) => item.id === itemId);
  for (let index = 0; index < path.length; index++) {
    const key = path[index] ?? "";
    const fields = value as Fields;
    if (key !== "entries" && key !== "examples") value = fields[key];
    else {
      const id = path[++index];
      value = (fields[key] as Fields[]).find((item) => item.id === id);
    }
  }
  if (value === undefined) throw new Error(`The fixture has no statement ${name}.`);
  return value as Fields;
}

// The checks of the item statements do not read the documentation. A documentation
// entry needs a public access point, so a test of a null access list removes it.
function withoutDocumentation(baseline: Fields): Fields {
  delete statementOf(baseline, "orders-api").documentation;
  return baseline;
}

function accept(baseline: Fields, names: readonly string[]): Fields {
  for (const name of names) Object.assign(statementOf(baseline, name), { status: "accepted", acceptanceRef: "decisions-001" });
  return baseline;
}

// The calls that a check makes to its claim and evidence callbacks, with the names of the cited statements.
function recordedCalls(baseline: Baseline): { calls: string[]; claim(id: unknown): void; evidence(record: unknown): void } {
  const names = new Map<unknown, string>(statementNames.map((name) => [statementOf(baseline as unknown as Fields, name), name]));
  const calls: string[] = [];
  return { calls, claim: (id) => calls.push(`claim ${String(id)}`),
    evidence: (record) => calls.push(`evidence ${names.get(record) ?? "another record"}`) };
}

function discovery(subjects: string[] = []): Fields {
  const gaps: Issue[] = subjects.length ? [{ id: "gap-1", kind: "intent", reason: "Unknown.", subjectRefs: subjects,
    evidenceRefs: ["launch"] }] : [];
  return { questions: [], gaps };
}

const noSources = { records: new Map(), verify: () => undefined, verified: new Set() };

// A first version has no parent, and publication accepts no intent in it.
describe("the statuses of a first version", () => {
  test.each(statementNames.map((name, index) => [name, index] as const))(
    "names %s when it and every later statement are accepted", (name, index) => {
      const input = accept(documentedBaseline(), statementNames.slice(index));
      expect(() => checkBaselineDocument(input)).toThrow(new Error(`Only proposed intent is supported: ${name}`));
    });

  test("accepts a baseline whose statements are all proposed", () => {
    expect(() => checkBaselineDocument(documentedBaseline())).not.toThrow();
  });
});

// A next version is made from a saved decision record of the run. Its accepted
// statements name that record, and the record decides each of them.
describe("the statuses of a next version", () => {
  const recordPath = "decisions/decisions-001.yaml";
  const recordSha256 = "0123456789abcdef".repeat(4);
  const acceptAll = statementNames.map((name): BaselineDecision => {
    const [itemId = "", ...field] = name.split(".");
    return { action: "accept", itemId, field: field.join(".") };
  });

  // The documented baseline as the next version of base-1, with the named statements accepted.
  function nextVersion(names: readonly string[], change: Fields = {}): Fields {
    return { ...accept(documentedBaseline(), names), id: "base-1-decisions-001", parentId: "base-1", ...change };
  }

  // The decision record that the version record links, and the record that the run holds.
  function decisionRecord(entries: BaselineDecision[], savedSha256 = recordSha256): VersionDecisions {
    return { link: { id: "decisions-001", path: recordPath, sha256: recordSha256 }, saved: { sha256: savedSha256, decisions: {
      formatVersion: 1, id: "decisions-001", baselineRef: "base-1", baselineDigest: "f".repeat(64),
      decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-15T10:30:00Z", entries } } };
  }

  test("accepts accepted statements that the decision record accepts, and keeps the others proposed", () => {
    const decided = statementNames.filter((_name, index) => index % 2 === 0);
    const version = checkBaselineDocument(nextVersion(decided), decisionRecord(acceptAll.filter((_entry, index) => index % 2 === 0)));
    expect(statementNames.map((name) => statementOf(version as unknown as Fields, name).status))
      .toEqual(statementNames.map((name) => (decided.includes(name) ? "accepted" : "proposed")));
  });

  test("accepts a corrected statement that has the new value of its correction, and refuses another value", () => {
    const corrected = (newValue: BaselineDecisionValue): BaselineDecision[] =>
      [{ action: "correct", itemId: "http", field: "purpose", oldValue: "Run the server.", newValue }];
    const input = nextVersion(["http.purpose"]);
    expect(() => checkBaselineDocument(input, decisionRecord(corrected("Run http.ts.")))).not.toThrow();
    expect(() => checkBaselineDocument(input, decisionRecord(corrected("Run the server.")))).toThrow(new Error(
      `http.purpose is accepted, but its value is not the new value of its correction in ${recordPath}.`));
  });

  test("refuses an accepted statement that names another decision record", () => {
    const input = nextVersion(["cli.purpose"]);
    Object.assign(statementOf(input, "cli.purpose"), { acceptanceRef: "decisions-002" });
    expect(() => checkBaselineDocument(input, decisionRecord(acceptAll))).toThrow(new Error(
      `cli.purpose is accepted with the acceptanceRef decisions-002, but the version is made from the decision record ${recordPath}.`));
  });

  test("refuses an accepted statement that the decision record does not decide", () => {
    const input = nextVersion(["cli.purpose", "orders.owner"]);
    expect(() => checkBaselineDocument(input, decisionRecord(acceptAll.slice(0, 1)))).toThrow(new Error(
      `orders.owner is accepted, but the decision record ${recordPath} has no entry for it.`));
  });

  test("refuses a saved decision record whose SHA-256 is not the one that the version record gives", () => {
    const changed = "f".repeat(64);
    expect(() => checkBaselineDocument(nextVersion(["cli.purpose"]), decisionRecord(acceptAll, changed))).toThrow(new Error(
      `The decision record ${recordPath} changed after the version was made: its SHA-256 is ${changed}, ` +
      `but the version record gives ${recordSha256}.`));
  });

  test.each([["another baseline", "base-0"], ["no baseline", null]])(
    "refuses a version whose parent is %s, not the baseline of its decision record", (_name, parentId) => {
      expect(() => checkBaselineDocument(nextVersion(["cli.purpose"], { parentId }), decisionRecord(acceptAll))).toThrow(new Error(
        `The next version names ${JSON.stringify(parentId)} as its parent, but the decision record ${recordPath} is for ` +
        "the baseline base-1."));
    });

  test("refuses a version whose ID is the ID of an item, because the baseline ID is reserved", () => {
    const input = nextVersion(["cli.purpose"], { id: "orders-api" });
    expect(() => checkBaselineDocument(input, decisionRecord(acceptAll))).toThrow(new Error(
      "The ID orders-api of the version is also the ID of the interface orders-api. The baseline ID is reserved. " +
      "Use another decision record ID."));
  });
});

describe("the run checks of the baseline items", () => {
  test("claim each item ID, then check the evidence of each item statement without its documentation, in item order", () => {
    const baseline = checkBaselineDocument(documentedBaseline());
    const recorded = recordedCalls(baseline);
    validateBaseline({ baseline, discovery: discovery(), claim: recorded.claim, evidence: recorded.evidence });
    const statements = (id: string): string[] => statementNames
      .filter((name) => name.startsWith(`${id}.`) && !name.includes(".documentation.")).map((name) => `evidence ${name}`);
    expect(recorded.calls).toEqual(["cli", "http", "orders-api", "orders", "only-http"]
      .flatMap((id) => [`claim ${id}`, ...statements(id)]));
  });

  test.each(["orders-api.owner", "orders-api.publicAccess", "orders-api.allowedConsumers", "orders-api.promises", "orders.identity",
    "orders.owner", "orders.accessRules", "only-http.subject", "only-http.expected", "only-http.check"])(
    "refuse a null %s that no question or gap names", (name) => {
      const input = withoutDocumentation(documentedBaseline());
      Object.assign(statementOf(input, name), { value: null });
      const baseline = checkBaselineDocument(input);
      const check = (subjects: string[]) => (): unknown =>
        validateBaseline({ baseline, discovery: discovery(subjects), claim: () => undefined, evidence: () => undefined });
      expect(check([])).toThrow(new Error(`Unexplained unknown intent: ${name}`));
      expect(check([`${name.split(".")[0] ?? ""}.other`])).not.toThrow();
    });

  // The rule of the viewer: a subject names an item when it equals the item ID or starts with the ID and a dot.
  test("accept a null statement of an item that a subject names by its ID, and not by a longer ID or another case", () => {
    const input = withoutDocumentation(documentedBaseline());
    Object.assign(statementOf(input, "orders.owner"), { value: null });
    const baseline = checkBaselineDocument(input);
    const check = (subjects: string[]) => (): unknown =>
      validateBaseline({ baseline, discovery: discovery(subjects), claim: () => undefined, evidence: () => undefined });
    expect(check(["orders"])).not.toThrow();
    expect(check(["orders-api.owner", "ordersx.owner", "Orders.owner", "orders"])).not.toThrow();
    expect(check(["orders-api.owner", "ordersx.owner", "Orders.owner"])).toThrow(new Error("Unexplained unknown intent: orders.owner"));
  });

  test("name the first null statement of an item in field order, and accept a null parent", () => {
    const input = withoutDocumentation(documentedBaseline());
    for (const name of ["orders-api.promises", "orders-api.publicAccess"]) Object.assign(statementOf(input, name), { value: null });
    const baseline = checkBaselineDocument(input);
    expect(statementOf(baseline as unknown as Fields, "cli.parent").value).toBeNull();
    expect(() => validateBaseline({ baseline, discovery: discovery(), claim: () => undefined, evidence: () => undefined }))
      .toThrow(new Error("Unexplained unknown intent: orders-api.publicAccess"));
  });
});

describe("the run checks of the interface documentation", () => {
  test("check the evidence of each documentation statement in the order of the documentation", () => {
    const baseline = checkBaselineDocument(documentedBaseline());
    const recorded = recordedCalls(baseline);
    validateDocumentation({ baseline, discovery: discovery(), evidence: recorded.evidence, source: noSources, reviewedRanges: [] });
    expect(recorded.calls).toEqual(statementNames.filter((name) => name.includes(".documentation."))
      .map((name) => `evidence ${name}`));
  });

  test.each([["orders-api.documentation.summary"], [`${entryPath}.description`], [`${entryPath}.signature`]])(
    "refuse a null %s unless a question or gap names it", (name) => {
      const input = documentedBaseline();
      Object.assign(statementOf(input, name), { value: null });
      const baseline = checkBaselineDocument(input);
      const check = (subjects: string[]) => (): void =>
        validateDocumentation({ baseline, discovery: discovery(subjects), evidence: () => undefined, source: noSources, reviewedRanges: [] });
      expect(check(["orders-api"])).toThrow(new Error(`Invalid or unexplained documentation fact: ${name}`));
      expect(check([name])).not.toThrow();
    });

  test("refuse a null kind unless a question or gap names it", () => {
    const input = documentedBaseline();
    const entry = statementOf(input, entryPath);
    delete entry.signature;
    delete entry.interaction;
    Object.assign(statementOf(input, `${entryPath}.kind`), { value: null });
    const baseline = checkBaselineDocument(input);
    const check = (subjects: string[]) => (): void =>
      validateDocumentation({ baseline, discovery: discovery(subjects), evidence: () => undefined, source: noSources, reviewedRanges: [] });
    expect(check([])).toThrow(new Error(`Invalid or unexplained documentation fact: ${entryPath}.kind`));
    expect(check([`${entryPath}.kind`])).not.toThrow();
  });

  test("refuse a null interaction fact unless a question or gap names that fact", () => {
    const input = documentedBaseline();
    Object.assign(statementOf(input, `${entryPath}.interaction`).value as Fields, { failures: null });
    const baseline = checkBaselineDocument(input);
    const check = (subjects: string[]) => (): void =>
      validateDocumentation({ baseline, discovery: discovery(subjects), evidence: () => undefined, source: noSources, reviewedRanges: [] });
    expect(check([`${entryPath}.interaction`])).toThrow(new Error(`Invalid or unexplained documentation fact: ${entryPath}.interaction`));
    expect(check([`${entryPath}.interaction.failures`])).not.toThrow();
  });

  test("name the first unexplained documentation statement in documentation order", () => {
    const input = documentedBaseline();
    for (const name of [`${entryPath}.signature`, `${entryPath}.description`]) Object.assign(statementOf(input, name), { value: null });
    const baseline = checkBaselineDocument(input);
    expect(() => validateDocumentation({ baseline, discovery: discovery(), evidence: () => undefined, source: noSources,
      reviewedRanges: [] })).toThrow(new Error(`Invalid or unexplained documentation fact: ${entryPath}.description`));
  });
});
