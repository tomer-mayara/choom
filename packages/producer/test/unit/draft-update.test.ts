import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { draftUpdate, type DraftUpdate } from "../../src/draft-update.ts";

// The update of the working drafts that Stages 2 to 5 share: temporary files first,
// then the drafts one by one with run.yaml, the publication marker, last, and a
// rollback when a step fails before run.yaml is replaced.
const advice = "Use a new attempt.";
const oldDrafts: [string, string][] = [["run.yaml", "run: old\n"], ["discovery.yaml", "discovery: old\n"],
  ["baseline.yaml", "baseline: old\n"]];
const before = new Map(oldDrafts.map(([name, text]): [string, Buffer] => [name, Buffer.from(text)]));
let work = "";

beforeEach(() => {
  work = mkdtempSync(join(realpathSync(tmpdir()), "choom-draft-update-"));
  for (const [name, bytes] of before) writeFileSync(join(work, name), bytes);
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

const text = (name: string): string => readFileSync(join(work, name), "utf8");
const files = (): string[] => readdirSync(work).sort();

// An update of discovery.yaml and run.yaml. `read` can fail or change a file at a named read.
function update(read: (name: string) => Buffer = (name) => readFileSync(join(work, name))): DraftUpdate {
  const drafts = draftUpdate({ work, prefix: ".s2-check-publication-", before, read, advice });
  drafts.stage("discovery.yaml", Buffer.from("discovery: new\n"));
  drafts.stage("run.yaml", Buffer.from("run: new\n"));
  return drafts;
}

describe("draftUpdate", () => {
  test("replaces the staged drafts in order, run.yaml last, and leaves no temporary file", () => {
    const drafts = update();
    expect(files()).toEqual([".s2-check-publication-discovery.yaml", ".s2-check-publication-run.yaml", "baseline.yaml",
      "discovery.yaml", "run.yaml"]);
    drafts.place();
    expect([text("discovery.yaml"), text("run.yaml"), text("baseline.yaml")]).toEqual(["discovery: new\n", "run: new\n", "baseline: old\n"]);
    expect(files()).toEqual(["baseline.yaml", "discovery.yaml", "run.yaml"]);
  });

  test("restores a replaced draft and removes the temporary files when a check fails before run.yaml is replaced", () => {
    // Another writer changes baseline.yaml after discovery.yaml was replaced, before run.yaml.
    const drafts = update((name) => {
      if (name === ".s2-check-publication-run.yaml") writeFileSync(join(work, "baseline.yaml"), "baseline: other\n");
      return readFileSync(join(work, name));
    });
    let failure: Error | undefined;
    try { drafts.place(); } catch (error) { failure = drafts.rollBack(error as Error); }
    expect(failure?.message).toBe("Working draft changed: baseline.yaml " + advice);
    expect([text("discovery.yaml"), text("run.yaml"), text("baseline.yaml")])
      .toEqual(["discovery: old\n", "run: old\n", "baseline: other\n"]);
    expect(files()).toEqual(["baseline.yaml", "discovery.yaml", "run.yaml"]);
  });

  test("keeps a replaced draft that another writer changed, and names it", () => {
    // Another writer changes discovery.yaml after the update replaced it, before run.yaml.
    const drafts = update((name) => {
      if (name === ".s2-check-publication-run.yaml") writeFileSync(join(work, "discovery.yaml"), "discovery: other\n");
      return readFileSync(join(work, name));
    });
    let failure: Error | undefined;
    try { drafts.place(); } catch (error) { failure = drafts.rollBack(error as Error); }
    expect(failure?.message).toBe(`Published output changed: discovery.yaml ${advice} Inspect retained paths: discovery.yaml`);
    expect([text("discovery.yaml"), text("run.yaml")]).toEqual(["discovery: other\n", "run: old\n"]);
    expect(files()).toEqual(["baseline.yaml", "discovery.yaml", "run.yaml"]);
  });

  test("refuses to stage run.yaml before another draft, or a draft that it does not hold", () => {
    const drafts = draftUpdate({ work, prefix: ".s2-check-publication-", before, read: (name) => readFileSync(join(work, name)), advice });
    drafts.stage("run.yaml", Buffer.from("run: new\n"));
    expect(() => drafts.stage("discovery.yaml", Buffer.from("discovery: new\n")))
      .toThrow(new Error("Stage each draft once, and run.yaml last: discovery.yaml"));
    expect(() => draftUpdate({ work, prefix: ".x-", before, read: () => Buffer.alloc(0), advice }).stage("notes.md", Buffer.alloc(0)))
      .toThrow(new Error("Stage each draft once, and run.yaml last: notes.md"));
  });
});
