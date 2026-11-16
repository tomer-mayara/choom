import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkProducerCode, producerCodeDigest, producerReceipt } from "../../src/producer-code.ts";
import { withScratch } from "../support/commands.ts";

// A small tool checkout in a scratch folder: the two code folders that the digest
// covers, the producer package file, and a document outside the code folders.
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const codeFiles: Record<string, string> = {
  "packages/producer/src/cli.ts": "export const cli = 1;\n",
  "packages/producer/src/nested/module.ts": "export const nested = 2;\n",
  "packages/baseline-model/src/baseline.ts": "export const baseline = 3;\n",
};
const otherFiles: Record<string, string> = {
  "packages/producer/package.json": JSON.stringify({ name: "@choom/producer", version: "1.2.3" }),
  "docs/design/app-a/step-1-cookbook.md": "# Stage 1\n",
};
const recordPath = "evidence/producer.json";

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

function toolCheckout(scratch: string, name = "tools"): string {
  const root = join(scratch, name);
  writeFiles(root, { ...codeFiles, ...otherFiles });
  return root;
}

// The record format rule: one "<file SHA-256>  <path>" line for each code file.
function canonicalDigest(lines: [path: string, text: string][]): string {
  return sha256(lines.map(([path, text]) => `${sha256(text)}  ${path}\n`).join(""));
}

// A run folder whose record has the given fields.
function runWithRecord(scratch: string, record: unknown): string {
  const work = join(scratch, "run");
  writeFiles(work, { [recordPath]: typeof record === "string" ? record : JSON.stringify(record) });
  return work;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-c", "user.name=Producer Test", "-c", "user.email=producer@example.com",
    "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function commitAll(root: string): string {
  git(root, "init", "-q");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "Producer test checkout");
  return git(root, "rev-parse", "HEAD");
}

describe("producer code digest", () => {
  test("is the SHA-256 of one line per code file, sorted by path", () => {
    withScratch((scratch) => {
      expect(producerCodeDigest(toolCheckout(scratch))).toBe(canonicalDigest([
        ["packages/baseline-model/src/baseline.ts", "export const baseline = 3;\n"],
        ["packages/producer/src/cli.ts", "export const cli = 1;\n"],
        ["packages/producer/src/nested/module.ts", "export const nested = 2;\n"],
      ]));
    });
  });

  // U+FF5E sorts before U+1F600 by UTF-8 bytes, but after it by UTF-16 code units.
  test("sorts the paths by their UTF-8 bytes", () => {
    withScratch((scratch) => {
      const root = join(scratch, "tools");
      writeFiles(root, { "packages/producer/src/\u{1F600}.ts": "first\n", "packages/producer/src/～.ts": "second\n",
        "packages/baseline-model/src/Z.ts": "third\n" });
      expect(producerCodeDigest(root)).toBe(canonicalDigest([["packages/baseline-model/src/Z.ts", "third\n"],
        ["packages/producer/src/～.ts", "second\n"], ["packages/producer/src/\u{1F600}.ts", "first\n"]]));
    });
  });

  test("stays the same for the same files in another checkout", () => {
    withScratch((scratch) => {
      const first = toolCheckout(scratch, "first");
      expect(producerCodeDigest(first)).toBe(producerCodeDigest(first));
      expect(producerCodeDigest(toolCheckout(scratch, "second"))).toBe(producerCodeDigest(first));
    });
  });

  test.each(["packages/producer/src", "packages/baseline-model/src"])(
    "changes when a file in %s changes, is added or is removed", (folder) => {
      withScratch((scratch) => {
        const root = toolCheckout(scratch);
        const original = producerCodeDigest(root);
        const changed = join(root, folder, "changed.ts");
        writeFileSync(changed, "export const value = 1;\n");
        const added = producerCodeDigest(root);
        appendFileSync(changed, "// A later change.\n");
        const edited = producerCodeDigest(root);
        rmSync(changed);
        expect(producerCodeDigest(root)).toBe(original);
        rmSync(join(root, folder === "packages/producer/src" ? "packages/producer/src/cli.ts" :
          "packages/baseline-model/src/baseline.ts"));
        const removed = producerCodeDigest(root);
        expect(new Set([original, added, edited, removed]).size).toBe(4);
      });
    });

  test("does not change when a file outside the two code folders changes", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      const original = producerCodeDigest(root);
      writeFiles(root, { "packages/producer/package.json": JSON.stringify({ name: "@choom/producer", version: "9.9.9" }),
        "docs/design/app-a/step-1-cookbook.md": "# Changed\n", "packages/producer/test/new.test.ts": "export {};\n" });
      expect(producerCodeDigest(root)).toBe(original);
    });
  });

  test.each([
    ["a symbolic link to a file", "packages/producer/src/link.ts", "cli.ts"],
    ["a symbolic link to a folder", "packages/baseline-model/src/linked", "../../producer/src/nested"],
  ])("refuses %s", (_name, link, target) => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      symlinkSync(target, join(root, link));
      expect(() => producerCodeDigest(root)).toThrow(`The producer code contains an entry that is not a regular file or folder: ${link}`);
    });
  });

  test("refuses a code folder that is missing or is a symbolic link", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      rmSync(join(root, "packages/baseline-model/src"), { recursive: true });
      expect(() => producerCodeDigest(root)).toThrow("The producer code folder is missing or is not a real folder: " +
        "packages/baseline-model/src");
      symlinkSync(join(root, "packages/producer/src"), join(root, "packages/baseline-model/src"));
      expect(() => producerCodeDigest(root)).toThrow("The producer code folder is missing or is not a real folder: " +
        "packages/baseline-model/src");
    });
  });

  test("refuses a file name with a control character, which would break the one-line format", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      writeFileSync(join(root, "packages/producer/src/two\nlines.ts"), "export {};\n");
      expect(() => producerCodeDigest(root)).toThrow("The producer code contains a file name with a control character: " +
        JSON.stringify("packages/producer/src/two\nlines.ts"));
    });
  });
});

