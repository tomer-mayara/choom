import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withScratch } from "../../support/commands.ts";
import { candidate, entryPlan, planPacket, priorQuestion, savedJson, stageOneRun, stageTwo, stageTwoAttempt,
  writePacket, type JsonRecord } from "../../support/stage-2-attempt.ts";

// The plan action checks the LLM plan packet before it copies it into the
// attempt. A refused packet leaves no packet file in the attempt.
interface PlanCase { name: string; plan?: (id: string) => JsonRecord; files?: Record<string, string>; inside?: boolean; message: string }

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
        expect({ name, status: result.status, error: savedJson(attempt, "operator-plan.json").error })
          .toEqual({ name, status: 1, error: message });
        expect(result.stderr).toContain("Error: " + message);
        expect(existsSync(join(attempt.folder, "entry-plan.json"))).toBe(false);
      });
    });
  }, 60_000);
});
