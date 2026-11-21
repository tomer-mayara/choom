import { createHash } from "node:crypto";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { type CommandResult, runCli, toolsRoot } from "./commands.ts";
import { finishAttempt, type JsonRecord, runAttempt, stageOneRun, stageTwoAttempt, writePacket }
  from "./stage-2-attempt.ts";
import { type SnapshotFile, stagedSnapshotRef } from "./staged-run.ts";

// Helpers that run a Stage 3 attempt the way the step-3 cookbook does, on a run
// that finished Stage 2 through its commands, with an LLM packet written by the test.
export interface StageThreeAttempt { work: string; id: string; folder: string; review: string }
export interface StageThreePacket { analysis: JsonRecord; call: JsonRecord; scope: JsonRecord; prompt: string; response?: string }

const stageTwoId = "s2-check";
const app = { path: "app.ts", text: "export const value = 1;\n" };

// Saves a Stage 1 run and finishes one Stage 2 attempt on it through the command
// line. The snapshot must hold app.ts, the entry of the Stage 2 plan, and no
// package manifest, so Stage 2 skips Knip.
export function stageTwoRun(scratch: string, snapshot: SnapshotFile[] = [app]): string {
  const work = join(scratch, "stage-2-run");
  stageOneRun(work, snapshot);
  const attempt = stageTwoAttempt(work, stageTwoId);
  const results = { ...runAttempt(attempt, scratch), ...finishAttempt(attempt, scratch) };
  for (const [action, result] of Object.entries(results))
    if (result.status !== 0) throw new Error(`Stage 2 ${action} failed: ${result.stderr}`);
  return work;
}

// A copy of the Stage 2 run in its own folder, with a new Stage 3 attempt ID.
export function stageThreeAttempt(stageTwoWork: string, folder: string, id = "s3-check"): StageThreeAttempt {
  const work = join(folder, "run");
  cpSync(stageTwoWork, work, { recursive: true });
  return { work, id, folder: join(work, "evidence", id), review: join(folder, "review") };
}

export function stageThree(attempt: StageThreeAttempt, args: string[]): CommandResult {
  return runCli(args, { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: attempt.work, CHOOM_STAGE3_ID: attempt.id,
    CHOOM_STAGE3: attempt.folder });
}

// The gap that the finalizer requires when the symbol mentions of collect did not run,
// as when Stage 2 skipped Knip: it cites the record of the symbol mentions.
function symbolGaps(attempt: StageThreeAttempt): JsonRecord[] {
  const mentions = JSON.parse(readFileSync(join(attempt.folder, "symbol-mentions.json"), "utf8")) as JsonRecord;
  if (!["skipped", "unavailable"].includes(mentions.status as string)) return [];
  return [{ id: `${attempt.id}-gap-001`, kind: "tool-outcome", subjectRefs: [app.path],
    reason: "Knip did not run in Stage 2, so the symbol mention query had no reported symbols.",
    evidenceRefs: [`${attempt.id}-file@symbol-mentions.json`] }];
}

// A complete Stage 3 packet. The analysis keeps every Stage 2 record, reviews the
// collected excerpt of app.ts and adds one inspection priority, and the gap of the
// symbol mentions when they did not run.
function stageThreePacket(attempt: StageThreeAttempt): StageThreePacket {
  const previous = parse(readFileSync(join(attempt.work, "evidence", stageTwoId, "entry-analysis.yaml"), "utf8")) as JsonRecord;
  const source = `${attempt.id}-source-${app.path}`;
  const analysis = { formatVersion: 1, kind: "entry-analysis", snapshotRef: stagedSnapshotRef,
    previousEntryAnalysisRef: `${stageTwoId}-entry-analysis`, planRef: previous.planRef, knipRunsRef: previous.knipRunsRef,
    candidates: previous.candidates, reviewedFiles: [{ id: source, snapshotRef: stagedSnapshotRef, path: app.path,
      sha256: createHash("sha256").update(app.text).digest("hex"), lines: [1, 1] }],
    questions: previous.questions, gaps: [...previous.gaps as JsonRecord[], ...symbolGaps(attempt)],
    reachability: previous.reachability, llmReview: "recorded",
    knipAssessment: { action: "reuse", reason: "Knip was skipped, and its saved inputs still describe this snapshot.",
      evidenceRefs: [`${stageTwoId}-knip-runs`] },
    inspectionPriorities: [{ id: `${attempt.id}-priority-001`, subjectRefs: [app.path], priority: 1,
      action: "Read the entry module.", reason: "The package main field names it.", evidenceRefs: [source] }] };
  return { analysis, prompt: "Review the saved Stage 3 evidence.\n",
    call: { provider: "unknown", model: "unknown", date: "unknown", settings: "unknown", hiddenReasoning: "not-saved" },
    scope: { formatVersion: 1, runRef: "run-check", snapshotRef: stagedSnapshotRef,
      suppliedArtifactRefs: [`${attempt.id}-file@artifact-map.json`], limits: ["Only the saved test fixture was supplied."] } };
}

function writeStageThreePacket(attempt: StageThreeAttempt, packet: StageThreePacket): string {
  const yaml = stringify(packet.analysis);
  return writePacket(attempt.review, { "entry-analysis.yaml": yaml, "llm/analysis-prompt.md": packet.prompt,
    "llm/analysis-response.md": packet.response ?? "The complete analysis follows.\n\n" + yaml,
    "llm/analysis-call.yaml": stringify(packet.call), "llm/review-scope.json": JSON.stringify(packet.scope) + "\n" });
}

// Runs start, collect, each text search (its arguments) and each exports request
// (its path), saves the packet that `change` gives, and runs the finalizer.
export function finishStageThree(attempt: StageThreeAttempt, change: (packet: StageThreePacket) => void = () => {},
  searches: string[][] = [], exports: string[] = []): Record<string, CommandResult> {
  const results: Record<string, CommandResult> = {};
  for (const action of ["start", "collect"]) results[action] = stageThree(attempt, ["stage-3", action]);
  for (const [index, search] of searches.entries())
    results[`text-search-${index + 1}`] = stageThree(attempt, ["stage-3", "text-search", ...search]);
  for (const [index, path] of exports.entries())
    results[`exports-${index + 1}`] = stageThree(attempt, ["stage-3", "exports", path]);
  const packet = stageThreePacket(attempt);
  change(packet);
  results["save-review"] = stageThree(attempt, ["stage-3", "save-review", writeStageThreePacket(attempt, packet)]);
  results.finish = stageThree(attempt, ["stage-3-finish"]);
  return results;
}
