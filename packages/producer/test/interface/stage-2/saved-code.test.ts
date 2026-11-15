import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withScratch } from "../../support/commands.ts";
import { entryPlan, finishAttempt, planPacket, savedJson, stageOneRun, stageTwo, stageTwoAttempt,
  type JsonRecord } from "../../support/stage-2-attempt.ts";
import { breakProducerFiles, copyToolCheckout } from "../../support/tool-checkout.ts";
import { pathWithDoubles } from "../../support/tool-doubles.ts";

// Start saves every program that the later actions of the attempt run, so the
// tool checkout can change during an attempt without changing the attempt.
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const savedCode = (name: string): boolean => /\.(?:mjs|mts|py|sh|md)$/.test(name) && name !== "commands.md";

describe("a Stage 2 attempt runs the code that start saved", () => {
  test("later actions complete after every producer file in the tool checkout changed", () => {
    withScratch((scratch) => {
      const tools = copyToolCheckout(scratch);
      const work = join(scratch, "run");
      stageOneRun(work);
      const attempt = stageTwoAttempt(work, "s2-check", { PATH: pathWithDoubles(scratch),
        DOCKER_DOUBLE_LOG: join(scratch, "docker.log") }, tools);
      expect(stageTwo(attempt, "start").status).toBe(0);
      expect(breakProducerFiles(tools, [])).toEqual(expect.arrayContaining(["cli.ts", "step-2-cookbook.md",
        "check-knip-image.mjs", "inventory-view.py"]));
      const plan = planPacket(join(scratch, "plan"), attempt.id, entryPlan(attempt.id));
      const results = { plan: stageTwo(attempt, "plan", [plan]), prepare: stageTwo(attempt, "prepare"),
        toolchain: stageTwo(attempt, "toolchain"), run: stageTwo(attempt, "run"), ...finishAttempt(attempt, scratch) };
      expect(Object.entries(results).map(([action, { status, stderr }]) => ({ action, status, stderr }))).toEqual(
        ["plan", "prepare", "toolchain", "run", "save-review", "finish"].map((action) => ({ action, status: 0, stderr: "" })));
      expect(results.run.stdout).toBe("normal: completed\nproduction: completed\n");
    });
  }, 60_000);

  test("the start receipt lists every saved program with its digest", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const attempt = stageTwoAttempt(work, "s2-check");
      expect(stageTwo(attempt, "start").status).toBe(0);
      const digests = savedJson(attempt, "operator-start.json").digests as JsonRecord;
      const programs = readdirSync(attempt.folder).filter(savedCode);
      expect(programs).toEqual(expect.arrayContaining(["cookbook.md", "check-knip-image.mjs", "inventory-view.py"]));
      expect(Object.fromEntries(programs.map((name) => [name, digests[name]]))).toEqual(
        Object.fromEntries(programs.map((name) => [name, sha256(readFileSync(join(attempt.folder, name)))])));
    });
  });

  test("a later action refuses each saved program that changed after start", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const first = stageTwoAttempt(work, "s2-list");
      expect(stageTwo(first, "start").status).toBe(0);
      const programs = readdirSync(first.folder).filter(savedCode).sort();
      programs.forEach((name, index) => {
        const attempt = stageTwoAttempt(work, `s2-change-${index}`);
        expect(stageTwo(attempt, "start").status).toBe(0);
        appendFileSync(join(attempt.folder, name), "\n");
        const prepare = stageTwo(attempt, "prepare");
        expect({ name, status: prepare.status, error: savedJson(attempt, "operator-prepare.json").error })
          .toEqual({ name, status: 1, error: "Saved phase input or output changed: " + name });
      });
    });
  }, 60_000);
});
