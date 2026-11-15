import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { producerDocuments, producerSource, runHelper, toolsRoot, withScratch } from "../../support/producer-commands.ts";

// A stage start saves copies of the files it uses in the run, under fixed names.
// Each case states where every saved name comes from in the tool checkout.
type SourceMap = Record<string, string>;

interface ProducerFixture { root: string; work: string; review: string }
interface FixtureModule { producerFixture(): ProducerFixture }
interface Receipt { digests: Record<string, string> }

const snapshotRef = "snapshot-check";
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const code = (name: string): string => join(producerSource, name);
const documents = (name: string): string => join(producerDocuments, name);
// The fixture is JavaScript. This local type states only what these tests use.
const fixtureModule = new URL("../../fixtures/entry-points/producer.mjs", import.meta.url);

function expectCopies(folder: string, sources: SourceMap): void {
  for (const [saved, source] of Object.entries(sources))
    expect({ saved, matches: readFileSync(join(folder, saved)).equals(readFileSync(source)) }).toEqual({ saved, matches: true });
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

// Writes the drafts and registered records that a run has after Stage 1, 2 or 3.
// Each stage start checks only part of them; the values are the smallest that pass.
function stagedRun(work: string, finishedStage: 1 | 2 | 3): void {
  const artifacts: Record<string, { path: string; sha256: string }> = {};
  function save(path: string, text: string, ref?: string): void {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), text);
    if (ref) artifacts[ref] = { path, sha256: sha256(text) };
  }
  const source = "export const value = 1;\n";
  save("snapshot/app.ts", source);
  const files = [{ path: "app.ts", kind: "file", bytes: Buffer.byteLength(source), sha256: sha256(source) }];
  const inventory = JSON.stringify({ formatVersion: 1, snapshotId: snapshotRef, files }, null, 2) + "\n";
  save("evidence/inventory.json", inventory, "inventory-001");
  save("inventory.mjs", `process.stdout.write(${JSON.stringify(inventory)});\n`, "s1-file@inventory.mjs");
  const progress: Record<string, string> = { inventory: "complete", baselineRecovery: "pending" };
  const discovery: Record<string, unknown> = { formatVersion: 1, kind: "architecture-discovery", runRef: "run-check",
    questions: [], gaps: [] };
  if (finishedStage >= 2) {
    save("evidence/s2-check/entry-plan.json", JSON.stringify({ formatVersion: 1, snapshotRef,
      workspaces: [{ dir: ".", entry: ["app.ts"] }] }), "s2-check-entry-plan");
    save("evidence/s2-check/knip-runs.json", JSON.stringify({ formatVersion: 1, snapshotRef, runs: [] }), "s2-check-knip-runs");
    const analysis = { formatVersion: 1, kind: "entry-analysis", snapshotRef, planRef: "s2-check-entry-plan",
      knipRunsRef: "s2-check-knip-runs" };
    save("evidence/s2-check/entry-analysis.yaml", stringify(analysis), "s2-check-entry-analysis");
    Object.assign(progress, { entryAnalysis: "complete" });
    discovery.entryAnalysisRef = "s2-check-entry-analysis";
    if (finishedStage === 3) {
      save("evidence/settings.json", JSON.stringify({ formatVersion: 1, snapshotId: snapshotRef, configs: [], packages: [] }),
        "settings-001");
      save("evidence/s3-check/loading-search.json", JSON.stringify({ snapshotRef, status: "completed",
        scope: [{ path: "app.ts", sha256: files[0]?.sha256 }] }), "s3-check-file@loading-search.json");
      save("evidence/s3-check/entry-analysis.yaml", stringify({ ...analysis, knipAssessment: { action: "reuse" },
        inspectionPriorities: [{ id: "first", priority: 1 }] }), "s3-check-entry-analysis");
      Object.assign(progress, { inspectionPriorities: "complete" });
      discovery.entryAnalysisRef = "s3-check-entry-analysis";
    }
  }
  save("run.yaml", stringify({ formatVersion: 1, id: "run-check", mode: "A", status: "in-progress", progress,
    snapshot: { id: snapshotRef, root: "snapshot", inventoryRef: "inventory-001" }, artifacts }));
  save("discovery.yaml", stringify(discovery));
  save("baseline.yaml", stringify({ formatVersion: 1, id: "baseline-check", parentId: null,
    components: [], interfaces: [], resources: [], rules: [] }));
}

