import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { producerSource, runHelper, toolsRoot, withScratch } from "../../support/producer-commands.ts";

// Each case runs a producer command file as an operator does, with no action or an
// unknown action, and records the current exit code and the key part of its message.
interface UsageCase {
  helper: string;
  args: string[];
  attempt?: Record<string, string>;
  status: number;
  message: string;
}

const usageCases: UsageCase[] = [
  { helper: "stage-1-commands.mjs", args: [], status: 1,
    message: "Use start, capture, settings, excerpt PATH FIRST LAST REASON, finish REVIEW_FOLDER, or verify." },
  { helper: "stage-2-commands.mjs", args: [], attempt: { CHOOM_STAGE2_ID: "s2-check" }, status: 1,
    message: "Use start, excerpt PATH FIRST LAST REASON, plan REVIEW_DIR, prepare, toolchain, run, save-review REVIEW_DIR, or finish." },
  { helper: "stage-3-commands.mjs", args: [], attempt: { CHOOM_STAGE3_ID: "s3-check" }, status: 1,
    message: "Use start, collect, excerpt PATH FIRST LAST, or save-review REVIEW_DIR." },
  { helper: "stage-3-finish.mjs", args: ["unknown"], attempt: { CHOOM_STAGE3_ID: "s3-check" }, status: 1,
    message: "Run the saved Stage 3 finalizer without arguments to publish, or with verify to check completed Stage 3." },
  { helper: "stage-4-commands.mjs", args: [], attempt: { CHOOM_STAGE4_ID: "s4-check" }, status: 1,
    message: "Use start, toolchain, or run." },
  { helper: "stage-4-graph.mjs", args: [], status: 1, message: "Use /control/graph-profile.json or --fixture." },
  { helper: "stage-4-inspect.mjs", args: [], attempt: { CHOOM_STAGE4_ID: "s4-check" }, status: 1,
    message: "Use collect, or excerpt PATH FIRST LAST." },
  { helper: "stage-4-5-publish.mjs", args: [], status: 1,
    message: "Use check STAGE REVIEW_DIR, finish STAGE REVIEW_DIR, or verify STAGE (4 or 5)." },
  { helper: "stage-5-commands.mjs", args: [], attempt: { CHOOM_STAGE5_ID: "s5-check" }, status: 1,
    message: "Use start, collect, or excerpt PATH FIRST LAST." },
  { helper: "stage-6-commands.mjs", args: [], attempt: { CHOOM_STAGE6_ID: "s6-check" }, status: 1,
    message: "Use preflight REVIEW_DIR, start REVIEW_DIR, check, finish, or verify." },
  { helper: "duplication-commands.mjs", args: [], status: 1,
    message: "Use start RUN OUTPUT ID, collect OUTPUT, skip OUTPUT REASON, review OUTPUT INPUT_JSON, or publish OUTPUT." },
  { helper: "recover-capture.mjs", args: ["unknown"], status: 1,
    message: "Use no argument to capture, or --check for read-only verification." },
  { helper: "inventory-view.py", args: [], status: 2, message: "the following arguments are required: operation, work, " +
    "inventory, inventory_sha256, snapshot_id, attempt_id" },
  { helper: "inventory-view.py", args: ["unknown", "work", "inventory", "digest", "snapshot", "s4-check"], status: 2,
    message: "argument operation: invalid choice: 'unknown'" },
];

function emptyRun(scratch: string): string {
  const work = join(scratch, "run");
  mkdirSync(join(work, "evidence"), { recursive: true });
  return work;
}

function attemptFolder(work: string, id: string): string {
  const attempt = join(work, "evidence", id);
  mkdirSync(attempt);
  return attempt;
}

describe("producer command usage", () => {
  test.each(usageCases)("$helper $args reports its usage", ({ helper, args, attempt, status, message }) => {
    withScratch((scratch) => {
      const work = emptyRun(scratch);
      const result = runHelper(join(producerSource, helper), args, { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, ...attempt });
      expect({ status: result.status, stdout: result.stdout }).toEqual({ status, stdout: "" });
      expect(result.stderr).toContain(message);
      expect(readdirSync(work, { recursive: true })).toEqual(["evidence"]);
    });
  });

  test("the Knip image check without its settings reports the missing setting in its JSON result", () => {
    const result = runHelper(join(producerSource, "check-knip-image.mjs"));
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout) as { knip: unknown; check: { status: string; error: string } };
    expect(report.knip).toBeNull();
    expect(report.check.status).toBe("failed");
    expect(report.check.error).toContain("Use KNIP_DISABLE_RAW_TRANSFER=1 for the check and analysis.");
  });
});

