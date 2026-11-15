import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { withScratch } from "../../support/commands.ts";
import { commitAll } from "../../support/git-repository.ts";
import { folderState } from "../../support/producer-record.ts";
import { capturedStageOneRun, newStageOneRun, noSettingsTarget, reviewPacket, settingsAndExcerpt, stageOne,
  startAndCapture, type StageOneRun, writeReview } from "../../support/stage-1-run.ts";

// Stage 1 finish adds each gap of the settings record and of the Git identity
// record to the discovery gaps, so a gap that a tool found does not depend on the
// review. The review packet is the standard one, which does not copy these gaps.
// A scratch target is not a Git repository unless the test commits it.
interface Gap { id?: string; kind: string; subjectRefs: string[]; reason: string; evidenceRefs?: string[] }
interface SavedRun { artifacts: Record<string, { path: string; sha256: string }> }
interface ToolRecord { name: string; path: string; artifactRef: string; gapId: string }

const sha256 = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
const settingsRecord: ToolRecord = { name: "settings", path: "evidence/settings.json", artifactRef: "settings-001",
  gapId: "s1-settings-gap-001" };
const gitRecord: ToolRecord = { name: "Git identity", path: "evidence/git-identity.json", artifactRef: "git-identity-001",
  gapId: "s1-git-identity-gap-001" };

function savedGaps(run: StageOneRun, path: string): Gap[] {
  return (parse(readFileSync(join(run.work, path), "utf8")) as { gaps: Gap[] }).gaps;
}

// The discovery gap that finish adds for the first gap of the tool record.
function addedGap(run: StageOneRun, { path, artifactRef, gapId }: ToolRecord): Gap {
  const [gap] = (JSON.parse(readFileSync(join(run.work, path), "utf8")) as { gaps: Gap[] }).gaps;
  if (gap === undefined) throw new Error("The tool record has no gap: " + path);
  return { id: gapId, kind: gap.kind, subjectRefs: gap.subjectRefs, reason: gap.reason,
    evidenceRefs: [artifactRef + "#/gaps/0"] };
}

// Replaces the saved Stage 1 discovery and its registered digest.
function replaceSavedDiscovery(run: StageOneRun, text: string): void {
  writeFileSync(join(run.work, "evidence/stage1-discovery.yaml"), text);
  const runPath = join(run.work, "run.yaml");
  const saved = parse(readFileSync(runPath, "utf8")) as SavedRun;
  const registered = saved.artifacts["discovery-001"];
  if (registered === undefined) throw new Error("The run does not register the Stage 1 discovery.");
  registered.sha256 = sha256(text);
  writeFileSync(runPath, stringify(saved));
}

function expectSuccess(result: { status: number | null; stderr: string }): void {
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
}

function expectRefusal(result: { status: number | null; stdout: string; stderr: string }, message: string): void {
  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr })
    .toEqual({ status: 1, stdout: "", stderr: message + "\n" });
}

describe("Stage 1 finish and the gaps of the tool records", () => {
  test("adds the gaps of a snapshot without project settings and without Git evidence, and verify accepts the run", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch, noSettingsTarget);
      const packet = reviewPacket(excerpt);
      expectSuccess(stageOne(run, "finish", writeReview(run, packet)));
      const gaps = [...(packet.review.gaps as Gap[]), addedGap(run, settingsRecord), addedGap(run, gitRecord)];
      for (const path of ["discovery.yaml", "evidence/stage1-discovery.yaml"])
        expect({ path, gaps: savedGaps(run, path) }).toEqual({ path, gaps });
      expectSuccess(stageOne(run, "verify"));
    });
  }, 60_000);

  test("adds no settings gap for a snapshot with project settings", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch);
      const packet = reviewPacket(excerpt);
      expectSuccess(stageOne(run, "finish", writeReview(run, packet)));
      expect(savedGaps(run, "discovery.yaml")).toEqual([...(packet.review.gaps as Gap[]), addedGap(run, gitRecord)]);
    });
  }, 60_000);

  test("adds no Git gap for a target with Git evidence, and verify accepts the run", () => {
    withScratch((scratch) => {
      const prepared = newStageOneRun(scratch, noSettingsTarget);
      commitAll(prepared.target);
      const { run, excerpt } = settingsAndExcerpt(startAndCapture(prepared));
      const packet = reviewPacket(excerpt);
      expectSuccess(stageOne(run, "finish", writeReview(run, packet)));
      expect(savedGaps(run, "discovery.yaml")).toEqual([...(packet.review.gaps as Gap[]), addedGap(run, settingsRecord)]);
      expectSuccess(stageOne(run, "verify"));
    });
  }, 60_000);

  test("refuses a review gap with the ID of a gap that finish adds, and changes nothing", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch, noSettingsTarget);
      for (const { name, gapId } of [settingsRecord, gitRecord]) {
        const packet = reviewPacket(excerpt);
        const [reviewGap] = packet.review.gaps as Gap[];
        if (reviewGap === undefined) throw new Error("The review packet has no gap.");
        reviewGap.id = gapId;
        const before = folderState(run.work);
        expectRefusal(stageOne(run, "finish", writeReview(run, packet, join(scratch, "review-" + gapId))),
          `The ID ${gapId} is reserved for a gap that finish adds from the ${name} record. Use a different ID.`);
        expect(folderState(run.work)).toEqual(before);
      }
    });
  }, 60_000);

  test("refuses a Git identity record that is not valid, and changes nothing", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch, noSettingsTarget);
      const path = join(run.work, gitRecord.path);
      writeFileSync(path, JSON.stringify({ ...(JSON.parse(readFileSync(path, "utf8")) as object), gaps: [] }));
      const before = folderState(run.work);
      expectRefusal(stageOne(run, "finish", writeReview(run, reviewPacket(excerpt))),
        "The Git identity record evidence/git-identity.json is not valid. Start a new run.");
      expect(folderState(run.work)).toEqual(before);
    });
  }, 60_000);

  // verify derives the gaps again from the saved tool records. Here the saved
  // discovery and its registered digest are both changed, so only that check sees it.
  test("verify refuses a saved discovery that lacks a gap of a tool record", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch, noSettingsTarget);
      expectSuccess(stageOne(run, "finish", writeReview(run, reviewPacket(excerpt))));
      const saved = readFileSync(join(run.work, "evidence/stage1-discovery.yaml"), "utf8");
      for (const { name, gapId } of [settingsRecord, gitRecord]) {
        const discovery = parse(saved) as { gaps: Gap[] };
        replaceSavedDiscovery(run, stringify({ ...discovery, gaps: discovery.gaps.filter(({ id }) => id !== gapId) }));
        expectRefusal(stageOne(run, "verify"), `The saved Stage 1 discovery lacks the ${name} gap ${gapId}. Start a new run.`);
      }
    });
  }, 60_000);
});