describe("stage starts save their source copies", () => {
  test("Stage 1 saves its helper, the run layout and its cookbook", () => {
    withScratch((scratch) => {
      const target = join(scratch, "target");
      const work = join(scratch, "run");
      mkdirSync(target);
      writeFileSync(join(target, "app.ts"), "export const value = 1;\n");
      const result = runHelper(code("stage-1-commands.mjs"), ["start"], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work,
        CHOOM_TARGET: target, CHOOM_RUN_ID: "run-check", CHOOM_SNAPSHOT_ID: snapshotRef, CHOOM_BASELINE_ID: "baseline-check" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toBe("Working folder prepared. Review exclusions.txt and scope-notes.md before capture.\n");
      expectCopies(join(work, "evidence"), { "stage-1-commands.mjs": code("stage-1-commands.mjs"),
        "run-layout.mjs": code("run-layout.mjs"), "cookbook.md": documents("step-1-cookbook.md") });
      expect(json(join(work, "evidence/stage1-inputs.json"))).toMatchObject({ tools: toolsRoot, target, workLayout: "separate" });
      expect(Object.keys(json(join(work, "evidence/tools.json")) as object)).toEqual(["node", "tsMorph", "typescript", "yaml"]);
    });
  });

  test("Stage 2 saves its cookbook, driver and helper copies", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 1);
      const result = runHelper(code("stage-2-commands.mjs"), ["start"],
        { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE2_ID: "s2-new" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toContain("Prepared the attempt.");
      const attempt = join(work, "evidence/s2-new");
      const sources = { "cookbook.md": documents("step-2-cookbook.md"), "stage-2-commands.mjs": code("stage-2-commands.mjs"),
        "check-knip-image.mjs": code("check-knip-image.mjs"), "inventory-view.py": code("inventory-view.py") };
      expectCopies(attempt, sources);
      expect(Object.keys((json(join(attempt, "operator-start.json")) as Receipt).digests)).toEqual(
        expect.arrayContaining(Object.keys(sources)));
    });
  });

  test("Stage 3 saves its helper, finalizer and cookbook", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 2);
      const result = runHelper(code("stage-3-commands.mjs"), ["start"],
        { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE3_ID: "s3-new" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toContain(`Saved s3-new for ${snapshotRef}.`);
      const attempt = join(work, "evidence/s3-new");
      const sources = { "stage-3-commands.mjs": code("stage-3-commands.mjs"), "stage-3-finish.mjs": code("stage-3-finish.mjs"),
        "step-3-cookbook.md": documents("step-3-cookbook.md") };
      expectCopies(attempt, sources);
      expect(Object.keys((json(join(attempt, "handoff.json")) as { toolInputDigests: object }).toolInputDigests))
        .toEqual(Object.keys(sources));
    });
  });

  test("Stage 4 freezes nine tool files, and the Stage 4/5 publisher accepts the same sources", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 3);
      const settings = { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: "s4-new" };
      const result = runHelper(code("stage-4-commands.mjs"), ["start"], settings);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toStartWith("Prepared s4-new: ");
      const attempt = join(work, "evidence/s4-new");
      const sources = Object.fromEntries(["stage-4-commands.mjs", "stage-4-graph.mjs", "stage-4-inspect.mjs",
        "step-4-cookbook.md", "inventory-view.py", "stage-4-5-publish.mjs", "stage-6-records.mjs", "record-format.md",
        "run-layout.mjs"].map((name) => [name, name.endsWith(".md") ? documents(name) : code(name)]));
      expectCopies(attempt, sources);
      expect(Object.keys((json(join(attempt, "handoff.json")) as { toolInputDigests: object }).toolInputDigests))
        .toEqual(Object.keys(sources));
      const review = join(scratch, "review");
      mkdirSync(review);
      const publisher = runHelper(code("stage-4-5-publish.mjs"), ["check", "4", review], { ...settings, CHOOM_STAGE4: attempt });
      expect(publisher.status).toBe(1);
      expect(publisher.stderr).toBe("Missing attempt file: operator-toolchain.json\n");
    });
  });

  test("Stage 6 freezes its helper, records module, run layout and cookbook", async () => {
    const { producerFixture } = (await import(fixtureModule.href)) as FixtureModule;
    const fixture = producerFixture();
    try {
      const attempt = join(fixture.work, "evidence/s6-new");
      const result = runHelper(code("stage-6-commands.mjs"), ["start", fixture.review], { CHOOM_TOOLS: toolsRoot,
        CHOOM_WORK: fixture.work, CHOOM_STAGE6_ID: "s6-new", CHOOM_STAGE6: attempt });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      const sources = { "stage-6-commands.mjs": code("stage-6-commands.mjs"), "stage-6-records.mjs": code("stage-6-records.mjs"),
        "run-layout.mjs": code("run-layout.mjs"), "step-6-cookbook.md": documents("step-6-cookbook.md") };
      expectCopies(attempt, sources);
      expect((json(join(attempt, "handoff.json")) as { toolInputDigests: object }).toolInputDigests)
        .toEqual(Object.fromEntries(Object.entries(sources).map(([name, path]) => [name, sha256(readFileSync(path))])));
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
