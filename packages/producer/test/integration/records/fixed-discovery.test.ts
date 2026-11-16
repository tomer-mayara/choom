import { describe, expect, test } from "bun:test";
import { fixedDiscovery, type RecordInputs, validateDiscoveryRecords } from "../../../src/stage-6-records.ts";
import { digest, evidenceRefs, recordInputs, type Records } from "../../support/stage-6-records.ts";

// The fixed discovery result that Stage 6 saves (formatVersion 2), and its check by
// the shared record checks against the saved baseline file. The checks run the
// shared baseline rules of @choom/baseline-model, so this is an integration suite.
type Json = Record<string, unknown>;

// The bytes of the saved baseline file of the records. The in-memory records are JSON, which is also YAML.
const baselineFile = (inputs: RecordInputs): Buffer => Buffer.from(JSON.stringify(inputs.baseline));

describe("the fixed discovery result", () => {
  test("keeps every field of the working discovery and adds format version 2, the baseline ID and the SHA-256 of the file", () => {
    const inputs = recordInputs();
    const working = inputs.discovery as Json;
    const before = structuredClone(working);
    const file = baselineFile(inputs);
    const fixed = fixedDiscovery(working, "base-1", file);
    expect(fixed).toEqual({ ...before, formatVersion: 2, baselineRef: "base-1", baselineDigest: digest(file) });
    expect(Object.keys(fixed)).toEqual([...Object.keys(before), "baselineRef", "baselineDigest"]);
    expect(working).toEqual(before);
  });
});

// With the bytes of the saved baseline file, the shared record checks check the
// fixed records that Stage 6 saved: the fixed baseline and the fixed discovery result.
const otherDigest = "0123456789abcdef".repeat(4);

function fixedInputs(change: (fixed: Json) => void = () => {}): RecordInputs & { baselineFile: Buffer } {
  const inputs = recordInputs();
  const file = baselineFile(inputs);
  const discovery = fixedDiscovery(inputs.discovery as Json, "base-1", file);
  change(discovery);
  return { ...inputs, discovery, baselineFile: file };
}

const fixedForm = "Expected a complete fixed discovery result of formatVersion 2 with baselineRef and baselineDigest.";
const refusedCases: [string, (fixed: Json) => void, (file: Buffer) => string][] = [
  ["the digest of another baseline file", (fixed) => { fixed.baselineDigest = otherDigest; },
    (file) => `The discovery result names the baseline digest ${otherDigest}, but the SHA-256 of the saved baseline file is ` +
      `${digest(file)}.`],
  ["another baseline ID", (fixed) => { fixed.baselineRef = "base-2"; },
    () => "The discovery result names the baseline base-2, but the saved baseline has the ID base-1."],
  ["the working discovery of version 1", (fixed) => {
    fixed.formatVersion = 1;
    delete fixed.baselineRef;
    delete fixed.baselineDigest;
  }, () => fixedForm],
  ["the version 1 form of an older Stage 6, with baselineRef and no digest", (fixed) => {
    fixed.formatVersion = 1;
    delete fixed.baselineDigest;
  }, () => fixedForm],
  ["a fixed discovery result without its digest", (fixed) => { delete fixed.baselineDigest; }, () => fixedForm],
  ["a fixed discovery result with another field", (fixed) => { fixed.baselineVersion = 1; }, () => fixedForm],
  ["a fixed discovery result of another run", (fixed) => { fixed.runRef = "run-2"; }, () => fixedForm],
];

describe("the shared record checks of a fixed discovery result", () => {
  test("accept the fixed discovery result with the ID and the SHA-256 of the saved baseline file", () => {
    expect(validateDiscoveryRecords(fixedInputs())).toMatchObject({ mappedFiles: 2, components: 2, gaps: 1, questions: 0 });
  });

  test.each(refusedCases)("refuse %s", (_name, change, message) => {
    const inputs = fixedInputs(change);
    expect(() => validateDiscoveryRecords(inputs)).toThrow(new Error(message(inputs.baselineFile)));
  });

  // A working draft stays version 1. Only Stage 6 knows the bytes of the fixed
  // baseline, so the checks of a working draft refuse a fixed discovery result.
  test("refuse a fixed discovery result as a working draft", () => {
    const { baselineFile: _file, ...draft } = fixedInputs();
    expect(() => validateDiscoveryRecords(draft)).toThrow(new Error("Expected complete working discovery with no fixed baseline reference."));
  });
});

// The viewer opens a fixed discovery result with the discovery contract of
// @choom/baseline-model (CR-004): the exact fields of each question and gap, its
// limits and unique IDs. Earlier stages keep each question and gap unchanged, so
// the shared checks of Stages 4 and 5 already refuse a record that breaks the
// contract, as Stages 1, 2 and 3 do. Stage 6 checks the fixed result again.
const viewerRefusal = "The viewer could not open the fixed discovery result. ";
const contractRefusal = "The questions and gaps do not match the discovery contract of the viewer. ";
const viewerCases: [string, (records: Records) => void, string][] = [
  ["another field on a question", (records) => {
    const question = { id: "question-1", subjectRefs: ["cli"], text: "Is the CLI the only start?", evidenceRefs, answer: "Yes." };
    records.discovery.questions = [structuredClone(question)];
    records.entry.questions = [question];
  }, 'The discovery result is invalid at questions.0: Unrecognized key: "answer"'],
  ["a gap with 101 subject references", (records) => {
    const subjectRefs = Array.from({ length: 101 }, (_, index) => `subject-${index}`);
    for (const gaps of [records.discovery.gaps, records.entry.gaps]) Object.assign(gaps[0] ?? {}, { subjectRefs: [...subjectRefs] });
  }, "The discovery result exceeds a limit at gaps.0.subjectRefs: The limit is 100 subject references for each question or gap."],
  ["more than 4 MiB of text values", (records) => {
    records.discovery.overview = { text: "x".repeat(4 * 1024 * 1024), evidenceRefs };
  }, "The text values of the discovery result are more than 4194304 UTF-8 bytes (4 MiB) together."],
];

describe("the fixed discovery result that the viewer opens", () => {
  test.each(viewerCases)("the shared checks of Stages 4 and 5 refuse a working discovery with %s", (_name, change, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(new Error(contractRefusal + message));
  });

  test.each(viewerCases)("Stage 6 does not make a fixed result from a working discovery with %s", (_name, change, message) => {
    const inputs = recordInputs(change);
    expect(() => fixedDiscovery(inputs.discovery as Json, "base-1", baselineFile(inputs))).toThrow(new Error(viewerRefusal + message));
  });

  // A saved fixed result with the same records, as an edit after publication could make it.
  test.each(viewerCases)("Stage 6 verify refuses a saved fixed result with %s", (_name, change, message) => {
    const inputs = recordInputs(change);
    const file = baselineFile(inputs);
    const discovery = { ...(inputs.discovery as Json), formatVersion: 2, baselineRef: "base-1", baselineDigest: digest(file) };
    expect(() => validateDiscoveryRecords({ ...inputs, discovery, baselineFile: file })).toThrow(new Error(viewerRefusal + message));
  });
});
