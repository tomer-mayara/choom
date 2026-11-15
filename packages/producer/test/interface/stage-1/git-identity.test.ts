import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type CommandResult, withScratch } from "../../support/commands.ts";
import { commitAll, git } from "../../support/git-repository.ts";
import { type Excerpt, newStageOneRun, noSettingsTarget, reviewPacket, stageOne, type StageOneRun, writeFiles,
  writeReview } from "../../support/stage-1-run.ts";

// Stage 1 capture runs the real Git on a temporary target, and the rsync test
// double copies it. The capture saves the Git identity record and each Git call
// as it saves the rsync calls.
interface GitCallRecord { command: string; args: string[]; environment: Record<string, string>; exitCode: number }
interface SavedRun { artifacts: Record<string, { path: string; sha256: string }> }

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const safetyArguments = (target: string): string[] =>
  ["-C", target, "--no-pager", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
const safetyVariables = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "", GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" };

function readJson<T>(run: StageOneRun, path: string): T {
  return JSON.parse(readFileSync(join(run.work, path), "utf8")) as T;
}

function expectSuccess(result: CommandResult): CommandResult {
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  return result;
}

function capture(run: StageOneRun): CommandResult {
  expectSuccess(stageOne(run, "start"));
  return expectSuccess(stageOne(run, "capture"));
}

// The saved Git call with this number, its standard output and its standard error.
function savedCall(run: StageOneRun, number: number): { record: GitCallRecord; stdout: string; stderr: string } {
  const stem = "evidence/git/call-" + String(number).padStart(3, "0");
  return { record: readJson<GitCallRecord>(run, stem + ".json"), stdout: readFileSync(join(run.work, stem + ".stdout.txt"), "utf8"),
    stderr: readFileSync(join(run.work, stem + ".stderr.txt"), "utf8") };
}

function finishAndVerify(run: StageOneRun): void {
  expectSuccess(stageOne(run, "settings"));
  const excerpt = expectSuccess(stageOne(run, "excerpt", "package.json", "1", "5", "Check the package type."));
  expectSuccess(stageOne(run, "finish", writeReview(run, reviewPacket(JSON.parse(excerpt.stdout) as Excerpt))));
  expectSuccess(stageOne(run, "verify"));
}

describe("Stage 1 capture of a Git repository", () => {
  test("records the commit, the branch and the local changes, saves each Git call, and finish registers them", () => {
    withScratch((scratch) => {
      const run = newStageOneRun(scratch, { ...noSettingsTarget, "old.ts": "export {};\n",
        ".github/workflows/ci.yml": "on: push\n" });
      const commit = commitAll(run.target);
      writeFiles(run.target, { "src/app.ts": "export const message = 'Changed';\n", "notes.md": "# Notes\n" });
      rmSync(join(run.target, "old.ts"));
      expect(capture(run).stdout).toBe("Captured 4 regular files. Atomic capture is not proven.\n" +
        `Git identity recorded: commit ${commit}. See evidence/git-identity.json.\n`);
      expect(readJson(run, "evidence/git-identity.json")).toEqual({ formatVersion: 1, snapshotRef: "snapshot-check",
        status: "available", gitVersion: savedCall(run, 1).stdout.trim(), commit, objectFormat: "sha1", branch: "main",
        targetPrefix: "", localChanges: { changed: ["src/app.ts"], notInCommit: ["notes.md"], notInSnapshot: ["old.ts"],
          outsideCaptureScope: [".github/workflows/ci.yml"], submodules: [] }, limits: expect.any(Array), gaps: [] });
      const commands = [["version"], ["rev-parse", "--is-inside-work-tree", "--show-prefix"],
        ["rev-parse", "--verify", "HEAD^{commit}"], ["symbolic-ref", "-q", "HEAD"], ["ls-tree", "-r", "-z", "--full-name", commit]];
      commands.forEach((command, index) => expect(savedCall(run, index + 1).record).toMatchObject({ command: "git",
        args: [...safetyArguments(run.target), ...command], environment: safetyVariables, exitCode: 0 }));
      expect(existsSync(join(run.work, "evidence/git/call-006.json"))).toBe(false);

      finishAndVerify(run);
      const saved = parse(readFileSync(join(run.work, "run.yaml"), "utf8")) as SavedRun;
      const registered = (path: string): string | undefined =>
        Object.entries(saved.artifacts).find(([, artifact]) => artifact.path === path)?.[0];
      expect(saved.artifacts["git-identity-001"]).toEqual({ path: "evidence/git-identity.json",
        sha256: sha256(readFileSync(join(run.work, "evidence/git-identity.json"))) });
      expect(registered("evidence/git/call-005.stdout.txt")).toBe("s1-file@evidence%2Fgit%2Fcall-005.stdout.txt");
    });
  }, 60_000);

  test("records the folder of a target inside a repository and compares only that folder", () => {
    withScratch((scratch) => {
      const run = newStageOneRun(scratch, noSettingsTarget);
      // The repository is the scratch folder, so the target is its folder target/.
      const commit = commitAll(scratch);
      writeFiles(run.target, { "src/app.ts": "export const message = 'Changed';\n" });
      capture(run);
      expect(readJson(run, "evidence/git-identity.json")).toMatchObject({ status: "available", commit, targetPrefix: "target/",
        localChanges: { changed: ["src/app.ts"], notInCommit: [], notInSnapshot: [], outsideCaptureScope: [], submodules: [] } });
    });
  }, 60_000);
});

describe("Stage 1 capture without Git evidence", () => {
  test("captures a folder that is not a Git repository, with Git's message and a gap", () => {
    withScratch((scratch) => {
      const run = newStageOneRun(scratch, noSettingsTarget);
      expect(capture(run).stdout).toBe("Captured 3 regular files. Atomic capture is not proven.\n" +
        "Git evidence is not available. See evidence/git-identity.json.\n");
      const refusal = savedCall(run, 2);
      expect(refusal.record.exitCode).toBe(128);
      const reason = "`git rev-parse --is-inside-work-tree --show-prefix` failed with exit code 128: " + refusal.stderr.trim();
      expect(readJson(run, "evidence/git-identity.json")).toEqual({ formatVersion: 1, snapshotRef: "snapshot-check",
        status: "not-available", gitVersion: savedCall(run, 1).stdout.trim(), reason, gaps: [{ kind: "git-unavailable",
          subjectRefs: ["snapshot-check"], reason: "Git evidence is not available, so the commit, the branch and the " +
            "local changes of the snapshot are unknown. " + reason }] });
    });
  }, 60_000);

  // Without the transport settings, ls-tree in this partial clone fetches the
  // missing tree, and the fetch runs the upload-pack command of the target settings.
  test("runs no program from the Git settings of the target, also when a partial clone misses a tree", () => {
    withScratch((scratch) => {
      const server = join(scratch, "server");
      writeFiles(server, { "src/app.ts": "export const value = 1;\n" });
      commitAll(server);
      git(server, "config", "uploadpack.allowFilter", "true");
      const run = newStageOneRun(scratch, {});
      git(scratch, "clone", "-q", "--no-checkout", "--filter=tree:0", "file://" + server, run.target);
      const marker = join(scratch, "marker");
      git(run.target, "config", "remote.origin.uploadpack", `touch '${marker}.fetch'; git-upload-pack`);
      git(run.target, "config", "core.fsmonitor", `touch '${marker}.fsmonitor'; true`);
      git(run.target, "config", "core.pager", `touch '${marker}.pager'; cat`);
      writeFiles(run.target, { "notes.md": "# Notes\n" });
      capture(run);
      expect(["fetch", "fsmonitor", "pager"].filter((name) => existsSync(`${marker}.${name}`))).toEqual([]);
      const listing = savedCall(run, 5);
      expect(listing.record.args.at(-1)).toBe(git(run.target, "rev-parse", "HEAD").trim());
      expect(readJson(run, "evidence/git-identity.json")).toMatchObject({ status: "not-available",
        reason: `\`git ls-tree -r -z --full-name ${String(listing.record.args.at(-1))}\` failed with exit code ` +
          `${listing.record.exitCode}: ${listing.stderr.trim()}` });
    });
  }, 60_000);
});
