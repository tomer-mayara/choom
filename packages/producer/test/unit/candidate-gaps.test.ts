import { describe, expect, test } from "bun:test";
import { CandidateGaps } from "../../src/candidate-gaps.ts";
import { ToolGaps } from "../../src/tool-gaps.ts";

// The required gaps of the Stage 4 candidate records (DB5): each gap that a behavior
// entry or resource access candidates record lists, and one gap for a record that is
// partial. Their IDs start with the attempt ID and the name of the record.
type Json = Record<string, unknown>;

const stageFourGaps = new ToolGaps("s4-check-");
const behaviorRef = "s4-check-file@behavior-entry-candidates.json";
const accessRef = "s4-check-file@resource-access-candidates.json";
const computedValue = "The value at the property path is not a string literal, so it is known only at run time.";
// The settings rule of the Vite input cannot read the value at line 6, column 64 of the settings file.
const settingsGap: Json = { kind: "unknown-settings-value", ruleId: "vite-build-rollup-options-input", ruleVersion: 1,
  entryKind: "frontend-entry", path: "web/vite.config.ts", sha256: "a".repeat(64),
  range: [{ line: 6, column: 64 }, { line: 6, column: 89 }], expression: "`${pages[0]}/index.html`", truncated: false,
  reason: computedValue };
// A reference path directive names a file that the snapshot does not hold. The subject is the file with the directive.
const missingInput = "src/app.ts names src/env.d.ts in a reference path directive, but the snapshot does not hold that file.";
const inputGap: Json = { kind: "missing-compiler-input", input: "reference-path", missing: "src/env.d.ts",
  subjectRefs: ["src/app.ts"], reason: missingInput };
// A candidates record with `saved` candidates and `omitted` candidates after the limit.
const candidatesRecord = (gaps: unknown[], saved = 1, omitted = 0): Json => ({ formatVersion: 1, attemptId: "s4-check",
  snapshotRef: "snapshot-check", status: omitted > 0 ? "partial" : "completed",
  candidates: Array.from({ length: saved }, (_, index) => ({ name: `/route-${index}` })), omittedCandidates: omitted, gaps });
const behaviorRecord = (record: Json) => ({ name: "behavior-entry", artifactRef: behaviorRef, label: "behavior entry candidates",
  record });

describe("ToolGaps.fromCandidateRecord", () => {
  test("gives a gap for each gap that the record lists, in its order, and then a gap for a partial record", () => {
    expect(stageFourGaps.fromCandidateRecord(behaviorRecord(candidatesRecord([settingsGap, inputGap], 2, 3)))).toEqual([
      { id: "s4-check-behavior-entry-gap-001", kind: "unknown-settings-value", subjectRefs: ["web/vite.config.ts"],
        reason: "The behavior entry rule vite-build-rollup-options-input (version 1) cannot read the value at line 6, " +
          `column 64 of web/vite.config.ts. ${computedValue}`, evidenceRefs: [`${behaviorRef}#/gaps/0`] },
      { id: "s4-check-behavior-entry-gap-002", kind: "missing-compiler-input", subjectRefs: ["src/app.ts"],
        reason: missingInput, evidenceRefs: [`${behaviorRef}#/gaps/1`] },
      { id: "s4-check-behavior-entry-gap-003", kind: "tool-outcome", subjectRefs: ["snapshot-check"],
        reason: "The behavior entry candidates are partial: the record keeps the first 2 candidates and leaves out 3.",
        evidenceRefs: [`${behaviorRef}#/status`] },
    ]);
  });

  test("gives no gap for a completed record that lists no gap", () => {
    expect(stageFourGaps.fromCandidateRecord(behaviorRecord(candidatesRecord([], 4)))).toEqual([]);
  });

  test("gives the gaps of the resource access candidates the name of their record", () => {
    const access = { name: "resource-access", artifactRef: accessRef, label: "resource access candidates",
      record: candidatesRecord([inputGap], 10000, 1) };
    expect(stageFourGaps.fromCandidateRecord(access).map(({ id, kind, evidenceRefs }) => ({ id, kind, evidenceRefs }))).toEqual([
      { id: "s4-check-resource-access-gap-001", kind: "missing-compiler-input", evidenceRefs: [`${accessRef}#/gaps/0`] },
      { id: "s4-check-resource-access-gap-002", kind: "tool-outcome", evidenceRefs: [`${accessRef}#/status`] },
    ]);
  });

  test.each([
    ["is not an object", null],
    ["has no list of gaps", { ...candidatesRecord([]), gaps: {} }],
    ["has no list of candidates", { ...candidatesRecord([]), candidates: 3 }],
    ["has no snapshot ID", { ...candidatesRecord([]), snapshotRef: "" }],
    ["counts omitted candidates but is completed", { ...candidatesRecord([], 1, 2), status: "completed" }],
    ["is partial but omits no candidate", { ...candidatesRecord([]), status: "partial" }],
  ])("refuses a record that %s", (_name, record) => {
    expect(() => stageFourGaps.fromCandidateRecord(behaviorRecord(record as Json)))
      .toThrow(new Error(`Invalid candidate record: ${behaviorRef}`));
  });

  test.each([
    ["a settings gap without a range", { ...settingsGap, range: null }],
    ["a settings gap without a reason", { ...settingsGap, reason: "" }],
    ["a gap without subjects", { kind: "missing-compiler-input", reason: missingInput }],
  ])("refuses %s", (_name, gap) => {
    expect(() => stageFourGaps.fromCandidateRecord(behaviorRecord(candidatesRecord([inputGap, gap]))))
      .toThrow(new Error(`Invalid gap in the tool record: ${behaviorRef}#/gaps/1`));
  });
});

