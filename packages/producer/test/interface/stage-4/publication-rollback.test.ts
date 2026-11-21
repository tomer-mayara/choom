import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { stageFourPublication, type StageFourPublication } from "../../fixtures/stage-4-publication/fixture.ts";
import { runCli } from "../../support/commands.ts";
import { type DraftFault, draftFaultSettings, injectedRenameFailure } from "../../support/doubles/draft-faults.ts";
import { folderState } from "../../support/producer-record.ts";

// A Stage 4/5 publication that fails after it saved files. The publisher replaces
// baseline.yaml, discovery.yaml and then run.yaml, the publication marker. The fault
// double (support/doubles/draft-faults.ts) makes one rename of the publisher process
// fail, or changes a draft as another writer would. A failed publication gives each
// replaced draft its bytes from before, removes its temporary files and names each
// file that it had to keep. The attempt keeps the packet and the receipt.
const advice = "Keep this attempt unchanged; use a fresh attempt after resolving the cause.";

function finishWith(fixture: StageFourPublication, faults: DraftFault[]): ReturnType<typeof runCli> {
  return runCli(["stage-4-5-publish", "finish", "4", fixture.review], { CHOOM_TOOLS: fixture.tools, CHOOM_WORK: fixture.work,
    CHOOM_STAGE4_ID: "s4-check", CHOOM_STAGE4: fixture.attempt, ...draftFaultSettings(faults) }, fixture.tools);
}

function withFixture(use: (fixture: StageFourPublication) => void): void {
  const fixture = stageFourPublication();
  try {
    use(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

// The files of the run folder outside the attempt, which keeps the packet and the receipt.
const runFiles = (fixture: StageFourPublication): [string, string][] =>
  folderState(fixture.work).filter(([path]) => !path.startsWith("evidence/s4-check/"));

describe("a failed Stage 4/5 publication", () => {
  test.each<[string, DraftFault]>([
    ["the rename of the new baseline", "baseline-rename"],
    ["the rename of the new run manifest, after the baseline and discovery were replaced", "run-rename"],
  ])("gives the drafts their bytes from before and leaves no temporary file when %s fails", (_name, fault) => {
    withFixture((fixture) => {
      const before = runFiles(fixture);
      expect(finishWith(fixture, [fault])).toEqual({ status: 1, stdout: "", stderr: `${injectedRenameFailure} ${advice}\n` });
      expect(runFiles(fixture)).toEqual(before);
      expect(existsSync(join(fixture.attempt, "publication.json"))).toBe(true);
    });
  }, 60_000);

  // The check before the rename of the run manifest finds the change and stops the publication.
  test("keeps a draft that another writer changed after the publication replaced it, and names it", () => {
    withFixture((fixture) => {
      const kept = (): Buffer[] => ["run.yaml", "baseline.yaml"].map((name) => readFileSync(join(fixture.work, name)));
      const before = kept();
      const proposed = readFileSync(join(fixture.review, "discovery.proposed.yaml"), "utf8");
      expect(finishWith(fixture, ["discovery-change"])).toEqual({ status: 1, stdout: "",
        stderr: `Published output changed: discovery.yaml ${advice} Inspect retained paths: discovery.yaml\n` });
      expect(kept()).toEqual(before);
      expect(readFileSync(join(fixture.work, "discovery.yaml"), "utf8")).toBe(proposed + "# changed\n");
      // No temporary file and no publication lock remain.
      expect(readdirSync(fixture.work).filter((name) => name.startsWith("."))).toEqual([]);
    });
  }, 60_000);
});
