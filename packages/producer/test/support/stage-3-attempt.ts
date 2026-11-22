import { createHash } from "node:crypto";
import { cpSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { type CommandResult, runCli, toolsRoot } from "./commands.ts";
import { entryPlan, finishAttempt, type JsonRecord, repeatAttempt, runAttempt, stageOneRun, stageTwoAttempt, writePacket }
  from "./stage-2-attempt.ts";
import { type SnapshotFile, stagedSnapshotRef } from "./staged-run.ts";

// Helpers that run a Stage 3 attempt the way the step-3 cookbook does, on a run
// that finished Stage 2 through its commands, with an LLM packet written by the test.
export interface StageThreeAttempt { work: string; id: string; folder: string; review: string }
export interface StageThreePacket { analysis: JsonRecord; call: JsonRecord; scope: JsonRecord; prompt: string; response?: string }
// The Knip settings of the Stage 2 attempt: the settings of each Stage 2 action, such as
// the Docker double of tool-doubles.ts, and the fields of the entry plan to change.
export interface StageTwoKnip { env?: Record<string, string>; plan?: JsonRecord }

const stageTwoId = "s2-check";
const app = { path: "app.ts", text: "export const value = 1;\n" };

// Saves a Stage 1 run and finishes one Stage 2 attempt on it through the command
// line. The snapshot must hold app.ts, the entry of the Stage 2 plan. Without a
// package manifest in the snapshot, Stage 2 skips Knip. With a manifest, Knip runs
// as the `knip` settings say, such as with the Docker double.
export function stageTwoRun(scratch: string, snapshot: SnapshotFile[] = [app], knip: StageTwoKnip = {}): string {
  const work = join(scratch, "stage-2-run");
  stageOneRun(work, snapshot);
  const attempt = stageTwoAttempt(work, stageTwoId, knip.env);
  completed("Stage 2", { ...runAttempt(attempt, scratch, entryPlan(stageTwoId, knip.plan)), ...finishAttempt(attempt, scratch) });
  return work;
}

// A run after a fresh Stage 2 attempt (start-here.md): first the attempt `earlierId`, and
// then s2-check, which keeps each earlier question and gap and has its own candidate. So
// run.yaml registers both entry analyses, and no selected entry analysis names the
// candidate of the earlier attempt.
export function repeatedStageTwoRun(scratch: string, earlierId: string): string {
  const work = join(scratch, "stage-2-run");
  stageOneRun(work, [app]);
  const earlier = stageTwoAttempt(work, earlierId);
  completed(`Stage 2 ${earlierId}`, { ...runAttempt(earlier, scratch, entryPlan(earlierId)), ...finishAttempt(earlier, scratch) });
  completed("Stage 2", repeatAttempt(stageTwoAttempt(work, stageTwoId), scratch));
  return work;
}

function completed(label: string, results: Record<string, CommandResult>): void {
  for (const [action, result] of Object.entries(results))
    if (result.status !== 0) throw new Error(`${label} ${action} failed: ${result.stderr}`);
}

// A copy of the Stage 2 run in its own folder, with a new Stage 3 attempt ID.
export function stageThreeAttempt(stageTwoWork: string, folder: string, id = "s3-check"): StageThreeAttempt {
  const work = join(folder, "run");
  cpSync(stageTwoWork, work, { recursive: true });
  return { work, id, folder: join(work, "evidence", id), review: join(folder, "review") };
}

// Runs a Stage 3 command of the attempt. `settings` adds settings, such as a fault double.
export function stageThree(attempt: StageThreeAttempt, args: string[], settings: Record<string, string> = {}): CommandResult {
  return runCli(args, { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: attempt.work, CHOOM_STAGE3_ID: attempt.id,
    CHOOM_STAGE3: attempt.folder, ...settings });
}

// A complete Stage 3 packet. The analysis keeps every Stage 2 record, reviews the
// collected excerpt of app.ts and adds one inspection priority, and copies each
// required gap that the actions of the attempt saved, as the finalizer requires.
function stageThreePacket(attempt: StageThreeAttempt): StageThreePacket {
  const previous = parse(readFileSync(join(attempt.work, "evidence", stageTwoId, "entry-analysis.yaml"), "utf8")) as JsonRecord;
  const source = `${attempt.id}-source-${app.path}`;
  const analysis = { formatVersion: 1, kind: "entry-analysis", snapshotRef: stagedSnapshotRef,
    previousEntryAnalysisRef: `${stageTwoId}-entry-analysis`, planRef: previous.planRef, knipRunsRef: previous.knipRunsRef,
    candidates: previous.candidates, reviewedFiles: [{ id: source, snapshotRef: stagedSnapshotRef, path: app.path,
      sha256: createHash("sha256").update(app.text).digest("hex"), lines: [1, 1] }],
    questions: previous.questions, gaps: [...previous.gaps as JsonRecord[], ...stageThreeRequiredGaps(attempt)],
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

// The gaps of the required-gaps files that the actions of the attempt saved: the file of
// collect and the file of each exports request. The review must copy each gap exactly.
export function stageThreeRequiredGaps(attempt: StageThreeAttempt): JsonRecord[] {
  return readdirSync(attempt.folder).filter((name) => /^(?:exports-[0-9]+\.)?required-gaps\.json$/.test(name)).sort()
    .flatMap((name) => (JSON.parse(readFileSync(join(attempt.folder, name), "utf8")) as JsonRecord).gaps as JsonRecord[]);
}

// Saves the packet that `change` gives, after the evidence actions of the attempt.
export function saveStageThreeReview(attempt: StageThreeAttempt, change: (packet: StageThreePacket) => void = () => {}): CommandResult {
  const packet = stageThreePacket(attempt);
  change(packet);
  return stageThree(attempt, ["stage-3", "save-review", writeStageThreePacket(attempt, packet)]);
}

// Runs start, collect, each text search (its arguments) and each exports request
// (its path), and saves the packet that `change` gives. The attempt is then ready
// for the finalizer.
export function reviewStageThree(attempt: StageThreeAttempt, change: (packet: StageThreePacket) => void = () => {},
  searches: string[][] = [], exports: string[] = []): Record<string, CommandResult> {
  const results: Record<string, CommandResult> = {};
  for (const action of ["start", "collect"]) results[action] = stageThree(attempt, ["stage-3", action]);
  for (const [index, search] of searches.entries())
    results[`text-search-${index + 1}`] = stageThree(attempt, ["stage-3", "text-search", ...search]);
  for (const [index, path] of exports.entries())
    results[`exports-${index + 1}`] = stageThree(attempt, ["stage-3", "exports", path]);
  results["save-review"] = saveStageThreeReview(attempt, change);
  return results;
}

// Saves the review as reviewStageThree does, and runs the finalizer with the added `finishSettings`.
export function finishStageThree(attempt: StageThreeAttempt, change: (packet: StageThreePacket) => void = () => {},
  searches: string[][] = [], exports: string[] = [], finishSettings: Record<string, string> = {}): Record<string, CommandResult> {
  const results = reviewStageThree(attempt, change, searches, exports);
  results.finish = stageThree(attempt, ["stage-3-finish"], finishSettings);
  return results;
}
