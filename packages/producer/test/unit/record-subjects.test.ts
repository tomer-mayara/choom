import { describe, expect, test } from "bun:test";
import { checkSubjects, type ItemNames, SubjectChecker, type SubjectInputs, type SubjectRecord } from "../../src/record-subjects.ts";

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

// SubjectChecker knows what a subject of a question or gap can name in a run. The
// baseline items are a mock of SubjectItems of @choom/baseline-model: it names an
// item only for the references in this map.
const namedItems = new Map([["billing", "billing"], ["billing.purpose", "billing"],
  ["orders-api.documentation.entries.list-orders.signature", "orders-api"]]);
const items: ItemNames = { namedItem: (reference) => namedItems.get(reference) };
const asked = (subjectRefs: string[], id = "q-1"): SubjectRecord =>
  ({ id, subjectRefs, text: "Which file starts the service?", evidenceRefs: ["e"] });
const found = (subjectRefs: string[], id = "gap-1", evidenceRefs = ["e"]): SubjectRecord =>
  ({ id, kind: "deferred", subjectRefs, reason: "Not reviewed.", evidenceRefs });
const nameNothing = "A subject names a file of the snapshot, a folder of the snapshot written as <folder>/**, the snapshot ID, " +
  "a question or gap, an entry candidate, or a baseline item ID or a field of it, such as billing.purpose.";

function checker(issues: { questions: SubjectRecord[]; gaps: SubjectRecord[] } =
{ questions: [asked(["billing"])], gaps: [found(["billing"])] }, baselineItems = items): SubjectChecker {
  return new SubjectChecker({ paths: ["cli.ts", "src/billing/invoice.ts", "src/http/routes.ts", "test/app.test.ts"],
    snapshotRef: "snapshot-001", issues, candidateIds: ["cli-candidate"], items: baselineItems });
}
const checkAsked = (subject: string) => (): void => checker({ questions: [asked([subject])], gaps: [] }).check();

