import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { producerReceipt } from "../../src/producer-code.ts";
import { runCli, toolsRoot, withScratch } from "../support/commands.ts";
import { changeBaselineModelCode, changedCodeMessage, folderState, missingRecordMessage } from "../support/producer-record.ts";
import { stagedRun } from "../support/staged-run.ts";
import { copyToolCheckout } from "../support/tool-checkout.ts";

// Every stage action after Stage 1 start checks the producer code record of the
// run before it reads or writes the run. These cases run the command line. The
// Stage 1 and Stage 2 suites change the code during a real run of their stages.
type Stage = 1 | 2 | 3 | 4 | 5 | 6;

function stageSettings(work: string, tools: string, stage: Stage): Record<string, string> {
  const id = `s${stage}-check`;
  return { CHOOM_TOOLS: tools, CHOOM_WORK: work, [`CHOOM_STAGE${stage}_ID`]: id,
    [`CHOOM_STAGE${stage}`]: join(work, "evidence", id) };
}

// Runs each command and expects a refusal with the message and no change to the run.
function expectRefused(work: string, tools: string, commands: [Stage, string[]][], message: string): void {
  const before = folderState(work);
  for (const [stage, args] of commands) {
    const result = runCli(args, stageSettings(work, tools, stage), tools);
    expect({ args, status: result.status, stdout: result.stdout, stderr: result.stderr })
      .toEqual({ args, status: 1, stdout: "", stderr: message });
  }
  expect(folderState(work)).toEqual(before);
}

function startStage(work: string, tools: string, stage: 3 | 4): void {
  const start = runCli([`stage-${stage}`, "start"], stageSettings(work, tools, stage), tools);
  expect({ status: start.status, stderr: start.stderr }).toEqual({ status: 0, stderr: "" });
}

describe("stage actions after the producer code changed", () => {
  test("Stage 3: each action after start refuses the attempt after a baseline-model file changed", () => {
    withScratch((scratch) => {
      const tools = copyToolCheckout(scratch);
      const work = join(scratch, "run");
      stagedRun(work, 2, { tools });
      startStage(work, tools, 3);
      changeBaselineModelCode(tools);
      const review = join(scratch, "review");
      expectRefused(work, tools, [[3, ["stage-3", "collect"]], [3, ["stage-3", "excerpt", "app.ts", "1", "1"]],
        [3, ["stage-3", "save-review", review]], [3, ["stage-3-finish"]], [3, ["stage-3-finish", "verify"]]],
      changedCodeMessage(work));
    });
  }, 60_000);

  test("Stage 4: each action after start refuses the attempt after a baseline-model file changed", () => {
    withScratch((scratch) => {
      const tools = copyToolCheckout(scratch);
      const work = join(scratch, "run");
      stagedRun(work, 3, { tools });
      startStage(work, tools, 4);
      changeBaselineModelCode(tools);
      const review = join(scratch, "review");
      expectRefused(work, tools, [[4, ["stage-4", "toolchain"]], [4, ["stage-4", "run"]],
        [4, ["stage-4-inspect", "collect"]], [4, ["stage-4-inspect", "excerpt", "app.ts", "1", "1"]],
        [4, ["stage-4-5-publish", "check", "4", review]], [4, ["stage-4-5-publish", "finish", "4", review]],
        [4, ["stage-4-5-publish", "verify", "4"]]], changedCodeMessage(work));
    });
  }, 60_000);
});

describe("stage actions in a run without a matching producer code record", () => {
  // Each action of each helper after Stage 1 start, in a run that has only the
  // attempt folders that later Stage 2 actions, the Stage 3 finalizer, the
  // inspection helper and the publisher look for first.
  function commands(review: string): [Stage, string[]][] {
    return [
      [1, ["stage-1", "capture"]], [1, ["stage-1", "settings"]],
      [1, ["stage-1", "excerpt", "app.ts", "1", "1", "Check the entry."]], [1, ["stage-1", "finish", review]],
      [1, ["stage-1", "verify"]], [2, ["stage-2", "start"]], [2, ["stage-2", "excerpt", "app.ts", "1", "1", "Check the entry."]],
      [2, ["stage-2", "plan", review]], [2, ["stage-2", "prepare"]], [2, ["stage-2", "toolchain"]], [2, ["stage-2", "run"]],
      [2, ["stage-2", "save-review", review]], [2, ["stage-2", "finish"]],
      [3, ["stage-3", "start"]], [3, ["stage-3", "collect"]], [3, ["stage-3", "excerpt", "app.ts", "1", "1"]],
      [3, ["stage-3", "save-review", review]], [3, ["stage-3-finish"]], [3, ["stage-3-finish", "verify"]],
      [4, ["stage-4", "start"]], [4, ["stage-4", "toolchain"]], [4, ["stage-4", "run"]],
      [4, ["stage-4-inspect", "collect"]], [4, ["stage-4-inspect", "excerpt", "app.ts", "1", "1"]],
      [4, ["stage-4-5-publish", "check", "4", review]], [4, ["stage-4-5-publish", "verify", "4"]],
      [5, ["stage-5", "start"]], [5, ["stage-5", "collect"]], [5, ["stage-5", "excerpt", "app.ts", "1", "1"]],
      [5, ["stage-4-5-publish", "finish", "5", review]], [5, ["stage-4-5-publish", "verify", "5"]],
      [6, ["stage-6", "preflight", review]], [6, ["stage-6", "start", review]], [6, ["stage-6", "check"]],
      [6, ["stage-6", "finish"]], [6, ["stage-6", "verify"]],
    ];
  }
  const records: [string, (work: string) => void, (work: string) => string][] = [
    ["no record", () => undefined, () => missingRecordMessage],
    ["a record of other code", (work) => writeFileSync(join(work, "evidence/producer.json"),
      JSON.stringify({ ...producerReceipt(toolsRoot), codeDigest: "0".repeat(64) })), changedCodeMessage],
  ];

  test.each(records)("each stage helper refuses a run with %s", (_name, record, message) => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      for (const stage of [2, 3, 4, 5, 6]) mkdirSync(join(work, "evidence", `s${stage}-check`), { recursive: true });
      const review = join(scratch, "review");
      mkdirSync(review);
      record(work);
      expectRefused(work, toolsRoot, commands(review), message(work));
    });
  }, 60_000);
});

describe("a registered producer code record", () => {
  // Stage 1 finish registers the record with the other evidence. A later change to
  // its bytes fails the registered-artifact check even when the digest still matches.
  test("a later stage refuses a run whose registered record changed after Stage 1", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 2);
      writeFileSync(join(work, "evidence/producer.json"), JSON.stringify(producerReceipt(toolsRoot)));
      const start = runCli(["stage-3", "start"], stageSettings(work, toolsRoot, 3));
      expect({ status: start.status, stderr: start.stderr }).toEqual({ status: 1,
        stderr: "Changed registered artifact: s1-file@evidence%2Fproducer.json\n" });
    });
  });
});
