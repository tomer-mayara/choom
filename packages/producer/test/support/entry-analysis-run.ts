import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { inspectStageFour, type StageFourAttempt, startStageFour } from "../fixtures/stage-4-publication/fixture.ts";
import { type CommandResult, makeScratch, removeScratch } from "./commands.ts";
import type { KnipProject } from "./knip-plugin-projects.ts";
import { captureOrder, entryAnalysis, finishAttempt, planPacket, priorQuestion, stageTwo, stageTwoAttempt, type StageTwoAttempt }
  from "./stage-2-attempt.ts";
import { finishStageThree, stageThreeAttempt } from "./stage-3-attempt.ts";
import { stagedRun, stagedSnapshotRef } from "./staged-run.ts";

// Runs the entry analysis of a project as an operator does, through the command
// line: Stage 1 saves the snapshot, Stage 2 runs Knip in the pinned tool image, and
// Stage 3 finishes. Then Stage 4 start and collect save the behavior entry
// candidates. Stage 2 needs a Docker engine. The Stage 4 toolchain and graph phases
// are written as the Stage 4 fixture writes them; collect does not use Docker.
export interface EntryAnalysisRun {
  // The scratch folder that holds every copy of the run.
  root: string;
  stageTwo: StageTwoAttempt;
  stageFour: StageFourAttempt;
}

// The toolchain action builds the image, and the run action runs two containers.
const imageTimeout = 20 * 60_000;

function requireDocker(): void {
  const engine = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8", timeout: 30_000 });
  if (engine.error || engine.status !== 0)
    throw new Error(`These scenarios need Docker. 'docker info' failed: ${engine.error?.message ?? engine.stderr.trim()}`);
}

function completed(label: string, results: Record<string, CommandResult>): void {
  for (const [action, result] of Object.entries(results))
    if (result.status !== 0) throw new Error(`${label} ${action} failed: ${result.stderr}`);
}

function runStageTwo(root: string, project: KnipProject): StageTwoAttempt {
  const work = join(root, "stage-2-run");
  // Stage 4 collect reads the role records of the Stage 1 review; this one has none. Stage 2
  // start checks that the inventory lists the snapshot files in the order of a Stage 1 capture.
  stagedRun(work, 1, { snapshot: captureOrder(project.snapshot), questions: [priorQuestion], review: { formatVersion: 1,
    snapshotRef: stagedSnapshotRef, reviewedFiles: [], roles: [], workspaceDeclarations: [], questions: [], gaps: [],
    llmReview: "recorded" } });
  const attempt = stageTwoAttempt(work, "s2-check");
  const results: Record<string, CommandResult> = { start: stageTwo(attempt, "start") };
  results.plan = stageTwo(attempt, "plan", [planPacket(join(root, "plan"), attempt.id, project.plan(attempt.id))]);
  results.prepare = stageTwo(attempt, "prepare");
  for (const action of ["toolchain", "run"]) results[action] = stageTwo(attempt, action, [], {}, imageTimeout);
  completed("Stage 2", { ...results, ...finishAttempt(attempt, root, entryAnalysis(attempt, { gaps: [] })) });
  return attempt;
}

export function runEntryAnalysis(project: KnipProject): EntryAnalysisRun {
  requireDocker();
  const root = makeScratch();
  try {
    const stageTwoRun = runStageTwo(root, project);
    const stageThree = stageThreeAttempt(stageTwoRun.work, join(root, "stage-3"));
    completed("Stage 3", finishStageThree(stageThree, (packet) => {
      packet.analysis.knipAssessment = { action: "reuse", evidenceRefs: [`${stageTwoRun.id}-knip-runs`],
        reason: "Knip ran in the pinned tool image, and its saved inputs still describe this snapshot." };
    }));
    const stageFour = startStageFour(root, stageThree.work);
    completed("Stage 4", { collect: inspectStageFour(stageFour, ["collect"]) });
    return { root, stageTwo: stageTwoRun, stageFour };
  } catch (error) {
    removeScratch(root);
    throw error;
  }
}