describe("SubjectChecker", () => {
  test.each([
    ["a file of the snapshot", "src/billing/invoice.ts"],
    ["the snapshot ID", "snapshot-001"],
    ["a question ID", "q-1"],
    ["a gap ID", "gap-1"],
    ["an entry candidate ID", "cli-candidate"],
    ["a baseline item ID", "billing"],
    ["a field of a baseline item", "billing.purpose"],
    ["a field below a field of a baseline item", "orders-api.documentation.entries.list-orders.signature"],
  ])("refuses no subject that names %s", (_name, subject) => {
    expect(checker().refused(asked([subject]))).toEqual([]);
    expect(checker().refused(found([subject]))).toEqual([]);
  });

  test.each([
    ["names nothing", "old-billing"],
    ["is the start of a file name", "src/billing/invoice"],
    ["names a symbol of a file", "src/billing/invoice.ts#computePrice"],
    ["names a file with a leading /", "/src/billing/invoice.ts"],
    ["is a field of no baseline item", "payments.purpose"],
  ])("refuses a subject that %s", (_name, subject) => {
    expect(checker().refused(asked(["billing", subject]))).toEqual([subject]);
  });

  test("returns each subject that names nothing, in the order of the record", () => {
    expect(checker().refused(found(["old-billing", "cli.ts", "payments.purpose", "billing.purpose"])))
      .toEqual(["old-billing", "payments.purpose"]);
  });

  // DB1, detail a: a folder is written as the membership selector <folder>/**, which
  // matches at least one snapshot file.
  test.each([
    ["a folder that holds a snapshot file", "src/**"],
    ["a folder in a folder", "src/billing/**"],
  ])("refuses no folder selector of %s", (_name, subject) => {
    expect(checker().refused(asked([subject]))).toEqual([]);
  });

  test.each([
    ["a folder that holds no snapshot file", "docs/**"],
    ["the start of a folder name", "sr/**"],
    ["a file", "cli.ts/**"],
    ["a folder with an empty part", "src//**"],
    ["a folder with a leading ./", "./src/**"],
    ["the root folder", "**"],
    ["the root folder with a leading /", "/**"],
  ])("refuses a folder selector of %s, as a subject that names nothing", (_name, subject) => {
    expect(checker().refused(asked([subject]))).toEqual([subject]);
    expect(checkAsked(subject)).toThrow(new Error(`The subject ${subject} of the question q-1 names nothing. ${nameNothing}`));
  });

  test.each([
    ["src", "src/**"],
    ["src/", "src/**"],
    ["src/billing", "src/billing/**"],
    ["src/billing/", "src/billing/**"],
  ])("refuses the folder %s without /**, and check shows the folder selector %s", (subject, selector) => {
    expect(checker().refused(asked([subject]))).toEqual([subject]);
    expect(checkAsked(subject)).toThrow(new Error(
      `The subject ${subject} of the question q-1 names a folder without /**. Write the folder as ${selector}.`));
  });

  test.each([["a file", "cli.ts/"], ["a folder", "src//"]])("refuses %s with a final / too many, as a subject that names nothing",
    (_name, subject) => {
      expect(checkAsked(subject)).toThrow(new Error(`The subject ${subject} of the question q-1 names nothing. ${nameNothing}`));
    });

  test("refuses no folder name without /** that is also the ID of a baseline item, because it names the item", () => {
    const testItem: ItemNames = { namedItem: (reference) => (reference === "test" ? "test" : undefined) };
    expect(checker(undefined, testItem).refused(asked(["test"]))).toEqual([]);
  });

  // Plan change 20: a gap that Stage 1 copied from a tool record keeps its subjects. A
  // tool record names missing inputs and paths outside the snapshot on purpose.
  const toolSubjects = ["tsconfig.missing.json", "/shared/global.d.ts"];
  test.each([
    ["the settings record", "s1-settings-gap-002", "settings-001#/gaps/1"],
    ["the Git identity record", "s1-git-identity-gap-001", "git-identity-001#/gaps/0"],
  ])("refuses no subject of a gap that Stage 1 copied from %s", (_name, id, evidenceRef) => {
    const toolGap = found(toolSubjects, id, [evidenceRef]);
    expect(checker().refused(toolGap)).toEqual([]);
    expect(() => checker({ questions: [], gaps: [toolGap] }).check()).not.toThrow();
  });

  test("refuses the subjects of a gap with the ID of a tool gap whose evidence is not its place in the tool record", () => {
    expect(checker().refused(found(toolSubjects, "s1-settings-gap-002", ["settings-001#/gaps/0"]))).toEqual(toolSubjects);
  });

  test("refuses the subjects of a question with the ID and the evidence of a tool gap, because Stage 1 copies only gaps", () => {
    const question = { id: "s1-settings-gap-002", subjectRefs: toolSubjects, text: "Where is the base settings file?",
      evidenceRefs: ["settings-001#/gaps/1"] };
    expect(checker().refused(question)).toEqual(toolSubjects);
  });

  test("check accepts questions and gaps whose subjects all name something", () => {
    const issues = { questions: [asked(["gap-1", "cli.ts"])], gaps: [found(["q-1", "billing.purpose"])] };
    expect(() => checker(issues).check()).not.toThrow();
  });

  test("check refuses the first question or gap with a subject that names nothing, with the subject and the record", () => {
    expect(() => checker({ questions: [asked(["billing"])], gaps: [found(["cli.ts", "plugin-runner", "old-billing"])] }).check())
      .toThrow(new Error(`The subject plugin-runner of the gap gap-1 names nothing. ${nameNothing}`));
    expect(() => checker({ questions: [asked(["old-billing"])], gaps: [found(["plugin-runner"])] }).check())
      .toThrow(new Error(`The subject old-billing of the question q-1 names nothing. ${nameNothing}`));
  });
});
