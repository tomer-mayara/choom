import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { withScratch } from "../../support/commands.ts";
import { emptyReference } from "../../support/reference-baseline.ts";
import { newStageOneRun, stageOne } from "../../support/stage-1-run.ts";

test("a new run creates an independent key or reuses an explicitly selected key", () => {
  const keys = [undefined, undefined, "TraceRelic"].map(key => withScratch(scratch => {
    const run = newStageOneRun(scratch);
    if (key !== undefined) run.env.CHOOM_PROJECT_KEY = key;
    expect(stageOne(run, "start")).toMatchObject({ status: 0 });
    return JSON.parse(readFileSync(join(run.work, "evidence/stage1-inputs.json"), "utf8")) as
      { projectKey: string; referenceBaseline: unknown };
  }));
  expect(keys[0]?.projectKey).toMatch(/\S/);
  expect(keys[0]?.projectKey).not.toEqual(keys[1]?.projectKey);
  expect(keys[2]).toMatchObject({ projectKey: "TraceRelic", referenceBaseline: null });
});

test("start refuses conflicting keys, invalid and oversized references before creating the run", () => {
  withScratch(scratch => {
    const run = newStageOneRun(scratch);
    const path = join(scratch, "reference.yaml");
    run.env.CHOOM_REFERENCE_BASELINE = path;
    run.env.CHOOM_PROJECT_KEY = "another";
    for (const [bytes, error] of [
      [stringify(emptyReference("TraceRelic")), "conflicts"],
      [stringify({ formatVersion: 5, id: "old", parentId: null, components: [], interfaces: [], rules: [], resources: [] }), "version 6"],
      ["{invalid: [}\n", "YAML"],
      [" ".repeat(16 * 1024 * 1024 + 1), "16 MiB"],
    ] as const) {
      writeFileSync(path, bytes);
      const result = stageOne(run, "start");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(error);
      expect(existsSync(run.work)).toBe(false);
    }
  });
});

test("start preserves an explicit 4096-byte key and refuses one extra byte before creating a run", () => {
  const key = " " + "é".repeat(2047) + " ";
  expect(Buffer.byteLength(key, "utf8")).toBe(4096);
  withScratch(scratch => {
    const run = newStageOneRun(scratch);
    run.env.CHOOM_PROJECT_KEY = key + "x";
    const refused = stageOne(run, "start");
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("4096 UTF-8 bytes");
    expect(existsSync(run.work)).toBe(false);
    run.env.CHOOM_PROJECT_KEY = key;
    expect(stageOne(run, "start").status).toBe(0);
    const saved = JSON.parse(readFileSync(join(run.work, "evidence/stage1-inputs.json"), "utf8")) as { projectKey: string };
    expect(saved.projectKey).toBe(key);
  });
});