// The two candidate records of a Stage 4 attempt, by attempt file name.
const savedBehaviorRecord = candidatesRecord([settingsGap], 3);
const savedAccessRecord = candidatesRecord([inputGap], 10000, 2);
const savedRecords: Record<string, Json> = { "behavior-entry-candidates.json": savedBehaviorRecord,
  "resource-access-candidates.json": savedAccessRecord };
const readSaved = (file: string): unknown => savedRecords[file];

describe("CandidateGaps of a Stage 4 attempt", () => {
  const attemptGaps = new CandidateGaps("s4-check");

  test("gives the required gaps of the behavior entry candidates and then of the resource access candidates", () => {
    expect(attemptGaps.record(readSaved)).toEqual({ formatVersion: 1, gaps: [
      ...stageFourGaps.fromCandidateRecord(behaviorRecord(savedBehaviorRecord)),
      ...stageFourGaps.fromCandidateRecord({ name: "resource-access", artifactRef: accessRef, label: "resource access candidates",
        record: savedAccessRecord })] });
    expect(attemptGaps.record(readSaved).gaps.map(({ id }) => id)).toEqual(["s4-check-behavior-entry-gap-001",
      "s4-check-resource-access-gap-001", "s4-check-resource-access-gap-002"]);
  });

  test("names the attempt files by their artifact IDs", () => {
    expect([CandidateGaps.file, ...CandidateGaps.records.map(({ file }) => file)].map((file) => attemptGaps.ref(file))).toEqual([
      "s4-check-file@required-gaps.json", behaviorRef, accessRef]);
  });

  // Stage 5 keeps the behavior entry candidates of Stage 4, so their artifact ID names the Stage 4 attempt.
  test("finds the Stage 4 attempt of a behavior entry candidates record", () => {
    expect(CandidateGaps.ofCandidates("s4-retry-2-file@behavior-entry-candidates.json").ref(CandidateGaps.file))
      .toBe("s4-retry-2-file@required-gaps.json");
  });

  test.each([
    ["another record of the attempt", accessRef],
    ["the candidates of another stage", "s5-check-file@behavior-entry-candidates.json"],
    ["no reference", undefined],
  ])("refuses %s as the behavior entry candidates", (_name, ref) => {
    expect(() => CandidateGaps.ofCandidates(ref)).toThrow(new Error(
      `The behavior entry candidates ${String(ref)} are not a record of a Stage 4 attempt.`));
  });
});

