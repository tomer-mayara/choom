import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { withScratch } from "../../support/commands.ts";
import { capturedStageOneRun, type ReviewPacket, reviewPacket, stageOne, writeReview } from "../../support/stage-1-run.ts";
import { subjectForms } from "../../support/subject-forms.ts";

// Finish checks the complete review packet before it copies anything, and excerpt
// checks the requested range. Each refused command leaves the run unchanged.
interface ReviewCase { name: string; change: (packet: ReviewPacket) => void; message: string; inside?: boolean }

const listItem = (packet: ReviewPacket, key: string): Record<string, unknown> => {
  const [item] = packet.review[key] as Record<string, unknown>[];
  if (item === undefined) throw new Error("The packet has no " + key);
  return item;
};

const reviewCases: ReviewCase[] = [
  { name: "one test use is classified as an exclusively test unit", change: packet => {
    listItem(packet, "roles").useReview = { unitScope: "test", basis: "partial-review",
      uses: [{ role: "test", evidenceRefs: ["s1-source-001"] }], evidenceRefs: ["s1-source-001"],
      limits: ["Production was not checked."] };
  }, message: "An exclusive non-production unit needs a declaration or complete review." },
  { name: "a use cites a missing source", change: packet => {
    listItem(packet, "roles").useReview = { unitScope: "unknown", basis: "partial-review",
      uses: [{ role: "test", evidenceRefs: ["missing-use-site"] }], evidenceRefs: ["inventory-001"],
      limits: ["Production was not checked."] };
  }, message: "Unknown evidence reference: missing-use-site" },
  { name: "the review has an extra field", change: (packet) => { packet.review.extra = 1; },
    message: "Expected a complete Stage 1 review." },
  { name: "the call record has no model", change: (packet) => { delete packet.call.model; },
    message: "Record LLM provider, model, date and settings; use unknown for unavailable metadata." },
  { name: "the response does not contain the review", change: (packet) => { packet.response = "No review.\n"; },
    message: "Save the complete final review YAML in the LLM response." },
  { name: "the call record does not say that hidden reasoning was not saved",
    change: (packet) => { delete packet.call.hiddenReasoning; }, message: "Record hiddenReasoning: not-saved in llm-call.yaml." },
  { name: "the response holds a reasoning block",
    change: (packet) => { packet.response = "<thinking>\nCheck the workspaces first.\n</thinking>\n\n" + stringify(packet.review); },
    message: "llm-response.md contains a hidden reasoning block. Save only the visible response." },
  { name: "a packet file is empty", change: (packet) => { packet.prompt = ""; }, message: "Empty review packet file." },
  { name: "a reviewed source has no exact excerpt", change: (packet) => { listItem(packet, "reviewedFiles").lines = [1, 4]; },
    message: "No exact supplied excerpt supports source record: s1-source-001" },
  { name: "a role cites unknown evidence", change: (packet) => { listItem(packet, "roles").evidenceRefs = ["missing"]; },
    message: "Unknown evidence reference: missing" },
  { name: "a JSON Pointer does not resolve",
    change: (packet) => { listItem(packet, "roles").evidenceRefs = ["inventory-001#/missing"]; },
    message: "Unresolved JSON Pointer: inventory-001#/missing" },
  { name: "a JSON Pointer is not a path",
    change: (packet) => { listItem(packet, "roles").evidenceRefs = ["inventory-001#files"]; },
    message: "Invalid JSON Pointer: inventory-001#files" },
  { name: "a JSON Pointer has an escape other than ~0 and ~1",
    change: (packet) => { listItem(packet, "roles").evidenceRefs = ["inventory-001#/files~2"]; },
    message: "Invalid JSON Pointer: inventory-001#/files~2" },
  // Later stages refuse these references, and they keep each question and gap unchanged.
  { name: "a JSON Pointer names the length of a list",
    change: (packet) => { listItem(packet, "questions").evidenceRefs = ["inventory-001#/files/length"]; },
    message: "Unresolved JSON Pointer: inventory-001#/files/length" },
  { name: "a JSON Pointer points into a file that is not JSON or YAML",
    change: (packet) => { listItem(packet, "gaps").evidenceRefs = ["scope-notes-001#/0"]; },
    message: "Only a .json, .yaml or .yml file can take a JSON Pointer: scope-notes-001#/0" },
  { name: "a role has an unknown basis", change: (packet) => { listItem(packet, "roles").basis = "guessed"; },
    message: "Invalid role." },
  { name: "a question uses an artifact ID", change: (packet) => { listItem(packet, "questions").id = "inventory-001"; },
    message: "Invalid question or gap." },
  // Later stages keep each question and gap unchanged, and Stage 6 saves them only when
  // the viewer can open them. So Stage 1 checks the question and gap contract of the viewer.
  { name: "a gap has 101 subject references",
    change: (packet) => { listItem(packet, "gaps").subjectRefs = Array.from({ length: 101 }, (_, index) => `file-${index}.ts`); },
    message: "The questions and gaps do not match the discovery contract of the viewer. The discovery result exceeds a limit " +
      "at gaps.0.subjectRefs: The limit is 100 subject references for each question or gap." },
  { name: "a question has another field", change: (packet) => { listItem(packet, "questions").answer = "Yes."; },
    message: "The questions and gaps do not match the discovery contract of the viewer. " +
      'The discovery result is invalid at questions.0: Unrecognized key: "answer"' },
  // GB-01b: each subject names something that the run holds, as Stages 4 to 6 check later.
  { name: "a gap names a file that is not in the snapshot",
    change: (packet) => { listItem(packet, "gaps").subjectRefs = ["tsconfig.missing.json", "src/no-such-file.ts"]; },
    message: `The subject src/no-such-file.ts of the gap s1-gap-001 names nothing. ${subjectForms}` },
  { name: "a question names a folder without /**", change: (packet) => { listItem(packet, "questions").subjectRefs = ["packages/lib"]; },
    message: "The subject packages/lib of the question s1-question-001 names a folder without /**. Write the folder as packages/lib/**." },
  // Stage 2 adds the first entry candidates, and Stage 4 the first baseline items.
  { name: "a question names a baseline item, which Stage 1 does not have",
    change: (packet) => { listItem(packet, "questions").subjectRefs = ["billing.purpose"]; },
    message: `The subject billing.purpose of the question s1-question-001 names nothing. ${subjectForms}` },
  // Stages 4 to 6 reserve the baseline ID for the fixed baseline, and later stages keep each question and gap.
  { name: "a question uses the baseline ID", change: (packet) => { listItem(packet, "questions").id = "baseline-check"; },
    message: "The ID baseline-check is reserved for the baseline. Use a different ID." },
  { name: "a gap uses the baseline ID", change: (packet) => { listItem(packet, "gaps").id = "baseline-check"; },
    message: "The ID baseline-check is reserved for the baseline. Use a different ID." },
  { name: "the scope omits required evidence",
    change: (packet) => { packet.scope.suppliedArtifactRefs = (packet.scope.suppliedArtifactRefs as string[])
      .filter((ref) => ref !== "settings-001"); },
    message: "Missing required supplied evidence: settings-001" },
  { name: "a role cites evidence that the scope does not list",
    change: (packet) => { listItem(packet, "roles").evidenceRefs = ["tools-001"]; },
    message: "Cited artifact was not declared supplied: tools-001" },
  { name: "the review folder is inside the run", change: () => undefined, inside: true,
    message: "Keep review inputs outside the saved run." },
];

