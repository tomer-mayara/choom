import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withScratch } from "../../support/commands.ts";
import { candidate, entryPlan, planPacket, priorQuestion, savedJson, stageOneRun, stageTwo, stageTwoAttempt,
  writePacket, type JsonRecord } from "../../support/stage-2-attempt.ts";

// The plan action checks the LLM plan packet before it copies it into the
// attempt. A refused packet leaves no packet file in the attempt.
interface PlanCase { name: string; plan?: (id: string) => JsonRecord; files?: Record<string, string>; inside?: boolean; message: string }

// The forms of a subject, which a refusal of a subject that names nothing gives.
const subjectForms = "A subject names a file of the snapshot, a folder of the snapshot written as <folder>/**, the snapshot ID, " +
  "a question or gap, an entry candidate, or a baseline item ID or a field of it, such as billing.purpose.";
const newQuestion = (id: string, subjectRefs: string[]): JsonRecord => ({ id: `${id}-question-001`, subjectRefs,
  text: "Which command starts the application?", evidenceRefs: ["inventory-001"] });

const cases: PlanCase[] = [
  { name: "the plan has an extra field", plan: (id) => ({ ...entryPlan(id), extra: true }), message: "Invalid plan fields." },
  { name: "the plan has no root workspace",
    plan: (id) => entryPlan(id, { workspaces: [{ dir: "lib", entry: [], project: ["*.ts"] }] }),
    message: "The entry plan must include the root workspace." },
  { name: "a candidate ID does not start with the attempt ID",
    plan: (id) => entryPlan(id, { candidates: [{ ...candidate(id), id: "other-candidate-001" }] }),
    message: "Invalid or duplicate record ID: other-candidate-001" },
  { name: "a candidate cites unknown evidence",
    plan: (id) => entryPlan(id, { candidates: [{ ...candidate(id), evidenceRefs: ["missing"] }] }),
    message: "Unknown saved evidence: missing" },
  { name: "a candidate cites a JSON Pointer that is not a path",
    plan: (id) => entryPlan(id, { candidates: [{ ...candidate(id), evidenceRefs: ["inventory-001#files"] }] }),
    message: "Invalid JSON Pointer: inventory-001#files" },
  { name: "a candidate cites a missing key",
    plan: (id) => entryPlan(id, { candidates: [{ ...candidate(id), evidenceRefs: ["inventory-001#/missing"] }] }),
    message: "Unresolved JSON Pointer: inventory-001#/missing" },
  { name: "a candidate cites a list item with a leading zero",
    plan: (id) => entryPlan(id, { candidates: [{ ...candidate(id), evidenceRefs: ["inventory-001#/files/00"] }] }),
    message: "Unresolved JSON Pointer: inventory-001#/files/00" },
  { name: "a candidate cites a JSON Pointer into a file that is not JSON or YAML",
    plan: (id) => entryPlan(id, { candidates: [{ ...candidate(id), evidenceRefs: ["exclusions-001#/0"] }] }),
    message: "Only a .json, .yaml or .yml file can take a JSON Pointer: exclusions-001#/0" },
  { name: "a new gap has 101 subject references",
    plan: (id) => entryPlan(id, { gaps: [{ id: `${id}-gap-001`, kind: "deferral", reason: "Not reviewed in this attempt.",
      subjectRefs: Array.from({ length: 101 }, (_, index) => `file-${index}.ts`), evidenceRefs: ["inventory-001"] }] }),
    message: "The questions and gaps do not match the discovery contract of the viewer. The discovery result exceeds a limit " +
      "at gaps.0.subjectRefs: The limit is 100 subject references for each question or gap." },
  { name: "an earlier question changed",
    plan: (id) => entryPlan(id, { questions: [{ ...priorQuestion, text: "Changed." }] }),
    message: "Changed prior record: s1-question-001" },
  { name: "the response differs from the plan", files: { "llm/plan-response.json": "{}\n" },
    message: "Plan response differs from entry plan." },
  { name: "the call record has no date",
    files: { "llm/plan-call.yaml": "provider: unknown\nmodel: unknown\nsettings: unknown\nhiddenReasoning: not-saved\n" },
    message: "Record LLM call metadata; use unknown for unexposed values." },
  { name: "the call record does not say that hidden reasoning was not saved",
    files: { "llm/plan-call.yaml": "provider: unknown\nmodel: unknown\ndate: unknown\nsettings: unknown\n" },
    message: "Record hiddenReasoning: not-saved in llm/plan-call.yaml." },
  { name: "the scope names an unknown artifact",
    files: { "llm/plan-scope.json": JSON.stringify({ formatVersion: 1, snapshotRef: "snapshot-check", attemptId: "ATTEMPT",
      suppliedArtifactRefs: ["missing"], limits: [] }) }, message: "Unknown supplied artifact: missing" },
  { name: "the packet folder is inside the run", inside: true, message: "Keep LLM review packets outside the run." },
  // The IDs that start with <attempt>-knip-gap- belong to the required gaps of the Knip run.
  { name: "a new gap uses an ID that is reserved for the required gaps of the Knip run",
    plan: (id) => entryPlan(id, { gaps: [{ id: `${id}-knip-gap-001`, kind: "deferral", subjectRefs: ["app.ts"],
      reason: "Not reviewed in this attempt.", evidenceRefs: ["inventory-001"] }] }),
    message: "Invalid or duplicate record ID: ATTEMPT-knip-gap-001" },
  // GB-01b: each subject of a new record names something that the run holds when the plan is saved.
  { name: "a new gap names a file that is not in the snapshot",
    plan: (id) => entryPlan(id, { gaps: [{ id: `${id}-gap-001`, kind: "deferral", subjectRefs: ["app.ts", "src/no-such-file.ts"],
      reason: "Not reviewed in this attempt.", evidenceRefs: ["inventory-001"] }] }),
    message: `The subject src/no-such-file.ts of the gap ATTEMPT-gap-001 names nothing. ${subjectForms}` },
  { name: "a new question names an entry candidate that the plan does not have",
    plan: (id) => entryPlan(id, { questions: [priorQuestion, newQuestion(id, [`${id}-candidate-002`])] }),
    message: `The subject ATTEMPT-candidate-002 of the question ATTEMPT-question-001 names nothing. ${subjectForms}` },
];

