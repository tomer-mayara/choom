import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { saveVersionFolder } from "../../src/version-folder.ts";
import { withScratch } from "../support/commands.ts";

// Saving the files of a new baseline version as one folder of the run, all or
// nothing. Each test uses a run folder whose baselines folder holds one earlier
// version. A test write function stands in for a write that fails.
const id = "baseline-001-decisions-001";
const files = [{ name: "baseline.yaml", bytes: Buffer.from(`id: ${id}\nparentId: baseline-001\n`) },
  { name: "version.json", bytes: Buffer.from('{ "formatVersion": 1 }\n') }];
const savedAlready = `The baseline version ${id} is saved already: baselines/${id}. A saved version does not change. ` +
  "Make another version from a new decision record.";

function runFolder(scratch: string): string {
  const run = join(scratch, "run");
  mkdirSync(join(run, "baselines", "baseline-001"), { recursive: true });
  return run;
}

const baselineFolders = (run: string): string[] => readdirSync(join(run, "baselines")).sort();
const savedFiles = (run: string): Buffer[] => files.map(({ name }) => readFileSync(join(run, "baselines", id, name)));

// A write function that saves the files that `write` gives, and records each path.
function recordedWrites(write: (index: number, bytes: Buffer) => Buffer | undefined): { paths: string[]; write(path: string, bytes: Buffer): void } {
  const paths: string[] = [];
  return { paths, write(path, bytes) {
    const saved = write(paths.length, bytes);
    paths.push(path);
    if (saved === undefined) throw new Error("No space left on the device.");
    writeFileSync(path, saved, { flag: "wx" });
  } };
}

describe("saving a version folder", () => {
  test("saves every file in baselines/<id>, and leaves no other folder", () => {
    withScratch((scratch) => {
      const run = runFolder(scratch);
      saveVersionFolder(run, id, files);
      expect(baselineFolders(run)).toEqual(["baseline-001", id]);
      expect(readdirSync(join(run, "baselines", id)).sort()).toEqual(["baseline.yaml", "version.json"]);
      expect(savedFiles(run)).toEqual(files.map(({ bytes }) => bytes));
    });
  });

  test("leaves nothing when the second write fails, and a later save works", () => {
    withScratch((scratch) => {
      const run = runFolder(scratch);
      const failSecond = recordedWrites((index, bytes) => (index === 0 ? bytes : undefined));
      let failure: unknown;
      try {
        saveVersionFolder(run, id, files, failSecond.write);
      } catch (error) {
        failure = error;
      }
      expect(baselineFolders(run)).toEqual(["baseline-001"]);
      saveVersionFolder(run, id, files);
      expect(savedFiles(run)).toEqual(files.map(({ bytes }) => bytes));
      expect(failure).toEqual(new Error(`Cannot make the folder baselines/${id}: No space left on the device.`));
      // The files go into a temporary folder in baselines/ whose name cannot be a baseline ID.
      expect(failSecond.paths.map((path) => dirname(dirname(path)))).toEqual([join(run, "baselines"), join(run, "baselines")]);
      expect(basename(dirname(failSecond.paths[0] ?? ""))).toMatch(/^\.next-/);
    });
  });

  test("leaves nothing when a saved file reads back with other bytes", () => {
    withScratch((scratch) => {
      const run = runFolder(scratch);
      const changeSecond = recordedWrites((index, bytes) => (index === 0 ? bytes : Buffer.from("other")));
      expect(() => saveVersionFolder(run, id, files, changeSecond.write)).toThrow(new Error(
        `Cannot make the folder baselines/${id}: The saved file changed while it was saved: baselines/${id}/version.json`));
      expect(baselineFolders(run)).toEqual(["baseline-001"]);
    });
  });

  test("refuses a version folder that exists, and writes nothing", () => {
    withScratch((scratch) => {
      const run = runFolder(scratch);
      mkdirSync(join(run, "baselines", id));
      writeFileSync(join(run, "baselines", id, "baseline.yaml"), "kept\n");
      const writes = recordedWrites((_index, bytes) => bytes);
      expect(() => saveVersionFolder(run, id, files, writes.write)).toThrow(new Error(savedAlready));
      expect(writes.paths).toEqual([]);
      expect(baselineFolders(run)).toEqual(["baseline-001", id]);
      expect(readFileSync(join(run, "baselines", id, "baseline.yaml"), "utf8")).toBe("kept\n");
    });
  });
});