// The shared record checks of Stages 4 to 6 give the required gaps again from each
// candidate record that the selected entry analysis or resource observations name.
describe("CandidateGaps.ofRecord", () => {
  test("gives the required gaps of one saved candidate record, as record gives them for its attempt", () => {
    expect([...CandidateGaps.ofRecord(behaviorRef, savedBehaviorRecord), ...CandidateGaps.ofRecord(accessRef, savedAccessRecord)])
      .toEqual(new CandidateGaps("s4-check").record(readSaved).gaps);
  });

  test.each([
    ["another file of a Stage 4 attempt", "s4-check-file@code-mapping.json"],
    ["the candidates of another stage", "s5-check-file@behavior-entry-candidates.json"],
    ["a gap of a candidate record", `${behaviorRef}#/gaps/0`],
    ["no reference", undefined],
  ])("refuses %s", (_name, ref) => {
    expect(() => CandidateGaps.ofRecord(ref, savedBehaviorRecord))
      .toThrow(new Error(`${String(ref)} is not a candidate record of a Stage 4 attempt.`));
  });
});

// The publisher reads the registered records by artifact ID, also the attempt files of
// Stage 4 that Stage 5 keeps. The review must hold each required gap of both records.
describe("CandidateGaps.check", () => {
  const attemptGaps = new CandidateGaps("s4-check");
  const required = attemptGaps.record(readSaved).gaps;
  const registered = (files: Record<string, unknown>): Map<string, { bytes: Buffer }> => new Map(Object.entries(files)
    .map(([file, value]) => [attemptGaps.ref(file), { bytes: Buffer.from(JSON.stringify(value)) }]));
  const artifacts = registered({ ...savedRecords, "required-gaps.json": { formatVersion: 1, gaps: required } });
  const ownGap = { id: "s4-check-gap-001", kind: "deferred", subjectRefs: ["web/**"], reason: "Not reviewed.", evidenceRefs: ["e"] };
  const source = "s4-check-file@required-gaps.json";

  test("accepts a review that holds each required gap, in any order, with its own questions and gaps", () => {
    expect(() => attemptGaps.check(artifacts, { questions: [], gaps: [ownGap, ...[...required].reverse()] })).not.toThrow();
  });

  test.each([
    ["the behavior entry candidates", "s4-check-behavior-entry-gap-001"],
    ["the resource access candidates", "s4-check-resource-access-gap-002"],
  ])("refuses a review that leaves out a required gap of %s", (_name, leftOut) => {
    expect(() => attemptGaps.check(artifacts, { questions: [], gaps: required.filter(({ id }) => id !== leftOut) })).toThrow(
      new Error(`The entry analysis leaves out the required gap ${leftOut}. Copy each gap of ${source} exactly.`));
  });

  // DB5: no ID form is reserved.
  test("accepts a question and another gap with an ID of the form of a required gap of either record", () => {
    const question = { id: "s4-check-behavior-entry-gap-002", subjectRefs: ["web/vite.config.ts"], text: "Which pages exist?",
      evidenceRefs: ["e"] };
    const gaps = [...required, { ...ownGap, id: "s4-check-resource-access-gap-003" }];
    expect(() => attemptGaps.check(artifacts, { questions: [question], gaps })).not.toThrow();
  });

  test("refuses saved required gaps that differ from the gaps of the candidate records", () => {
    const changed = registered({ ...savedRecords, "required-gaps.json": { formatVersion: 1, gaps: required.slice(1) } });
    expect(() => attemptGaps.check(changed, { questions: [], gaps: required })).toThrow(new Error(
      `The required gaps in ${source} differ from the gaps that the candidate records give. Use a new attempt.`));
  });

  test.each([
    ["a record that is not registered", registered(savedRecords), { questions: [], gaps: required },
      `Missing registered artifact: ${source}`],
    ["a review without a list of gaps", artifacts, { questions: [], gaps: {} }, "Missing gaps list."],
  ])("refuses %s", (_name, files, review, message) => {
    expect(() => attemptGaps.check(files, review)).toThrow(new Error(message));
  });
});

