import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { producerSource, runHelper, toolsRoot, withScratch } from "../support/commands.ts";

// These commands can run without Docker against the tools installed in the checkout.
interface DuplicationFixture { root: string; work: string; output: string }
interface DuplicationModule { fixtureRun(): DuplicationFixture }

const sha256 = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
const helper = (name: string): string => join(producerSource, name);
// The fixture is JavaScript. This local type states only what these tests use.
const duplicationModule = new URL("../fixtures/duplication-producer/fixture.mjs", import.meta.url);

function savedSnapshot(work: string, snapshotId: string): { inventory: string; digest: string } {
  const source = "export const value = 1;\n";
  mkdirSync(join(work, "snapshot"), { recursive: true });
  mkdirSync(join(work, "evidence"), { recursive: true });
  writeFileSync(join(work, "snapshot/app.ts"), source);
  const inventory = JSON.stringify({ formatVersion: 1, snapshotId,
    files: [{ path: "app.ts", kind: "file", bytes: Buffer.byteLength(source), sha256: sha256(source) }] });
  writeFileSync(join(work, "evidence/inventory.json"), inventory);
  return { inventory: join(work, "evidence/inventory.json"), digest: sha256(inventory) };
}

describe("local producer tool checks", () => {
  test("the Stage 4 graph fixture approves the checkout's dependency-cruiser toolchain", () => {
    const result = runHelper(helper("stage-4-graph.mjs"), ["--fixture"], { CHOOM_GRAPH_TOOLS: toolsRoot });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "approved", contextCount: 4,
      toolVersions: { dependencyCruiser: "18.7.2", typescript: "6.0.2", enhancedResolve: "5.26.0" } });
  }, 60_000);

  test("the Knip image check passes in both modes with the checkout's Knip", () => {
    const result = runHelper(helper("check-knip-image.mjs"), [],
      { CHOOM_KNIP_TOOLS: toolsRoot, KNIP_DISABLE_RAW_TRANSFER: "1" });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    const report = JSON.parse(result.stdout) as { knip: string; check: { status: string; runs: { mode: string; exitCode: number }[] } };
    expect(report.knip).toBe("6.44.1");
    expect(report.check.status).toBe("passed");
    expect(report.check.runs.map(({ mode, exitCode }) => [mode, exitCode])).toEqual([["normal", 1], ["production", 1]]);
  }, 60_000);

  test("the inventory view prepares and verifies an inventory-only input copy", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      const { inventory, digest } = savedSnapshot(work, "snapshot-check");
      const view = (operation: string) => runHelper(helper("inventory-view.py"),
        [operation, work, inventory, digest, "snapshot-check", "s4-check"]);
      const prepared = view("prepare");
      expect({ status: prepared.status, stderr: prepared.stderr }).toEqual({ status: 0, stderr: "" });
      expect(JSON.parse(prepared.stdout)).toMatchObject({ status: "verified", operation: "prepare", files: 1,
        viewRoot: join(work, "knip-input-" + digest), reused: false, unindexedInputsAvailable: false });
      expect(readFileSync(join(work, "knip-input-" + digest, "app.ts"), "utf8")).toBe("export const value = 1;\n");
      const verified = view("verify");
      expect({ status: verified.status, stderr: verified.stderr }).toEqual({ status: 0, stderr: "" });
      expect(JSON.parse(verified.stdout)).toMatchObject({ status: "verified", operation: "verify", files: 1 });
    });
  });

  test("the recovery check verifies retained inputs with the Stage 1 cookbook and writes nothing", () => {
    withScratch((scratch) => {
      const previous = join(scratch, "previous");
      const { digest } = savedSnapshot(previous, "snapshot-old");
      writeFileSync(join(previous, "exclusions.txt"), "node_modules\n");
      writeFileSync(join(previous, "run.yaml"), stringify({ formatVersion: 1, id: "run-old", mode: "A",
        snapshot: { id: "snapshot-old", root: "snapshot", inventoryRef: "inventory-001", exclusions: "exclusions.txt" },
        artifacts: { "inventory-001": { path: "evidence/inventory.json", sha256: digest },
          "exclusions-001": { path: "exclusions.txt", sha256: sha256("node_modules\n") } } }));
      const recovered = join(scratch, "recovered");
      const result = runHelper(helper("recover-capture.ts"), ["--check"], { CHOOM_TOOLS: toolsRoot,
        CHOOM_PREVIOUS_WORK: previous, CHOOM_WORK: recovered, CHOOM_RUN_ID: "run-new", CHOOM_SNAPSHOT_ID: "snapshot-new" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "retained-inputs-verified", runRef: "run-new",
        retained: { files: 1 }, omittedFiles: 0, writes: false, stage1Review: "pending" });
      expect(existsSync(recovered)).toBe(false);
    });
  });

  test("the duplication command starts an assessment and pins the duplication helpers", async () => {
    const { fixtureRun } = (await import(duplicationModule.href)) as DuplicationModule;
    const fixture = fixtureRun();
    try {
      const result = runHelper(helper("duplication-commands.mjs"), ["start", fixture.work, fixture.output, "dup-check"]);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(JSON.parse(result.stdout)).toEqual({ status: "started", output: fixture.output, id: "dup-check" });
      const manifest = parse(readFileSync(join(fixture.output, "assessment.yaml"), "utf8")) as
        { status: string; tools: { helpers: object; sharedSources: object } };
      expect(manifest.status).toBe("started");
      expect(Object.keys(manifest.tools.helpers)).toEqual(["duplication-commands.mjs", "duplication-detector.mjs",
        "duplication-edn.mjs", "duplication-files.mjs", "duplication-review.mjs"]);
      expect(Object.keys(manifest.tools.sharedSources).filter((path) => path.endsWith("/run-layout.mjs"))).toHaveLength(1);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
