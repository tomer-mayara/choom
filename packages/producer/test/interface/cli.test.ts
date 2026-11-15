import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { producerSource, runCli, toolsRoot, withScratch } from "../support/commands.ts";
import { stagedRun } from "../support/staged-run.ts";

interface StartReceipt { status: string; command: { args: string[]; environment: Record<string, string> } }

describe("producer command line", () => {
  test("prints the usage and exits 1 when the command is missing or unknown", () => {
    const missing = runCli([]);
    expect({ status: missing.status, stdout: missing.stdout }).toEqual({ status: 1, stdout: "" });
    expect(missing.stderr).toStartWith("Usage: producer <command> [action] [arguments...]\n");
    const unknown = runCli(["stage-7", "start"]);
    expect({ status: unknown.status, stdout: unknown.stdout }).toEqual({ status: 1, stdout: "" });
    expect(unknown.stderr).toStartWith("Unknown producer command: stage-7\n\nUsage: producer");
  });

  test("prints the usage on request and exits 0", () => {
    const help = runCli(["--help"]);
    expect({ status: help.status, stderr: help.stderr }).toEqual({ status: 0, stderr: "" });
    expect(help.stdout).toContain("  stage-6");
  });

  test("passes the helper's output and exit code through", () => {
    const stageSix = runCli(["stage-6"], { CHOOM_TOOLS: toolsRoot, CHOOM_STAGE6_ID: "s6-cli" });
    expect(stageSix.status).toBe(1);
    expect(stageSix.stderr).toContain("Use preflight REVIEW_DIR, start REVIEW_DIR, check, finish, or verify.");
    const view = runCli(["inventory-view"]);
    expect(view.status).toBe(2);
    expect(view.stderr).toContain("inventory-view.py: error: the following arguments are required");
  });

  // Later Stage 4 actions check that start ran the trusted helper at this exact path.
  test("starts Stage 4 with the operator's environment and the trusted helper path", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 3);
      const result = runCli(["stage-4", "start"], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: "s4-cli" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toStartWith("Prepared s4-cli: ");
      const attempt = join(work, "evidence/s4-cli");
      const receipt = JSON.parse(readFileSync(join(attempt, "operator-start.json"), "utf8")) as StartReceipt;
      expect(receipt.status).toBe("completed");
      expect(receipt.command.args.slice(1)).toEqual([join(producerSource, "stage-4-commands.mjs"), "start"]);
      expect(receipt.command.environment).toEqual({ CHOOM_WORK: work, CHOOM_TOOLS: toolsRoot, CHOOM_STAGE4_ID: "s4-cli",
        CHOOM_STAGE4: attempt });
    });
  });
});
