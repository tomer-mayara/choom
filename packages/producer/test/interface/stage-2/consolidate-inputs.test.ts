import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { type CommandResult, runCli, runHelper, toolsRoot, withScratch } from "../../support/commands.ts";
import { stageOneRun } from "../../support/stage-2-attempt.ts";

// The maintenance step adopts one earlier per-attempt Knip input folder as the
// shared input and removes the others. It refuses to move registered evidence.
interface RunManifest { artifacts: Record<string, { path: string; sha256: string }> }

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

// Two verified per-attempt input folders, as older Stage 2 attempts created them.
function legacyInputs(work: string): string {
  const inventory = join(work, "evidence/inventory.json");
  const digest = sha256(readFileSync(inventory));
  for (const attempt of ["s2-003", "s2-002"]) {
    const view = runHelper(join(toolsRoot, "packages/producer/src/inventory-view.py"),
      ["prepare", work, inventory, digest, "snapshot-check", attempt]);
    expect(view.status).toBe(0);
    renameSync(join(work, "knip-input-" + digest), join(work, "knip-input-" + attempt));
  }
  return digest;
}

// Runs the operator command from the step-2 cookbook for source s2-003 and retired s2-002.
function consolidate(work: string, attempts = ["s2-003", "s2-002"]): CommandResult {
  return runCli(["stage-2-consolidate", ...attempts], { CHOOM_WORK: work, CHOOM_TOOLS: toolsRoot });
}

describe("Stage 2 input consolidation", () => {
  test("adopts the source attempt's input as the shared input and removes the retired copy", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const digest = legacyInputs(work);
      const result = consolidate(work);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "verified", operation: "consolidate", attemptId: "s2-003",
        retireRequested: ["s2-002"], adoptedFrom: join(work, "knip-input-s2-003"), files: 2 });
      expect(["knip-input-" + digest, "knip-input-s2-003", "knip-input-s2-002"].map((name) => existsSync(join(work, name))))
        .toEqual([true, false, false]);
      expect(JSON.parse(readFileSync(join(work, "evidence/knip-input-migration-s2-003.json"), "utf8")))
        .toMatchObject({ status: "verified" });
    });
  }, 30_000);

  test("refuses to move a folder that holds registered evidence", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const digest = legacyInputs(work);
      const run = parse(readFileSync(join(work, "run.yaml"), "utf8")) as RunManifest;
      run.artifacts["old-input"] = { path: "knip-input-s2-002/app.ts", sha256: sha256("export const value = 1;\n") };
      writeFileSync(join(work, "run.yaml"), stringify(run));
      const result = consolidate(work);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Registered evidence would be moved or changed: old-input");
      expect(["knip-input-" + digest, "knip-input-s2-003", "knip-input-s2-002", "evidence/knip-input-migration-s2-003.json"]
        .map((name) => existsSync(join(work, name)))).toEqual([false, true, true, false]);
    });
  }, 30_000);

  test("refuses a call without a source attempt", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const result = consolidate(work, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Use stage-2-consolidate SOURCE_ATTEMPT [RETIRE_ATTEMPT...].");
    });
  });

  test("refuses a registered file whose digest changed", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      legacyInputs(work);
      writeFileSync(join(work, "inventory.mjs"), "// changed\n");
      const result = consolidate(work);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Registered evidence changed: s1-file@inventory.mjs");
      expect(existsSync(join(work, "knip-input-s2-002"))).toBe(true);
    });
  }, 30_000);
});
