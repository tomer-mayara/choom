import { describe, expect, test } from "bun:test";
import { checkSubjects, type SubjectInputs } from "../../src/record-subjects.ts";

// The shared record checks of Stages 4 to 6 check that each subject of a question or
// gap names something of the run. A gap that Stage 1 finish copied from a tool
// record keeps the subjects of the tool.
const item = (id: string): { id: string } => ({ id });
const question = (subjectRefs: string[]) => ({ id: "q-1", subjectRefs, text: "Which file starts the service?", evidenceRefs: ["e"] });
const gap = (subjectRefs: string[], id = "gap-1", evidenceRefs = ["e"]) =>
  ({ id, kind: "deferred", subjectRefs, reason: "Not reviewed.", evidenceRefs });

function inputs(discovery: { questions?: unknown[]; gaps?: unknown[] }): SubjectInputs {
  return {
    discovery: { questions: discovery.questions ?? [], gaps: discovery.gaps ?? [] },
    snapshotRef: "snapshot-001",
    paths: ["cli.ts", "src/billing/invoice.ts", "src/http/routes.ts", "test/app.test.ts"],
    candidateIds: new Set(["cli-candidate"]),
    baseline: { components: [item("billing"), item("http")], interfaces: [item("orders-api")], resources: [item("invoices")],
      rules: [item("billing-owns-invoices")] },
  };
}

describe("checkSubjects", () => {
  test.each([
    ["a file of the snapshot", "src/billing/invoice.ts"],
    ["a folder that holds a file, without a final /", "src"],
    ["a folder that holds a file, with a final /", "src/billing/"],
    ["the snapshot ID", "snapshot-001"],
    ["a question ID", "q-1"],
    ["a gap ID", "gap-1"],
    ["an entry candidate ID", "cli-candidate"],
    ["a component ID", "billing"],
    ["an interface ID", "orders-api"],
    ["a resource ID", "invoices"],
    ["a rule ID", "billing-owns-invoices"],
    ["a field of a component", "billing.purpose"],
    ["a field below a field of an interface", "orders-api.documentation.entries.list-orders.signature"],
  ])("accepts a subject that names %s", (_name, subject) => {
    expect(() => checkSubjects(inputs({ questions: [question([subject])], gaps: [gap([subject])] }))).not.toThrow();
  });

  test.each([
    ["names nothing", "old-billing"],
    ["names a folder that holds no snapshot file", "docs"],
    ["is the start of a folder name", "sr"],
    ["is the start of a file name", "src/billing/invoice"],
    ["names a file with a final /", "cli.ts/"],
    ["names a folder with two final /", "src//"],
    ["names the root folder", "."],
    ["names a folder with a leading ./", "./src"],
    ["names a subtree selector", "src/**"],
    ["names a symbol of a file", "src/billing/invoice.ts#computePrice"],
    ["names a field of no item", "payments.purpose"],
    ["starts with an item ID but not with the ID and a dot", "billing-api"],
  ])("refuses a subject that %s, with the question ID and the subject", (_name, subject) => {
    expect(() => checkSubjects(inputs({ questions: [question(["billing", subject])] }))).toThrow(new Error(
      `Question q-1 names the subject ${subject}, which is not a file or folder of the snapshot, the snapshot ID, ` +
      "a question or gap, an entry candidate or a baseline item."));
  });

  test("refuses a gap subject that names nothing, with the gap ID and the subject", () => {
    expect(() => checkSubjects(inputs({ gaps: [gap(["cli.ts", "plugin-runner"])] }))).toThrow(new Error(
      "Gap gap-1 names the subject plugin-runner, which is not a file or folder of the snapshot, the snapshot ID, " +
      "a question or gap, an entry candidate or a baseline item."));
  });

  // A tool record names missing inputs and paths outside the snapshot on purpose.
  test("does not check the subjects of a gap that Stage 1 finish copied from a tool record", () => {
    const toolGap = gap(["tsconfig.missing.json", "/shared/global.d.ts"], "s1-settings-gap-002", ["settings-001#/gaps/1"]);
    expect(() => checkSubjects(inputs({ gaps: [toolGap] }))).not.toThrow();
  });

  test("checks a gap with the ID of a tool gap whose evidence is not its place in the tool record", () => {
    const review = gap(["tsconfig.missing.json"], "s1-settings-gap-002", ["settings-001#/gaps/0"]);
    expect(() => checkSubjects(inputs({ gaps: [review] }))).toThrow(new Error(
      "Gap s1-settings-gap-002 names the subject tsconfig.missing.json, which is not a file or folder of the snapshot, " +
      "the snapshot ID, a question or gap, an entry candidate or a baseline item."));
  });
});