const excerptCases = [
  { args: ["package.json", "1", "99", "Read more."], message: "Source range is outside the saved file." },
  { args: ["missing.ts", "1", "1", "Read it."], message: "Source is not in the saved inventory: missing.ts" },
  { args: ["package.json", "1", "2"], message: "Use excerpt PATH FIRST LAST REASON." },
  { args: ["../package.json", "1", "2", "Read it."], message: "Use a snapshot-relative source path." },
];

describe("Stage 1 review and excerpt checks", () => {
  test("refuses invalid excerpts and incomplete review packets, then saves a complete packet", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch);
      for (const { args, message } of excerptCases) {
        const result = stageOne(run, "excerpt", ...args);
        expect({ args, status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({ args, status: 1,
          stdout: "", stderr: message + "\n" });
      }
      expect(readdirSync(join(run.work, "evidence/excerpts"))).toEqual(["excerpt-001.json"]);
      const files = readdirSync(join(run.work, "evidence")).sort();
      reviewCases.forEach(({ name, change, message, inside }, index) => {
        const packet = reviewPacket(excerpt);
        change(packet);
        const folder = inside ? join(run.work, "review-inside") : join(scratch, `review-${index}`);
        const finish = stageOne(run, "finish", writeReview(run, packet, folder));
        expect({ name, status: finish.status, stderr: finish.stderr }).toEqual({ name, status: 1, stderr: message + "\n" });
      });
      expect(readdirSync(join(run.work, "evidence")).sort()).toEqual(files);
      expect(existsSync(join(run.work, "run.yaml"))).toBe(false);
      // Any saved file can be cited whole, with no JSON Pointer or with an empty one.
      const complete = reviewPacket(excerpt);
      listItem(complete, "roles").evidenceRefs = ["inventory-001", "scope-notes-001#"];
      expect(stageOne(run, "finish", writeReview(run, complete))).toMatchObject({ status: 0, stderr: "" });
    });
  }, 60_000);

  // GB-01b: before Stage 2 adds entry candidates and Stage 4 baseline items, a subject
  // names a file or folder of the snapshot, the snapshot ID, or a question or gap. A
  // gap that finish adds from a tool record counts, such as the gap of the missing Git
  // evidence: the scratch target is not a Git repository.
  test("saves a review whose subjects name a file, a folder, the snapshot ID, a gap and a gap that finish adds", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch);
      const packet = reviewPacket(excerpt);
      listItem(packet, "questions").subjectRefs = ["app.ts", "packages/lib/**", "snapshot-check", "s1-gap-001",
        "s1-git-identity-gap-001"];
      expect(stageOne(run, "finish", writeReview(run, packet))).toMatchObject({ status: 0, stderr: "" });
    });
  }, 60_000);
});
