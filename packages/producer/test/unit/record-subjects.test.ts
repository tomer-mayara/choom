import { describe, expect, test } from "bun:test";
import { type ItemNames, type RegisteredRecords, SubjectChecker, type SubjectRecord } from "../../src/record-subjects.ts";

// The shared record checks of Stages 4 to 6 check that each subject of a question or
// gap names something of the run. SubjectChecker knows what a subject can name. The
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
// A mock of the records that a run registers: the saved document of each, by artifact ID.
// It refuses to read a record that it does not hold, as the readers of the stages do.
function registry(records: Record<string, unknown>): RegisteredRecords {
  return { refs: Object.keys(records), document: (ref) => {
    if (!Object.hasOwn(records, ref)) throw new Error(`Unknown artifact: ${ref}`);
    return records[ref];
  } };
}
const entryAnalysis = (...candidateIds: string[]) => ({ formatVersion: 1, kind: "entry-analysis",
  candidates: candidateIds.map((id) => ({ id, expression: "cli.ts", path: "cli.ts" })) });
// A run after two Stage 2 attempts and Stage 3. The entry analysis of the earlier attempt
// s2-first stays registered, but no later entry analysis names it, and s2-check has new
// candidate IDs. The plan of s2-first has a candidate that its entry analysis dropped.
const repeatedStageTwo = {
  "s2-first-entry-plan": { formatVersion: 1, candidates: [{ id: "s2-first-candidate-002" }] },
  "s2-first-entry-analysis": entryAnalysis("s2-first-candidate-001"),
  "s2-check-entry-analysis": entryAnalysis("s2-check-candidate-001"),
  "s3-check-entry-analysis": { ...entryAnalysis("s2-check-candidate-001", "s3-check-candidate-001"),
    previousEntryAnalysisRef: "s2-check-entry-analysis" },
};

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
    ["names a folder that holds no snapshot file", "docs"],
    ["is the start of a folder name", "sr"],
    ["names the root folder", "."],
    ["names a folder with a leading ./", "./src"],
  ])("refuses a subject that %s", (_name, subject) => {
    expect(checker().refused(asked(["billing", subject]))).toEqual([subject]);
    expect(checkAsked(subject)).toThrow(new Error(`The subject ${subject} of the question q-1 names nothing. ${nameNothing}`));
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

  // DB1: no gap has an exception. A gap that a stage gives from a tool record names only
  // files of the snapshot or the snapshot ID, and its reason names a missing input. So a
  // gap with the ID and the evidence of such a gap follows the same rule as any gap.
  test.each([
    ["the Stage 1 settings record", "s1-settings-gap-002", "settings-001#/gaps/1"],
    ["the Stage 1 Git identity record", "s1-git-identity-gap-001", "git-identity-001#/gaps/0"],
    ["a Stage 3 exports record", "s3-001-exports-001-gap-001", "s3-001-file@exports-001.json#/gaps/0"],
    ["a Stage 4 candidate record", "s4-001-behavior-entry-gap-002", "s4-001-file@behavior-entry-candidates.json#/gaps/1"],
  ])("refuses a subject that names nothing in a gap with the form of a gap of %s", (_name, id, evidenceRef) => {
    const toolGap = found(["cli.ts", "types/env.d.ts"], id, [evidenceRef]);
    expect(checker().refused(toolGap)).toEqual(["types/env.d.ts"]);
    expect(() => checker({ questions: [], gaps: [toolGap] }).check())
      .toThrow(new Error(`The subject types/env.d.ts of the gap ${id} names nothing. ${nameNothing}`));
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

  // Each record that has subjects, such as an inspection priority of Stage 3, follows the same rule.
  test("checkRecords refuses the first record with a subject that names nothing, and names the kind of the record", () => {
    const priority = (subjectRefs: string[], id: string): SubjectRecord => ({ id, subjectRefs, priority: 1, action: "Read it.",
      reason: "The entry names it.", evidenceRefs: ["e"] });
    const priorities = [priority(["cli.ts", "q-1"], "p-1"), priority(["gap-1", "nothing-here"], "p-2"), priority(["old"], "p-3")];
    expect(() => checker().checkRecords(priorities, "inspection priority"))
      .toThrow(new Error(`The subject nothing-here of the inspection priority p-2 names nothing. ${nameNothing}`));
    expect(() => checker().checkRecords([priority(["src/billing"], "p-1")], "inspection priority")).toThrow(new Error(
      "The subject src/billing of the inspection priority p-1 names a folder without /**. Write the folder as src/billing/**."));
    expect(() => checker().checkRecords(priorities.slice(0, 1), "inspection priority")).not.toThrow();
  });

  // DB2, the proposed addition: Stages 1 to 3 check only the questions and gaps that they add to the discovery.
  test("checkAdded refuses the first question or gap that the earlier questions and gaps do not hold", () => {
    const issues = { questions: [asked(["old-billing"]), asked(["plugin-runner"], "q-2")],
      gaps: [found(["cli.ts"]), found(["payments.purpose"], "gap-2")] };
    const earlier = { questions: [asked(["old-billing"])], gaps: [found(["cli.ts"])] };
    expect(() => checker(issues).checkAdded(earlier))
      .toThrow(new Error(`The subject plugin-runner of the question q-2 names nothing. ${nameNothing}`));
    expect(() => checker({ ...issues, questions: issues.questions.slice(0, 1) }).checkAdded(earlier))
      .toThrow(new Error(`The subject payments.purpose of the gap gap-2 names nothing. ${nameNothing}`));
    expect(() => checker(earlier).checkAdded(earlier)).not.toThrow();
  });
});

// Stages 1 to 3 run before Stage 4 recovers the baseline items: the baseline is still
// empty, so a subject can name no baseline item yet.
describe("SubjectChecker before the baseline has items", () => {
  const early = (): SubjectChecker => SubjectChecker.beforeBaseline({ paths: ["cli.ts", "src/billing/invoice.ts"],
    snapshotRef: "snapshot-001", issues: { questions: [asked(["cli.ts"])], gaps: [found(["q-1"])] },
    candidateIds: ["cli-candidate"] });

  test.each([
    ["a file of the snapshot", "src/billing/invoice.ts"],
    ["a folder of the snapshot", "src/billing/**"],
    ["the snapshot ID", "snapshot-001"],
    ["a question ID", "q-1"],
    ["a gap ID", "gap-1"],
    ["an entry candidate ID", "cli-candidate"],
  ])("refuses no subject that names %s", (_name, subject) => {
    expect(early().refused(asked([subject]))).toEqual([]);
  });

  test.each([["a baseline item ID", "billing"], ["a field of a baseline item", "billing.purpose"]])(
    "refuses a subject that would name %s, because the baseline has no items yet", (_name, subject) => {
      expect(early().refused(asked([subject]))).toEqual([subject]);
    });

  // The entry plan or entry analysis of Stage 2 or 3 holds the questions, the gaps and
  // its own entry candidates. A subject can also name a candidate of an entry analysis that
  // the run registers, such as a candidate that a Stage 3 note retires.
  const entryRecord = { questions: [asked(["cli.ts"])], gaps: [found(["q-1"])], candidates: [{ id: "s4-check-candidate-001" }] };
  const forEntry = (): SubjectChecker => SubjectChecker.forEntryRecord(["cli.ts"], "snapshot-001", entryRecord,
    registry(repeatedStageTwo));

  test.each([
    ["a candidate of the entry record", "s4-check-candidate-001"],
    ["a candidate of the previous entry analysis", "s3-check-candidate-001"],
    ["a candidate of an earlier Stage 2 attempt that no later entry analysis names", "s2-first-candidate-001"],
    ["a question of the entry record", "q-1"],
    ["a file of the snapshot", "cli.ts"],
  ])("forEntryRecord refuses no subject that names %s", (_name, subject) => {
    expect(forEntry().refused(asked([subject]))).toEqual([]);
  });

  test("forEntryRecord refuses a subject that names a candidate of no entry analysis, and a baseline item", () => {
    expect(forEntry().refused(asked(["s2-first-candidate-002", "billing"]))).toEqual(["s2-first-candidate-002", "billing"]);
  });
});

// DB1: a subject can name an entry candidate of each entry analysis that the run registers,
// and of the record that the stage checks. Earlier attempts stay registered, and a
// candidate ID starts with the ID of its attempt, so such a subject names a saved record.
describe("SubjectChecker.entryCandidates", () => {
  test("gives the candidates of each registered entry analysis and of the record that the stage checks", () => {
    expect(SubjectChecker.entryCandidates(registry(repeatedStageTwo), entryAnalysis("s4-check-candidate-001"))).toEqual(
      new Set(["s2-first-candidate-001", "s2-check-candidate-001", "s3-check-candidate-001", "s4-check-candidate-001"]));
  });

  test("gives the candidates of the record that the stage checks when the run registers no entry analysis", () => {
    expect(SubjectChecker.entryCandidates(registry({ "s2-check-entry-plan": entryAnalysis("s2-check-candidate-002") }),
      { candidates: [{ id: "s2-check-candidate-001" }] })).toEqual(new Set(["s2-check-candidate-001"]));
  });

  // A registered entry analysis has the artifact ID <attempt>-entry-analysis, with the ID of
  // a Stage 2 to 5 attempt, and the kind entry-analysis. Only such an ID is read.
  test.each([
    ["a Stage 2 plan, which is not an entry analysis", "s2-first-entry-plan", { candidates: [{ id: "c-1" }] }, false],
    ["a file of an attempt", "s3-check-file@notes-entry-analysis", entryAnalysis("c-1"), false],
    ["a record whose ID does not start with an attempt ID", "baseline-entry-analysis", entryAnalysis("c-1"), false],
    ["a record of the ID form with another kind", "s2-other-entry-analysis", { kind: "entry-plan", candidates: [{ id: "c-1" }] }, true],
  ])("counts no candidate of %s", (_name, ref, record, read) => {
    const run = registry({ "s2-check-entry-analysis": entryAnalysis("s2-check-candidate-001"), [ref]: record });
    const reads: string[] = [];
    const counted = SubjectChecker.entryCandidates({ refs: run.refs, document: (artifactId) => {
      reads.push(artifactId);
      return run.document(artifactId);
    } }, { candidates: [] });
    expect(counted).toEqual(new Set(["s2-check-candidate-001"]));
    expect(reads.includes(ref)).toBe(read);
  });

  test("counts no candidate of a registered entry analysis without a candidate list", () => {
    expect(SubjectChecker.entryCandidates(registry({ "s2-check-entry-analysis": { kind: "entry-analysis" } }), { candidates: [] }))
      .toEqual(new Set());
  });
});