describe("producer receipt", () => {
  test("records the package version, the code digest and not-available outside a Git checkout", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      expect(producerReceipt(root)).toEqual({ formatVersion: 1, package: "@choom/producer", version: "1.2.3",
        codeDigest: producerCodeDigest(root), commit: "not-available" });
    });
  });

  test("records the commit of a Git checkout", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      const commit = commitAll(root);
      expect(producerReceipt(root).commit).toBe(commit);
    });
  });

  test("records not-available for a folder inside another Git checkout", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      commitAll(scratch);
      expect(producerReceipt(root).commit).toBe("not-available");
    });
  });

  test("refuses a producer package file without the package name or version", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      writeFiles(root, { "packages/producer/package.json": JSON.stringify({ name: "@choom/other", version: "1.2.3" }) });
      expect(() => producerReceipt(root)).toThrow("Expected the @choom/producer name and version in packages/producer/package.json.");
    });
  });
});

describe("producer code check", () => {
  test("accepts a run whose record has the current code digest", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      const work = runWithRecord(scratch, producerReceipt(root));
      expect(() => checkProducerCode(work, root)).not.toThrow();
    });
  });

  test("refuses a run after the code changed and names the recorded commit and digest", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      const record = producerReceipt(root);
      const work = runWithRecord(scratch, record);
      appendFileSync(join(root, "packages/baseline-model/src/baseline.ts"), "// A later change.\n");
      expect(() => checkProducerCode(work, root)).toThrow(new Error("The producer code changed after this run started. " +
        `This run recorded commit not-available and code digest ${record.codeDigest}. ` +
        "Continue the run with that producer version, or start a new run."));
    });
  });

  test("refuses a run without a record, as a run that started before the record existed", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      const work = join(scratch, "run");
      mkdirSync(join(work, "evidence"), { recursive: true });
      expect(() => checkProducerCode(work, root)).toThrow(new Error(
        "This run has no record of the producer code that started it (evidence/producer.json). Start a new run."));
    });
  });

  const valid = { formatVersion: 1, package: "@choom/producer", version: "1.2.3", codeDigest: "a".repeat(64),
    commit: "not-available" };
  test.each([
    ["text that is not JSON", "{"],
    ["another format version", { ...valid, formatVersion: 2 }],
    ["another package", { ...valid, package: "@choom/other" }],
    ["an empty version", { ...valid, version: "" }],
    ["a short code digest", { ...valid, codeDigest: "a".repeat(63) }],
    ["an empty commit", { ...valid, commit: "" }],
    ["a missing field", { formatVersion: 1, package: "@choom/producer", version: "1.2.3", codeDigest: "a".repeat(64) }],
    ["an extra field", { ...valid, extra: true }],
  ])("refuses a record with %s", (_name, record) => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      expect(() => checkProducerCode(runWithRecord(scratch, record), root)).toThrow(new Error(
        "The record of the producer code (evidence/producer.json) is not valid. Start a new run."));
    });
  });

  test("refuses a record that is a symbolic link", () => {
    withScratch((scratch) => {
      const root = toolCheckout(scratch);
      const work = runWithRecord(scratch, producerReceipt(root));
      writeFiles(scratch, { "elsewhere/producer.json": JSON.stringify(producerReceipt(root)) });
      rmSync(join(work, recordPath));
      symlinkSync(join(scratch, "elsewhere/producer.json"), join(work, recordPath));
      expect(() => checkProducerCode(work, root)).toThrow(new Error(
        "The record of the producer code (evidence/producer.json) is not valid. Start a new run."));
    });
  });
});
