import { expect, test } from "bun:test";
import { type DiscoveryProblemCode, validateDiscoveryResult, validateQuestionsAndGaps } from "../../src/discovery-result.ts";
import {
  discoveryFixture, type DiscoveryInput as Input, discoveryRecord as record, discoveryRecordCopies as copies,
} from "../../../../test/support/discovery-fixtures.ts";

function check(change: (input: Input) => void = () => {}) {
  const { baseline, sha256, result } = discoveryFixture();
  const input = structuredClone(result) as unknown as Input;
  change(input);
  return { input, outcome: validateDiscoveryResult(input, { baseline, sha256 }), sha256 };
}

test("a version 2 result for the saved baseline file keeps every record in its order", () => {
  const { input, outcome } = check((value) => {
    value.questions = copies(value.questions, 3, "question");
    record(value.gaps).kind = "a-kind-that-the-viewer-does-not-know";
  });
  expect(outcome).toEqual({ status: "valid", result: input as never });
});

test("a gap kind that the viewer does not know stays with its recorded reason", () => {
  const { outcome } = check((value) => { Object.assign(record(value.gaps), { kind: "unsupported-language", reason: "The Rust files are not read." }); });
  expect(outcome.status === "valid" && outcome.result.gaps).toEqual([expect.objectContaining({
    kind: "unsupported-language", reason: "The Rust files are not read." })]);
});

test("version 1 is refused, because an ID alone can match the wrong baseline (D20)", () => {
  expect(check((value) => { value.formatVersion = 1; delete value.baselineDigest; }).outcome).toEqual({
    status: "invalid", code: "unsupported-version",
    message: "The discovery result has formatVersion: 1. Version 1 gives no baseline digest, so the viewer cannot bind it " +
      "to the open baseline file. Open the version 2 discovery result of a new run.",
  });
  expect(check((value) => { value.formatVersion = 3; }).outcome).toEqual({ status: "invalid", code: "unsupported-version",
    message: "The discovery result format version 3 is unsupported. The viewer opens version 2." });
});

test.each<[string, unknown, string]>([
  ["a duplication report", { kind: "interface-duplication-review", formatVersion: 1 },
    "The file is not a discovery result. Its kind is interface-duplication-review; a discovery result has kind: architecture-discovery."],
  ["a baseline file", { formatVersion: 1, id: "baseline-example" },
    "The file is not a discovery result. A discovery result has kind: architecture-discovery."],
  ["a list", [{ kind: "architecture-discovery" }],
    "The file is not a discovery result. A discovery result has kind: architecture-discovery."],
])("%s is not a discovery result", (_name, input, message) => {
  const { baseline, sha256 } = discoveryFixture();
  expect(validateDiscoveryResult(input, { baseline, sha256 })).toEqual({ status: "invalid", code: "invalid-document", message });
});

test("a result for another file of the same baseline ID is refused with both digests", () => {
  const { outcome, sha256 } = check((value) => { value.baselineDigest = "0".repeat(64); });
  expect(outcome).toEqual({ status: "invalid", code: "baseline-mismatch",
    message: `The discovery result is for the baseline file with SHA-256 ${"0".repeat(64)}, but the open baseline file has ` +
      `SHA-256 ${sha256}. Open the discovery result of the run that saved this baseline file.` });
});

test("a result for another baseline ID is refused with both IDs", () => {
  expect(check((value) => { value.baselineRef = "baseline-002"; }).outcome).toEqual({ status: "invalid", code: "baseline-mismatch",
    message: "The discovery result is for baseline baseline-002, but the open baseline is baseline-example. " +
      "Open the discovery result of the run that saved this baseline file." });
});

test("an ID that a question and a gap both use is refused", () => {
  expect(check((value) => { record(value.gaps).id = record(value.questions, 1).id; }).outcome).toEqual({
    status: "invalid", code: "invalid-document", message: "The discovery result is invalid at gaps.0.id: " +
      "The ID s4-001-question-001 is used more than once. Each question and gap needs its own ID." });
});

test("a long repeated ID is shortened in the message", () => {
  const id = "q".repeat(4_000);
  const { outcome } = check((value) => { record(value.questions).id = id; record(value.gaps).id = id; });
  expect(outcome).toMatchObject({ status: "invalid", code: "invalid-document" });
  expect(outcome.status === "invalid" && outcome.message).toContain(`The ID ${"q".repeat(200)}... is used more than once.`);
});

test("a wrong field names its path", () => {
  expect(check((value) => { delete record(value.questions).text; }).outcome).toEqual({ status: "invalid", code: "invalid-document",
    message: "The discovery result is invalid at questions.0.text: Invalid input: expected string, received undefined" });
});

