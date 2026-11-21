import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withScratch } from "../../support/commands.ts";
import { entryPlan, requiredGaps, runAttempt, savedJson, stageOneRun, stageTwoAttempt, type JsonRecord,
  type StageTwoAttempt } from "../../support/stage-2-attempt.ts";
import { dockerCalls, pathWithDoubles } from "../../support/tool-doubles.ts";

// The toolchain action builds and checks the Knip tool image; run uses an
// approved image. The Docker double fails the step that each case names.
interface ImageCase {
  name: string;
  settings: Record<string, string>;
  files: Record<string, string>;
  message: string;
  calls: string[];
  reason: string;
}

const id = "s2-check";
const incomplete = "Docker build, image inspection, or fixture check did not produce a complete receipt.";
const noImage = "No approved available tool image: CHOOM_KNIP_IMAGE must be an inspected sha256 image ID.";
// The required gap of the Knip run at the given index of the Knip receipts (DB5).
const knipGap = (number: string, reason: string, index: number): JsonRecord => ({ id: `${id}-knip-gap-${number}`,
  kind: "tool-outcome", subjectRefs: ["snapshot-check"], reason, evidenceRefs: [`${id}-knip-runs#/runs/${index}`] });

const imageCases: ImageCase[] = [
  { name: "the image build fails", settings: { DOCKER_DOUBLE_BUILD: "fail" },
    files: { "build-exit.txt": "1\n", "build.stderr.txt": "ERROR: test double build failed\n", "build.stdout.txt": "" },
    message: "Tool image unavailable; continue with a skipped Knip outcome.\n", calls: ["--version", "build"], reason: incomplete },
  { name: "the built image cannot be inspected", settings: { DOCKER_DOUBLE_INSPECT: "fail" },
    files: { "build-exit.txt": "0\n", "build-image-id.txt": "sha256:" + "b".repeat(64), "build.stderr.txt": "",
      "build.stdout.txt": "#1 test double build\n", "image-id.txt": "", "image-inspect-exit.txt": "1\n",
      "image-inspect.stderr.txt": "Error: No such image\n" },
    message: "Built image could not be resolved; leave the selected image empty.\n", calls: ["--version", "build", "image"],
    reason: incomplete },
  { name: "the image check fails", settings: { DOCKER_DOUBLE_CHECK: "fail" },
    files: { "build-exit.txt": "0\n", "build-image-id.txt": "sha256:" + "b".repeat(64), "build.stderr.txt": "",
      "build.stdout.txt": "#1 test double build\n", "image-id.txt": "sha256:" + "a".repeat(64) + "\n",
      "image-inspect-exit.txt": "0\n", "image-inspect.stderr.txt": "", "check-exit.txt": "1\n", "metadata.json": "",
      "check.stderr.txt": "test double image check failed\n" },
    message: "Image check failed; continue with a skipped Knip outcome.\n", calls: ["--version", "build", "image", "run"],
    reason: "Unexpected end of JSON input" },
];

function attemptWithDoubles(scratch: string, settings: Record<string, string> = {}): StageTwoAttempt {
  const work = join(scratch, "run");
  stageOneRun(work);
  return stageTwoAttempt(work, id, { PATH: pathWithDoubles(scratch), DOCKER_DOUBLE_LOG: join(scratch, "docker.log"), ...settings });
}

function toolchainFiles(attempt: StageTwoAttempt): Record<string, string> {
  const folder = join(attempt.folder, "toolchain");
  return Object.fromEntries(readdirSync(folder).sort().filter((name) => !["Dockerfile", "docker-version.txt"].includes(name))
    .map((name) => [name, readFileSync(join(folder, name), "utf8")]));
}

