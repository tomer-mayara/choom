import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCompletedRun, readRegisteredFile } from "../../src/completed-run.ts";
import { withScratch } from "../support/commands.ts";
import { smallRunBaselinePath, writeSmallCompletedRun } from "../support/completed-run.ts";

// A run that Stage 6 completed, as the baseline decide command reads it: run.yaml
// selects the published baseline, and its registry gives each saved file with its SHA-256.
const baselineText = "formatVersion: 1\nid: baseline-check\n";
const notesPath = "evidence/notes.json";
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const noBaseline = "The run has no published baseline. Record decisions after Stage 6 publishes the baseline of the run.";

function smallRun(scratch: string, manifest: Record<string, unknown> = {}): string {
  const work = join(scratch, "run");
  writeSmallCompletedRun(work, [{ path: smallRunBaselinePath, text: baselineText }, { path: notesPath, text: "{}\n" }], manifest);
  return work;
}

describe("a completed run", () => {
  test("names its published baseline and its registered files", () => {
    withScratch((scratch) => {
      const work = smallRun(scratch);
      const run = readCompletedRun(work);
      expect(run.folder).toBe(realpathSync(work));
      expect(run.baseline).toEqual({ ref: "baseline-check", path: smallRunBaselinePath, sha256: sha256(baselineText) });
      expect(run.files.map(({ path }) => path)).toEqual([smallRunBaselinePath, notesPath]);
      expect(readRegisteredFile(run, run.baseline, 1024).toString("utf8")).toBe(baselineText);
    });
  });

  test("refuses a folder without run.yaml", () => {
    withScratch((scratch) => {
      expect(() => readCompletedRun(scratch)).toThrow(new Error(`The folder ${realpathSync(scratch)} has no run.yaml. ` +
        "Give the folder of a run that Stage 6 completed."));
    });
  });

  test.each<[string, Record<string, unknown>]>([
    ["a run that is in progress", { status: "in-progress" }],
    ["a run whose baseline recovery is pending", { progress: { inventory: "complete", baselineRecovery: "pending" } }],
    ["a run without a baseline reference", { baselineRef: undefined }],
    ["a manifest of another format version", { formatVersion: 2 }],
  ])("refuses %s", (_name, manifest) => {
    withScratch((scratch) => {
      expect(() => readCompletedRun(smallRun(scratch, manifest))).toThrow(new Error(noBaseline));
    });
  });

  test("refuses a registry without the published baseline at its path", () => {
    withScratch((scratch) => {
      expect(() => readCompletedRun(smallRun(scratch, { baselineRef: "baseline-other" }))).toThrow(new Error(
        "run.yaml does not register the published baseline baselines/baseline-other/baseline.yaml."));
    });
  });

  test.each(["../outside.json", "/etc/hosts", "evidence/../run.yaml", "evidence\\notes.json", "evidence//notes.json", ""])(
    "refuses a registered path that is not a plain path in the run folder: %p", (path) => {
      withScratch((scratch) => {
        const artifacts = { "baseline-check": { path: smallRunBaselinePath, sha256: sha256(baselineText) },
          other: { path, sha256: sha256("{}\n") } };
        expect(() => readCompletedRun(smallRun(scratch, { artifacts }))).toThrow(new Error(
          "The artifact registry of run.yaml has an invalid entry: other."));
      });
    });
});

describe("a registered file", () => {
  function notes(work: string) {
    const run = readCompletedRun(work);
    const file = run.files.find(({ path }) => path === notesPath);
    if (file === undefined) throw new Error("The small run registers the notes.");
    return { run, file };
  }

  test("is refused when it changed after it was saved", () => {
    withScratch((scratch) => {
      const work = smallRun(scratch);
      appendFileSync(join(work, notesPath), "\n");
      const { run, file } = notes(work);
      expect(() => readRegisteredFile(run, file, 1024)).toThrow(new Error(
        `The registered file ${notesPath} changed after it was saved: its SHA-256 is not the one in run.yaml.`));
    });
  });

  test.each(["missing", "a symbolic link"])("is refused when it is %s", (kind) => {
    withScratch((scratch) => {
      const work = smallRun(scratch);
      rmSync(join(work, notesPath));
      if (kind !== "missing") {
        writeFileSync(join(scratch, "elsewhere.json"), "{}\n");
        symlinkSync(join(scratch, "elsewhere.json"), join(work, notesPath));
      }
      const { run, file } = notes(work);
      expect(() => readRegisteredFile(run, file, 1024)).toThrow(new Error(
        `The registered file ${notesPath} is missing or is not a regular file in the run folder.`));
    });
  });

  test("is refused when it is larger than the read limit", () => {
    withScratch((scratch) => {
      const { run, file } = notes(smallRun(scratch));
      expect(() => readRegisteredFile(run, file, 2)).toThrow(new Error(
        `The registered file ${notesPath} is larger than the read limit of 2 bytes.`));
    });
  });
});
