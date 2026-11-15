import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { producerReceipt } from "../../src/producer-code.ts";
import { producerDocuments, producerSource, runHelper, toolsRoot, withScratch } from "../support/commands.ts";
import { stagedRun, stagedSnapshotRef as snapshotRef } from "../support/staged-run.ts";

// A stage start saves copies of the documents that the stage follows, as records,
// under fixed names. It saves no producer code: every action runs the code in the
// tool checkout after the producer code check. Each case states where every saved
// name comes from in the tool checkout.
type SourceMap = Record<string, string>;

interface ProducerFixture { root: string; work: string; review: string }
interface FixtureModule { producerFixture(): ProducerFixture }
interface Receipt { digests: Record<string, string> }

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const code = (name: string): string => join(producerSource, name);
const producerCode = (name: unknown): boolean => /\.(?:m?ts|mjs|py)$/.test(String(name));
const documents = (name: string): string => join(producerDocuments, name);
// The fixture is JavaScript. This local type states only what these tests use.
const fixtureModule = new URL("../fixtures/entry-points/producer.mjs", import.meta.url);

function expectCopies(folder: string, sources: SourceMap): void {
  for (const [saved, source] of Object.entries(sources))
    expect({ saved, matches: readFileSync(join(folder, saved)).equals(readFileSync(source)) }).toEqual({ saved, matches: true });
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

describe("stage starts save their documents and no producer code", () => {
  test("Stage 1 saves its cookbook and the producer code record, and no producer code", () => {
    withScratch((scratch) => {
      const target = join(scratch, "target");
      const work = join(scratch, "run");
      mkdirSync(target);
      writeFileSync(join(target, "app.ts"), "export const value = 1;\n");
      const result = runHelper(code("stage-1-commands.ts"), ["start"], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work,
        CHOOM_TARGET: target, CHOOM_RUN_ID: "run-check", CHOOM_SNAPSHOT_ID: snapshotRef, CHOOM_BASELINE_ID: "baseline-check" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toBe("Working folder prepared. Review exclusions.txt and scope-notes.md before capture.\n");
      expectCopies(join(work, "evidence"), { "cookbook.md": documents("step-1-cookbook.md") });
      expect(readdirSync(work, { recursive: true }).filter(producerCode)).toEqual([]);
      expect(json(join(work, "evidence/producer.json"))).toEqual(producerReceipt(toolsRoot));
      expect(json(join(work, "evidence/stage1-inputs.json"))).toMatchObject({ tools: toolsRoot, target, workLayout: "separate" });
      expect(Object.keys(json(join(work, "evidence/tools.json")) as object)).toEqual(["node", "tsMorph", "typescript", "yaml"]);
    });
  });

  test("Stage 2 saves its cookbook and no producer code", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 1);
      const result = runHelper(code("stage-2-commands.ts"), ["start"],
        { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE2_ID: "s2-new" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toContain("Prepared the attempt.");
      const attempt = join(work, "evidence/s2-new");
      expectCopies(attempt, { "cookbook.md": documents("step-2-cookbook.md") });
      expect(readdirSync(attempt).filter(producerCode)).toEqual([]);
      const digests = Object.keys((json(join(attempt, "operator-start.json")) as Receipt).digests);
      expect({ cookbook: digests.includes("cookbook.md"), code: digests.filter(producerCode) }).toEqual({ cookbook: true, code: [] });
    });
  });

  test("Stage 3 saves its cookbook", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 2);
      const result = runHelper(code("stage-3-commands.mjs"), ["start"],
        { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE3_ID: "s3-new" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toContain(`Saved s3-new for ${snapshotRef}.`);
      const attempt = join(work, "evidence/s3-new");
      const sources = { "step-3-cookbook.md": documents("step-3-cookbook.md") };
      expectCopies(attempt, sources);
      expect(readdirSync(attempt).filter(producerCode)).toEqual([]);
      expect(Object.keys((json(join(attempt, "handoff.json")) as { toolInputDigests: object }).toolInputDigests))
        .toEqual(Object.keys(sources));
    });
  });

  test("Stage 4 saves its cookbook and the record format, and the Stage 4/5 publisher accepts them", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stagedRun(work, 3);
      const settings = { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: "s4-new" };
      const result = runHelper(code("stage-4-commands.mjs"), ["start"], settings);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      expect(result.stdout).toStartWith("Prepared s4-new: ");
      const attempt = join(work, "evidence/s4-new");
      const sources = { "step-4-cookbook.md": documents("step-4-cookbook.md"), "record-format.md": documents("record-format.md") };
      expectCopies(attempt, sources);
      expect(readdirSync(attempt).filter(producerCode)).toEqual([]);
      expect(Object.keys((json(join(attempt, "handoff.json")) as { toolInputDigests: object }).toolInputDigests))
        .toEqual(Object.keys(sources));
      const review = join(scratch, "review");
      mkdirSync(review);
      const publisher = runHelper(code("stage-4-5-publish.mjs"), ["check", "4", review], { ...settings, CHOOM_STAGE4: attempt });
      expect(publisher.status).toBe(1);
      expect(publisher.stderr).toBe("Missing attempt file: operator-toolchain.json\n");
    });
  });

  test("Stage 6 saves its cookbook", async () => {
    const { producerFixture } = (await import(fixtureModule.href)) as FixtureModule;
    const fixture = producerFixture();
    try {
      const attempt = join(fixture.work, "evidence/s6-new");
      const result = runHelper(code("stage-6-commands.mjs"), ["start", fixture.review], { CHOOM_TOOLS: toolsRoot,
        CHOOM_WORK: fixture.work, CHOOM_STAGE6_ID: "s6-new", CHOOM_STAGE6: attempt });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      const sources = { "step-6-cookbook.md": documents("step-6-cookbook.md") };
      expectCopies(attempt, sources);
      expect(readdirSync(attempt).filter(producerCode)).toEqual([]);
      expect((json(join(attempt, "handoff.json")) as { toolInputDigests: object }).toolInputDigests)
        .toEqual(Object.fromEntries(Object.entries(sources).map(([name, path]) => [name, sha256(readFileSync(path))])));
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
