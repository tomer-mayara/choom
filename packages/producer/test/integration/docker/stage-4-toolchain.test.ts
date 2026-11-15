import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { producerSource, runHelper, toolsRoot, withScratch } from "../../support/commands.ts";
import { stagedRun } from "../../support/staged-run.ts";

// These suites need a Docker engine. They run with `bun run test:producer:docker`
// and in the CI producer job, not in `bun run test`.
const toolchainTimeout = 20 * 60_000;

function requireDocker(): void {
  const engine = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8", timeout: 30_000 });
  if (engine.error || engine.status !== 0) {
    throw new Error(`These tests need Docker. 'docker info' failed: ${engine.error?.message ?? engine.stderr.trim()}`);
  }
}

test("Stage 4 builds the pinned graph image and the image fixture approves it", () => {
  requireDocker();
  withScratch((scratch) => {
    const work = join(scratch, "run");
    stagedRun(work, 3);
    const attempt = join(work, "evidence/s4-docker");
    const settings = { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: "s4-docker" };
    const started = runHelper(join(producerSource, "stage-4-commands.mjs"), ["start"], settings);
    expect({ status: started.status, stderr: started.stderr }).toEqual({ status: 0, stderr: "" });
    // Later actions run the helper in the tool checkout, as start does.
    const toolchain = runHelper(join(producerSource, "stage-4-commands.mjs"), ["toolchain"],
      { ...settings, CHOOM_STAGE4: attempt }, toolchainTimeout);
    // The helper saves Docker output in the attempt; stderr is shown here only to explain a failure.
    expect({ status: toolchain.status, stderr: toolchain.stderr }).toMatchObject({ status: 0 });
    const selection = JSON.parse(readFileSync(join(attempt, "toolchain-selection.json"), "utf8")) as Record<string, unknown>;
    expect(selection).toMatchObject({ formatVersion: 1, status: "approved",
      toolVersions: { dependencyCruiser: "18.7.2", typescript: "6.0.2", enhancedResolve: "5.26.0" } });
  });
}, toolchainTimeout + 60_000);
