import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { type CommandResult, runCli, toolsRoot } from "./commands.ts";
import { type SnapshotFile, stagedRun, stagedSnapshotRef } from "./staged-run.ts";

// Helpers that run a Stage 2 attempt the way the step-2 cookbook does, on a
// small saved Stage 1 run, with LLM packets written by the test.
export interface StageTwoAttempt {
  work: string;
  id: string;
  folder: string;
  tools: string;
  env: Record<string, string>;
}

export type JsonRecord = Record<string, unknown>;

export const priorQuestion = { id: "s1-question-001", subjectRefs: ["app.ts"],
  text: "Which command starts the application?", evidenceRefs: ["inventory-001"] };

export const stageTwoSnapshot: SnapshotFile[] = [
  { path: "app.ts", text: "export const value = 1;\n" },
  { path: "package.json", text: JSON.stringify({ name: "fixture", private: true, main: "app.ts" }, null, 2) + "\n" },
];

const llmCall = { provider: "unknown", model: "unknown", date: "unknown", settings: "unknown", hiddenReasoning: "not-saved" };

// Saves a Stage 1 run with the given snapshot and one earlier discovery question.
// The run records the producer code of the given tool checkout.
export function stageOneRun(work: string, snapshot: SnapshotFile[] = stageTwoSnapshot, tools = toolsRoot): void {
  stagedRun(work, 1, { snapshot, questions: [priorQuestion], tools });
}

export function stageTwoAttempt(work: string, id: string, env: Record<string, string> = {}, tools = toolsRoot): StageTwoAttempt {
  return { work, id, folder: join(work, "evidence", id), tools, env };
}

// Every action runs through the command line of the tool checkout.
export function stageTwo(attempt: StageTwoAttempt, action: string, args: string[] = [],
  env: Record<string, string> = {}): CommandResult {
  const settings = { CHOOM_TOOLS: attempt.tools, CHOOM_WORK: attempt.work, CHOOM_STAGE2_ID: attempt.id,
    CHOOM_STAGE2: attempt.folder, DOCKER_HOST: "", DOCKER_CONTEXT: "", ...attempt.env, ...env };
  return runCli(["stage-2", action, ...args], settings, attempt.tools);
}

export function writePacket(folder: string, files: Record<string, string>): string {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, name)), { recursive: true });
    writeFileSync(join(folder, name), text);
  }
  return folder;
}

function scope(id: string): JsonRecord {
  return { formatVersion: 1, snapshotRef: stagedSnapshotRef, attemptId: id, suppliedArtifactRefs: ["inventory-001"],
    limits: ["Only the saved test fixture was supplied."] };
}

export function candidate(id: string): JsonRecord {
  return { id: `${id}-candidate-001`, expression: "app.ts", path: "app.ts", workspace: ".", roles: ["application"],
    origin: "package-field", evidenceRefs: ["inventory-001"] };
}

export function entryPlan(id: string, change: JsonRecord = {}): JsonRecord {
  return { formatVersion: 1, snapshotRef: stagedSnapshotRef, runProduction: true,
    productionReason: "The package main field names app.ts (inventory-001).", candidates: [candidate(id)],
    workspaces: [{ dir: ".", entry: ["app.ts!"], project: ["**/*.ts!"] }], questions: [priorQuestion], gaps: [],
    ...change };
}

export function entryAnalysis(id: string, change: JsonRecord = {}): JsonRecord {
  return { formatVersion: 1, kind: "entry-analysis", snapshotRef: stagedSnapshotRef, planRef: `${id}-entry-plan`,
    knipRunsRef: `${id}-knip-runs`, candidates: [candidate(id)], reviewedFiles: [], questions: [priorQuestion],
    gaps: [{ id: `${id}-gap-001`, kind: "tool-outcome", subjectRefs: ["app.ts"], reason: "Knip did not run.",
      evidenceRefs: [`${id}-knip-runs`] }],
    reachability: { status: "not-assessed", reason: "This stage records entry candidates and Knip outcomes only." },
    llmReview: "recorded", ...change };
}

export function planPacket(folder: string, id: string, plan: JsonRecord): string {
  return writePacket(folder, { "entry-plan.json": JSON.stringify(plan, null, 2) + "\n",
    "llm/plan-prompt.md": "Prepare the Stage 2 entry plan.\n", "llm/plan-response.json": JSON.stringify(plan) + "\n",
    "llm/plan-call.yaml": stringify(llmCall), "llm/plan-scope.json": JSON.stringify(scope(id)) + "\n" });
}

export function analysisPacket(folder: string, id: string, analysis: JsonRecord): string {
  const yaml = stringify(analysis);
  return writePacket(folder, { "entry-analysis.yaml": yaml,
    "llm/analysis-prompt.md": "Complete the Stage 2 entry analysis.\n",
    "llm/analysis-response.md": "The complete analysis follows.\n\n" + yaml, "llm/analysis-call.yaml": stringify(llmCall),
    "llm/review-scope.json": JSON.stringify(scope(id)) + "\n" });
}

export function savedJson(attempt: StageTwoAttempt, name: string): JsonRecord {
  return JSON.parse(readFileSync(join(attempt.folder, name), "utf8")) as JsonRecord;
}

// Runs start, plan, prepare, toolchain and run, and returns each result by action.
export function runAttempt(attempt: StageTwoAttempt, scratch: string, plan = entryPlan(attempt.id),
  env: Record<string, string> = {}): Record<string, CommandResult> {
  const results: Record<string, CommandResult> = { start: stageTwo(attempt, "start") };
  results.plan = stageTwo(attempt, "plan", [planPacket(join(scratch, `${attempt.id}-plan`), attempt.id, plan)]);
  for (const action of ["prepare", "toolchain", "run"]) results[action] = stageTwo(attempt, action, [], env);
  return results;
}

// Saves the analysis packet and publishes the attempt.
export function finishAttempt(attempt: StageTwoAttempt, scratch: string,
  analysis = entryAnalysis(attempt.id)): Record<string, CommandResult> {
  const review = analysisPacket(join(scratch, `${attempt.id}-review`), attempt.id, analysis);
  return { "save-review": stageTwo(attempt, "save-review", [review]), finish: stageTwo(attempt, "finish") };
}