describe("Stage 2 plan checks", () => {
  test("refuses each invalid plan packet in a new attempt", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      cases.forEach(({ name, plan, files, inside, message }, index) => {
        const id = `s2-plan-${index}`;
        const attempt = stageTwoAttempt(work, id);
        expect(stageTwo(attempt, "start").status).toBe(0);
        const folder = inside ? join(work, `plan-${index}`) : join(scratch, `plan-${index}`);
        planPacket(folder, id, plan ? plan(id) : entryPlan(id));
        if (files) writePacket(folder, Object.fromEntries(Object.entries(files).map(([file, text]) =>
          [file, text.replace("ATTEMPT", id)])));
        const result = stageTwo(attempt, "plan", [folder]);
        const error = message.replaceAll("ATTEMPT", id);
        expect({ name, status: result.status, error: savedJson(attempt, "operator-plan.json").error })
          .toEqual({ name, status: 1, error });
        expect(result.stderr).toContain("Error: " + error);
        expect(existsSync(join(attempt.folder, "entry-plan.json"))).toBe(false);
      });
    });
  }, 60_000);

  // GB-01b: before Stage 4 adds baseline items, a subject of a new plan record names a
  // file of the snapshot, the snapshot ID, a question or gap, or a candidate of the plan.
  test("saves a plan whose new question names a candidate of the plan, an earlier question, a file and the snapshot ID", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const id = "s2-plan-subjects";
      const attempt = stageTwoAttempt(work, id);
      expect(stageTwo(attempt, "start").status).toBe(0);
      const plan = entryPlan(id, { questions: [priorQuestion,
        newQuestion(id, [`${id}-candidate-001`, priorQuestion.id, "package.json", "snapshot-check"])] });
      const result = stageTwo(attempt, "plan", [planPacket(join(scratch, "plan"), id, plan)]);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    });
  }, 60_000);
});