test.each<[string, (input: Input) => void, string]>([
  ["5,001 questions and gaps together", (input) => {
    input.questions = copies(input.questions, 2_600, "question");
    input.gaps = copies(input.gaps, 2_401, "gap");
  }, "The discovery result has 5001 questions and gaps. The limit is 5000 together."],
  ["5,001 gaps", (input) => { input.gaps = copies(input.gaps, 5_001, "gap"); },
    "The discovery result exceeds a limit at gaps: The limit is 5000 questions and gaps together."],
  ["101 subject references", (input) => {
    record(input.gaps).subjectRefs = Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`);
  }, "The discovery result exceeds a limit at gaps.0.subjectRefs: The limit is 100 subject references for each question or gap."],
  ["a text of 16 KiB and one byte", (input) => { record(input.questions).text = "x".repeat(16 * 1024 + 1); },
    "The discovery result exceeds a limit at questions.0.text: The UTF-8 text limit is 16384 bytes."],
  ["an evidence reference of 4 KiB and one byte", (input) => { record(input.questions).evidenceRefs = ["é".repeat(2048) + "x"]; },
    "The discovery result exceeds a limit at questions.0.evidenceRefs.0: The UTF-8 text limit is 4096 bytes."],
  ["an ID of 4 KiB and one byte", (input) => { record(input.gaps).id = "g".repeat(4097); },
    "The discovery result exceeds a limit at gaps.0.id: The UTF-8 text limit is 4096 bytes."],
  ["more than 4 MiB of text values, also outside the fields that the viewer reads", (input) => {
    input.overview = { text: "x".repeat(4 * 1024 * 1024), evidenceRefs: [] };
  }, "The text values of the discovery result are more than 4194304 UTF-8 bytes (4 MiB) together."],
])("a result with %s is refused without dropping records", (_name, change, message) => {
  expect(check(change).outcome).toEqual({ status: "invalid", code: "limit-exceeded", message });
});

test("exactly 5,000 questions and gaps and exactly 4 MiB of text values are accepted", () => {
  const atCount = check((value) => {
    value.questions = copies(value.questions, 2_500, "question");
    value.gaps = copies(value.gaps, 2_500, "gap");
  });
  expect(atCount.outcome.status === "valid" && atCount.outcome.result.questions.length + atCount.outcome.result.gaps.length).toBe(5_000);
  const atBudget = check((value) => {
    const overview = { filler: "" };
    value.overview = overview;
    let used = 0;
    JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "string") used += new TextEncoder().encode(item).byteLength;
      return item;
    });
    overview.filler = "x".repeat(4 * 1024 * 1024 - used);
  });
  expect(atBudget.outcome.status).toBe("valid");
  const overBudget = check((value) => { value.overview = structuredClone(atBudget.input.overview); value.runRef = "run-0010"; });
  expect(overBudget.outcome).toMatchObject({ status: "invalid", code: "limit-exceeded" });
});

// The producer stages check the questions and gaps of a run with the same rules where
// each record enters the run, before Stage 6 makes the fixed result. The value is a
// working discovery of formatVersion 1, which names no baseline.
function workingCheck(change: (input: Input) => void = () => {}) {
  const { result } = discoveryFixture();
  const { baselineRef: _ref, baselineDigest: _digest, ...working } = structuredClone(result);
  const input = { ...working, formatVersion: 1 } as unknown as Input;
  change(input);
  return validateQuestionsAndGaps(input);
}

test("the questions and gaps of a working discovery that names no baseline are accepted", () => {
  expect(workingCheck()).toEqual({ status: "valid" });
  expect(validateQuestionsAndGaps({ questions: [], gaps: [] })).toEqual({ status: "valid" });
});

test.each<[string, (input: Input) => void, DiscoveryProblemCode, string]>([
  ["another field on a question", (input) => { record(input.questions).answer = "Yes."; }, "invalid-document",
    'The discovery result is invalid at questions.0: Unrecognized key: "answer"'],
  ["an ID that a question and a gap both use", (input) => { record(input.gaps).id = record(input.questions).id; }, "invalid-document",
    "The discovery result is invalid at gaps.0.id: The ID s3-001-question-001 is used more than once. Each question and gap needs its own ID."],
  ["101 subject references", (input) => {
    record(input.gaps).subjectRefs = Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`);
  }, "limit-exceeded", "The discovery result exceeds a limit at gaps.0.subjectRefs: The limit is 100 subject references for each question or gap."],
  ["a reason of 16 KiB and one byte", (input) => { record(input.gaps).reason = "x".repeat(16 * 1024 + 1); }, "limit-exceeded",
    "The discovery result exceeds a limit at gaps.0.reason: The UTF-8 text limit is 16384 bytes."],
  ["a kind of 4 KiB and one byte", (input) => { record(input.gaps).kind = "k".repeat(4097); }, "limit-exceeded",
    "The discovery result exceeds a limit at gaps.0.kind: The UTF-8 text limit is 4096 bytes."],
  ["5,001 questions and gaps together", (input) => {
    input.questions = copies(input.questions, 2_600, "question");
    input.gaps = copies(input.gaps, 2_401, "gap");
  }, "limit-exceeded", "The discovery result has 5001 questions and gaps. The limit is 5000 together."],
  ["more than 4 MiB of text values in another field", (input) => {
    input.overview = { text: "x".repeat(4 * 1024 * 1024), evidenceRefs: [] };
  }, "limit-exceeded", "The text values of the discovery result are more than 4194304 UTF-8 bytes (4 MiB) together."],
])("the questions and gaps of a working discovery with %s are refused", (_name, change, code, message) => {
  expect(workingCheck(change)).toEqual({ status: "invalid", code, message });
});
