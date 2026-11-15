import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withScratch } from "../../support/commands.ts";
import { changeBaselineModelCode, changedCodeMessage, folderState } from "../../support/producer-record.ts";
import { savedJson, stageOneRun, stageTwo, stageTwoAttempt, stageTwoSnapshot,
  type JsonRecord } from "../../support/stage-2-attempt.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";

// Every Stage 2 action runs the producer code in the tool checkout, after it checks
// the producer code record of the run. Start saves only the cookbook, as a record.
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const producerCode = (name: string): boolean => /\.(?:m?ts|mjs|py)$/.test(name);
const excerpt = ["app.ts", "1", "1", "Check the entry module."];

describe("Stage 2 and the producer code record", () => {
  test("each action after start refuses the attempt after a baseline-model file changed, and changes nothing", () => {
    withScratch((scratch) => {
      const tools = copyToolCheckout(scratch);
      const work = join(scratch, "run");
      stageOneRun(work, stageTwoSnapshot, tools);
      const attempt = stageTwoAttempt(work, "s2-check", {}, tools);
      expect(stageTwo(attempt, "start").status).toBe(0);
      changeBaselineModelCode(tools);
      const before = folderState(work);
      const review = join(scratch, "review");
      const actions: [string, string[]][] = [["excerpt", excerpt], ["plan", [review]], ["prepare", []], ["toolchain", []],
        ["run", []], ["save-review", [review]], ["finish", []]];
      for (const [action, args] of actions) {
        const result = stageTwo(attempt, action, args);
        expect({ action, status: result.status, stdout: result.stdout, stderr: result.stderr })
          .toEqual({ action, status: 1, stdout: "", stderr: changedCodeMessage(work) });
      }
      expect(folderState(work)).toEqual(before);
    });
  }, 60_000);

  test("start refuses a run whose producer code changed, before it creates the attempt", () => {
    withScratch((scratch) => {
      const tools = copyToolCheckout(scratch);
      const work = join(scratch, "run");
      stageOneRun(work, stageTwoSnapshot, tools);
      changeBaselineModelCode(tools);
      const attempt = stageTwoAttempt(work, "s2-check", {}, tools);
      const start = stageTwo(attempt, "start");
      expect({ status: start.status, stdout: start.stdout, stderr: start.stderr })
        .toEqual({ status: 1, stdout: "", stderr: changedCodeMessage(work) });
      expect(existsSync(attempt.folder)).toBe(false);
    });
  });

  test("start saves the cookbook as its only copy and lists its digest; a saved script runs a module in the checkout", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const attempt = stageTwoAttempt(work, "s2-check");
      expect(stageTwo(attempt, "start").status).toBe(0);
      const digests = savedJson(attempt, "operator-start.json").digests as JsonRecord;
      expect(digests["cookbook.md"]).toBe(sha256(readFileSync(join(attempt.folder, "cookbook.md"))));
      expect([...readdirSync(attempt.folder).filter(producerCode), ...Object.keys(digests).filter(producerCode)]).toEqual([]);
      expect(readFileSync(join(attempt.folder, "operator-start-handoff.sh"), "utf8"))
        .toBe('set -eCu\nnode "$CHOOM_TOOLS/packages/producer/src/stage-2-handoff.ts"\n');
    });
  });

  test("a later action refuses a saved cookbook that changed after start", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const attempt = stageTwoAttempt(work, "s2-check");
      expect(stageTwo(attempt, "start").status).toBe(0);
      const path = join(attempt.folder, "cookbook.md");
      const original = readFileSync(path);
      appendFileSync(path, "\n");
      const changed = stageTwo(attempt, "excerpt", excerpt);
      expect({ status: changed.status, refused: changed.stderr.includes("Saved phase input or output changed: cookbook.md") })
        .toEqual({ status: 1, refused: true });
      writeFileSync(path, original);
      expect(stageTwo(attempt, "excerpt", excerpt).status).toBe(0);
    });
  });
});