describe("helpers that run from a saved attempt", () => {
  test("Stage 3 refuses its trusted finalizer and runs the saved copy against its checkpoints", () => {
    withScratch((scratch) => {
      const work = emptyRun(scratch);
      const attempt = attemptFolder(work, "s3-check");
      const settings = { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE3_ID: "s3-check" };
      const trusted = runHelper(join(producerSource, "stage-3-finish.mjs"), [], settings);
      expect(trusted.status).toBe(1);
      expect(trusted.stderr).toBe("Run stage-3-finish.mjs from the saved attempt.\n");
      cpSync(join(producerSource, "stage-3-finish.mjs"), join(attempt, "stage-3-finish.mjs"));
      const saved = runHelper(join(attempt, "stage-3-finish.mjs"), [], settings);
      expect(saved.status).toBe(1);
      expect(saved.stderr).toBe(`ENOENT: no such file or directory, lstat '${join(attempt, "run.before.yaml")}'\n`);
    });
  });

  test("Stage 4 refuses later actions and inspection from the trusted checkout", () => {
    withScratch((scratch) => {
      const work = emptyRun(scratch);
      const attempt = attemptFolder(work, "s4-check");
      const settings = { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: "s4-check" };
      const toolchain = runHelper(join(producerSource, "stage-4-commands.mjs"), ["toolchain"], settings);
      expect(toolchain.status).toBe(1);
      expect(toolchain.stderr).toContain("Use the trusted checkout for start and the frozen attempt helper for later commands.");
      const inspection = runHelper(join(producerSource, "stage-4-inspect.mjs"), ["collect"], settings);
      expect(inspection.status).toBe(1);
      expect(inspection.stderr).toContain("Run the saved inspection helper.");
      cpSync(join(producerSource, "stage-4-inspect.mjs"), join(attempt, "stage-4-inspect.mjs"));
      const saved = runHelper(join(attempt, "stage-4-inspect.mjs"), ["collect"], settings);
      expect(saved.status).toBe(1);
      expect(saved.stderr).toContain(`ENOENT: no such file or directory, lstat '${join(attempt, "operator-start.json")}'`);
    });
  });
});

describe("trusted commands find their own files before they read the run", () => {
  test("the Stage 4/5 publisher reaches the saved attempt checkpoints", () => {
    withScratch((scratch) => {
      const work = emptyRun(scratch);
      const attempt = attemptFolder(work, "s5-check");
      const result = runHelper(join(producerSource, "stage-4-5-publish.mjs"), ["verify", "5"],
        { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE5_ID: "s5-check", CHOOM_STAGE5: attempt });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(`ENOENT: no such file or directory, lstat '${join(attempt, "run.before.yaml")}'\n`);
    });
  });

  test("Stage 5 reads its seven tool sources and parsers, then reaches the run manifest", () => {
    withScratch((scratch) => {
      const work = emptyRun(scratch);
      const result = runHelper(join(producerSource, "stage-5-commands.mjs"), ["start"], { CHOOM_TOOLS: toolsRoot,
        CHOOM_WORK: work, CHOOM_STAGE5_ID: "s5-check", CHOOM_STAGE5: join(work, "evidence", "s5-check") });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(`ENOENT: no such file or directory, lstat '${join(work, "run.yaml")}'\n`);
      expect(readdirSync(join(work, "evidence"))).toEqual([]);
    });
  });

  test("Stage 6 reads its four tool sources, then checks the readiness packet", () => {
    withScratch((scratch) => {
      const work = emptyRun(scratch);
      const review = join(scratch, "review");
      mkdirSync(review);
      const result = runHelper(join(producerSource, "stage-6-commands.mjs"), ["start", review], { CHOOM_TOOLS: toolsRoot,
        CHOOM_WORK: work, CHOOM_STAGE6_ID: "s6-check", CHOOM_STAGE6: join(work, "evidence", "s6-check") });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("Unexpected readiness packet file set.\n");
      expect(readdirSync(join(work, "evidence"))).toEqual([]);
    });
  });
});