describe("Stage 2 tool image steps", () => {
  test.each(imageCases)("$name: the selection is unavailable and run skips Knip", ({ settings, files, message, calls, reason }) => {
    withScratch((scratch) => {
      const attempt = attemptWithDoubles(scratch, settings);
      const results = runAttempt(attempt, scratch);
      const selection = { status: "unavailable", imageId: null, reason };
      expect(results.toolchain?.status).toBe(1);
      expect(results.toolchain?.stdout).toBe(message + JSON.stringify(selection, null, 2) + "\n");
      expect(results.toolchain?.stderr).toContain("No tool image was approved. Run can still record skipped Knip outcomes.");
      expect(toolchainFiles(attempt)).toEqual(files);
      expect(savedJson(attempt, "toolchain-selection.json")).toEqual(selection);
      expect(dockerCalls(join(scratch, "docker.log")).map(({ args }) => args[0])).toEqual(calls);
      expect(results.run?.status).toBe(0);
      expect((savedJson(attempt, "knip-runs.json").runs as JsonRecord[]).map(({ mode, status, reasons }) =>
        ({ mode, status, reasons }))).toEqual(["normal", "production"].map((mode) => ({ mode, status: "skipped", reasons: [noImage] })));
      expect(requiredGaps(attempt)).toEqual([knipGap("001", `The normal Knip run was skipped. ${noImage}`, 0),
        knipGap("002", `The production Knip run was skipped. ${noImage}`, 1)]);
    });
  }, 30_000);

  test("a failing docker --version stops the saved command with its exit code", () => {
    withScratch((scratch) => {
      const attempt = attemptWithDoubles(scratch, { DOCKER_DOUBLE_VERSION_EXIT: "3" });
      const results = runAttempt(attempt, scratch);
      expect(results.toolchain?.status).toBe(1);
      expect(results.toolchain?.stderr).toContain("Saved command failed: operator-toolchain-image.sh");
      const receipt = savedJson(attempt, "operator-toolchain.json");
      expect(receipt).toMatchObject({ exitCode: 1, error: "Saved command failed: operator-toolchain-image.sh" });
      expect((receipt.commands as JsonRecord[]).map(({ exitCode }) => exitCode)).toEqual([3]);
      expect(readdirSync(join(attempt.folder, "toolchain"))).toEqual(["docker-version.txt"]);
      expect(existsSync(join(attempt.folder, "toolchain-selection.json"))).toBe(false);
    });
  }, 30_000);
});

describe("Stage 2 Knip runs with an approved image", () => {
  test("skips production analysis that the plan did not select", () => {
    withScratch((scratch) => {
      const attempt = attemptWithDoubles(scratch);
      const plan = entryPlan(id, { runProduction: false, productionReason: "No production entry is known (inventory-001)." });
      expect(runAttempt(attempt, scratch, plan).run?.stdout).toBe("normal: completed\nproduction: skipped\n");
      const runs = savedJson(attempt, "knip-runs.json").runs as JsonRecord[];
      expect(runs[1]).toMatchObject({ mode: "production", status: "skipped",
        reasons: ["Production analysis was not selected: No production entry is known (inventory-001)."] });
      expect(requiredGaps(attempt)).toEqual([knipGap("001", "The production Knip run was skipped. " +
        "Production analysis was not selected: No production entry is known (inventory-001).", 1)]);
      expect(dockerCalls(join(scratch, "docker.log")).filter(({ args }) => args.includes("--production"))).toEqual([]);
    });
  }, 30_000);

  test("records a run whose report is not JSON as failed and keeps its raw output", () => {
    withScratch((scratch) => {
      const attempt = attemptWithDoubles(scratch, { DOCKER_DOUBLE_KNIP: "invalid" });
      expect(runAttempt(attempt, scratch).run?.stdout).toBe("normal: failed\nproduction: failed\n");
      const runs = savedJson(attempt, "knip-runs.json").runs as JsonRecord[];
      for (const run of runs) {
        expect(run).toMatchObject({ status: "failed", exitCode: 1, report: { valid: false, issueRecordCount: null } });
        expect((run.report as JsonRecord).error).toContain("is not valid JSON");
      }
      expect(readFileSync(join(attempt.folder, "knip-normal.stdout.txt"), "utf8")).toBe("test double output that is not JSON\n");
      expect(requiredGaps(attempt)).toEqual(runs.map((run, index) => knipGap(`00${index + 1}`,
        `The ${String(run.mode)} Knip run failed. The report is not valid: ${String((run.report as JsonRecord).error)}.`, index)));
    });
  }, 30_000);
});
