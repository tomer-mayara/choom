import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { withScratch } from "../../support/commands.ts";
import { folderState } from "../../support/producer-record.ts";
import { capturedStageOneRun, noSettingsTarget, reviewPacket, stageOne, type StageOneRun, writeReview }
  from "../../support/stage-1-run.ts";

// Stage 1 finish adds each gap of the settings record to the discovery gaps, so a
// gap that a tool found does not depend on the review. The review packet is the
// standard one, which does not copy the settings gap.
interface Gap { id?: string; kind: string; subjectRefs: string[]; reason: string; evidenceRefs?: string[] }
interface SavedRun { artifacts: Record<string, { path: string; sha256: string }> }

const sha256 = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");

function savedGaps(run: StageOneRun, path: string): Gap[] {
  return (parse(readFileSync(join(run.work, path), "utf8")) as { gaps: Gap[] }).gaps;
}

// The discovery gap that finish adds for the first gap of the settings record.
function addedSettingsGap(run: StageOneRun): Gap {
  const settings = JSON.parse(readFileSync(join(run.work, "evidence/settings.json"), "utf8")) as { gaps: Gap[] };
  const [gap] = settings.gaps;
  if (gap === undefined) throw new Error("The settings record has no gap.");
  return { id: "s1-settings-gap-001", kind: gap.kind, subjectRefs: gap.subjectRefs, reason: gap.reason,
    evidenceRefs: ["settings-001#/gaps/0"] };
}

function expectSuccess(result: { status: number | null; stderr: string }): void {
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
}

describe("Stage 1 finish and the gaps of the settings record", () => {
  test("adds the gap of a snapshot without project settings to the discovery gaps, and verify accepts the run", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch, noSettingsTarget);
      const packet = reviewPacket(excerpt);
      expectSuccess(stageOne(run, "finish", writeReview(run, packet)));
      const gaps = [...(packet.review.gaps as Gap[]), addedSettingsGap(run)];
      for (const path of ["discovery.yaml", "evidence/stage1-discovery.yaml"])
        expect({ path, gaps: savedGaps(run, path) }).toEqual({ path, gaps });
      expectSuccess(stageOne(run, "verify"));
    });
  }, 60_000);

  test("adds no gap for a snapshot with project settings", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch);
      const packet = reviewPacket(excerpt);
      expectSuccess(stageOne(run, "finish", writeReview(run, packet)));
      expect(savedGaps(run, "discovery.yaml")).toEqual(packet.review.gaps as Gap[]);
    });
  }, 60_000);

  test("refuses a review gap with the ID of a settings gap, and changes nothing", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch, noSettingsTarget);
      const packet = reviewPacket(excerpt);
      const [reviewGap] = packet.review.gaps as Gap[];
      if (reviewGap === undefined) throw new Error("The review packet has no gap.");
      reviewGap.id = "s1-settings-gap-001";
      const before = folderState(run.work);
      const refused = stageOne(run, "finish", writeReview(run, packet));
      expect({ status: refused.status, stdout: refused.stdout, stderr: refused.stderr }).toEqual({ status: 1, stdout: "",
        stderr: "The ID s1-settings-gap-001 is reserved for a gap that finish adds from the settings record. Use a different ID.\n" });
      expect(folderState(run.work)).toEqual(before);
    });
  }, 60_000);

  // verify derives the gaps again from the saved settings record. Here the saved
  // discovery and its registered digest are both changed, so only that check sees it.
  test("verify refuses a saved discovery that lacks a gap of the settings record", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch, noSettingsTarget);
      expectSuccess(stageOne(run, "finish", writeReview(run, reviewPacket(excerpt))));
      const discoveryPath = join(run.work, "evidence/stage1-discovery.yaml");
      const discovery = parse(readFileSync(discoveryPath, "utf8")) as { gaps: Gap[] };
      const changed = stringify({ ...discovery, gaps: discovery.gaps.filter(({ id }) => id !== "s1-settings-gap-001") });
      writeFileSync(discoveryPath, changed);
      const runPath = join(run.work, "run.yaml");
      const saved = parse(readFileSync(runPath, "utf8")) as SavedRun;
      const registered = saved.artifacts["discovery-001"];
      if (registered === undefined) throw new Error("The run does not register the Stage 1 discovery.");
      registered.sha256 = sha256(changed);
      writeFileSync(runPath, stringify(saved));
      const verify = stageOne(run, "verify");
      expect({ status: verify.status, stdout: verify.stdout, stderr: verify.stderr }).toEqual({ status: 1, stdout: "",
        stderr: "The saved Stage 1 discovery lacks the settings gap s1-settings-gap-001. Start a new run.\n" });
    });
  }, 60_000);
});
