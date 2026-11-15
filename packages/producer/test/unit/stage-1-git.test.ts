import { describe, expect, test } from "bun:test";
import { isDeepStrictEqual } from "node:util";
import { readCaptureExclusions } from "../../src/stage-1-exclusions.ts";
import { type GitCall, type GitIdentityInput, type GitResult, gitIdentity, gitIdentityGaps, type RunGit }
  from "../../src/stage-1-git.ts";

// gitIdentity runs Git through a test double. The double answers only the
// allowed read commands, and only when the call has every safety setting and no
// other GIT_* variable. The object IDs are the IDs that Git gives these contents.
interface Answer { status?: number; stdout?: string; stderr?: string; error?: string }
type Repository = Record<string, Answer>;

const target = "/work/target";
const commit = "414353e00285ad6e784f9ecfabbc25df52f5e8c8";
const sha256Commit = "e99e9d8929e414f70c5574c5aa150e6895b157fab36e99a3d7e2e93fadf86d38";
const blob = { "a\n": "78981922613b2afb6025042ff6bd878ac1994e85", "b\n": "61780798228d17af2d34fce4cfbdf35556832472",
  "c\n": "f2ad6c76f0115a6ba5b00456a849810e7ec0af20" };
const sha256Blob = { "a\n": "f8625e43f9e04f24291f77cdbe4c71b3c2a3b0003f60419b3ed06a058d766c8b" };
const safetyArguments = ["-C", target, "--no-pager", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
const safetyVariables = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "", GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" };
const readCommands = ["version", "rev-parse --is-inside-work-tree --show-prefix", "rev-parse --verify HEAD^{commit}",
  "symbolic-ref -q HEAD"];

// The NUL-terminated output of `git ls-tree -r -z --full-name`.
function tree(...entries: [mode: string, type: string, id: string, path: string][]): string {
  return entries.map(([mode, type, id, path]) => `${mode} ${type} ${id}\t${path}\0`).join("");
}

function repository(change: Repository = {}, head = commit): Repository {
  return { "version": { stdout: "git version 2.43.0\n" },
    "rev-parse --is-inside-work-tree --show-prefix": { stdout: "true\n\n" },
    "rev-parse --verify HEAD^{commit}": { stdout: head + "\n" }, "symbolic-ref -q HEAD": { stdout: "refs/heads/main\n" },
    [`ls-tree -r -z --full-name ${head}`]: { stdout: tree(["100644", "blob", blob["a\n"], "a.txt"]) }, ...change };
}

function gitDouble(answers: Repository): { runGit: RunGit; calls: GitCall[] } {
  const calls: GitCall[] = [];
  const runGit = (call: GitCall): GitResult => {
    calls.push(call);
    const command = call.args.slice(safetyArguments.length).join(" ");
    const variables = Object.fromEntries(Object.entries(call.env).filter(([name]) => name.startsWith("GIT_")));
    if (!isDeepStrictEqual(call.args.slice(0, safetyArguments.length), safetyArguments) ||
      !isDeepStrictEqual(variables, safetyVariables)) throw new Error("Git double: a safety setting is missing.");
    if (!readCommands.includes(command) && !/^ls-tree -r -z --full-name [0-9a-f]{40}([0-9a-f]{24})?$/.test(command))
      throw new Error("Git double: refused command git " + command);
    const answer = answers[command];
    if (answer === undefined) throw new Error("Git double: no answer for git " + command);
    return { status: answer.error ? null : answer.status ?? 0, stdout: Buffer.from(answer.stdout ?? ""),
      stderr: answer.stderr ?? "", error: answer.error ?? null };
  };
  return { runGit, calls };
}

function input(files: Record<string, string>, change: Partial<GitIdentityInput> = {}): GitIdentityInput {
  return { target, environment: { PATH: "/usr/bin", HOME: "/home/operator" },
    snapshot: { snapshotRef: "snapshot-check", paths: Object.keys(files), read: (path) => Buffer.from(files[path] ?? "") },
    exclusions: readCaptureExclusions(".*/\n.git\nnode_modules\n/dist/\n"), ...change };
}

const noChanges = { changed: [], notInCommit: [], notInSnapshot: [], outsideCaptureScope: [], submodules: [] };

describe("the Git identity of a snapshot", () => {
  test("names the commit, the branch and the local changes", () => {
    const { runGit } = gitDouble(repository({ [`ls-tree -r -z --full-name ${commit}`]: { stdout: tree(
      ["100644", "blob", blob["a\n"], "a.txt"], ["100755", "blob", blob["b\n"], "bin/b.sh"],
      ["100644", "blob", blob["c\n"], "c.txt"], ["100644", "blob", blob["c\n"], ".github/ci.yml"],
      ["100644", "blob", blob["c\n"], "dist/app.js"]) } }));
    const record = gitIdentity(runGit, input({ "a.txt": "a\n", "bin/b.sh": "b changed\n", "notes.txt": "new\n" }));
    expect(record).toEqual({ formatVersion: 1, snapshotRef: "snapshot-check", status: "available",
      gitVersion: "git version 2.43.0", commit, objectFormat: "sha1", branch: "main", targetPrefix: "",
      localChanges: { changed: ["bin/b.sh"], notInCommit: ["notes.txt"], notInSnapshot: ["c.txt"],
        outsideCaptureScope: [".github/ci.yml", "dist/app.js"], submodules: [] },
      limits: expect.any(Array), gaps: [] });
  });

  test("has no branch for a detached HEAD", () => {
    const { runGit } = gitDouble(repository({ "symbolic-ref -q HEAD": { status: 1 } }));
    expect(gitIdentity(runGit, input({ "a.txt": "a\n" }))).toMatchObject({ status: "available", branch: null,
      localChanges: noChanges });
  });

  test("compares only the commit files in the target folder, by their path in that folder", () => {
    const { runGit } = gitDouble(repository({ "rev-parse --is-inside-work-tree --show-prefix": { stdout: "true\napp/\n" },
      [`ls-tree -r -z --full-name ${commit}`]: { stdout: tree(["100644", "blob", blob["a\n"], "app/a.txt"],
        ["100644", "blob", blob["b\n"], "app/src/b.ts"]) } }));
    expect(gitIdentity(runGit, input({ "a.txt": "a\n", "src/b.ts": "b\n" }))).toMatchObject({ status: "available",
      targetPrefix: "app/", localChanges: noChanges });
  });

  test("uses SHA-256 object IDs in a SHA-256 repository", () => {
    const { runGit } = gitDouble(repository({ [`ls-tree -r -z --full-name ${sha256Commit}`]:
      { stdout: tree(["100644", "blob", sha256Blob["a\n"], "a.txt"]) } }, sha256Commit));
    expect(gitIdentity(runGit, input({ "a.txt": "a\n" }))).toMatchObject({ status: "available", commit: sha256Commit,
      objectFormat: "sha256", localChanges: noChanges });
  });

  test("lists each submodule and does not compare the files in it", () => {
    const { runGit } = gitDouble(repository({ [`ls-tree -r -z --full-name ${commit}`]: { stdout: tree(
      ["100644", "blob", blob["a\n"], "a.txt"], ["160000", "commit", commit, "lib/vendor"]) } }));
    expect(gitIdentity(runGit, input({ "a.txt": "a\n", "lib/vendor/index.ts": "x\n" }))).toMatchObject({
      localChanges: { ...noChanges, submodules: ["lib/vendor"] } });
  });
});

describe("the limits of the Git identity", () => {
  test("say that the commit files outside the capture scope are not compared", () => {
    const { runGit } = gitDouble(repository());
    const { limits } = gitIdentity(runGit, input({ "a.txt": "a\n" })) as { limits: string[] };
    expect(limits).toContain("The commit files that the capture exclusions leave out are in outsideCaptureScope. " +
      "They are not compared, and they do not count as deleted.");
  });

  test("name a capture exclusion rule that Choom does not read, and keep every missing commit file in notInSnapshot", () => {
    const { runGit } = gitDouble(repository({ [`ls-tree -r -z --full-name ${commit}`]: { stdout: tree(
      ["100644", "blob", blob["a\n"], "a.txt"], ["100644", "blob", blob["c\n"], ".github/ci.yml"]) } }));
    const record = gitIdentity(runGit, input({ "a.txt": "a\n" }, { exclusions: readCaptureExclusions(".*/\n+ keep\n") }));
    expect(record).toMatchObject({ localChanges: { ...noChanges, notInSnapshot: [".github/ci.yml"] } });
    expect((record as { limits: string[] }).limits).toContain("The capture exclusions have a rule that Choom does not " +
      "read: \"+ keep\". So notInSnapshot can list a commit file that the capture exclusions left out, not only a file " +
      "that was deleted in the target folder.");
  });
});

describe("the Git calls of the Git identity", () => {
  test("run only the read commands, each with every safety setting and without the inherited GIT_* variables", () => {
    const { runGit, calls } = gitDouble(repository());
    gitIdentity(runGit, input({ "a.txt": "a\n" }, { environment: { PATH: "/usr/bin", GIT_DIR: "/elsewhere/.git",
      GIT_CONFIG_PARAMETERS: "'core.fsmonitor'='run-me'", GIT_EXEC_PATH: "/elsewhere/libexec" } }));
    expect(calls.map(({ args }) => args.slice(safetyArguments.length).join(" ")))
      .toEqual([...readCommands, `ls-tree -r -z --full-name ${commit}`]);
    for (const { env } of calls) expect(env).toEqual({ PATH: "/usr/bin", ...safetyVariables });
  });

  test("go through a double that refuses git status, another command and a call without a safety setting", () => {
    const { runGit } = gitDouble(repository());
    const call = (args: string[], env: Record<string, string> = safetyVariables): GitCall =>
      ({ args: [...safetyArguments, ...args], env });
    expect(() => runGit(call(["status", "--porcelain=v2"]))).toThrow("Git double: refused command git status --porcelain=v2");
    expect(() => runGit(call(["log", "-1"]))).toThrow("Git double: refused command git log -1");
    expect(() => runGit({ args: ["-C", target, "version"], env: safetyVariables })).toThrow("a safety setting is missing");
    expect(() => runGit(call(["version"], { ...safetyVariables, GIT_ALLOW_PROTOCOL: "file" })))
      .toThrow("a safety setting is missing");
  });
});

const unavailable = "Git evidence is not available, so the commit, the branch and the local changes of the snapshot " +
  "are unknown. ";

describe("a Git identity without Git evidence", () => {
  test("records Git's refusal and a gap, and runs no later command", () => {
    const dubious = "fatal: detected dubious ownership in repository at '/work/target'\n" +
      "To add an exception for this directory, call:\n\n\tgit config --global --add safe.directory /work/target\n";
    const { runGit, calls } = gitDouble(repository({ "rev-parse --is-inside-work-tree --show-prefix":
      { status: 128, stderr: dubious } }));
    const reason = "`git rev-parse --is-inside-work-tree --show-prefix` failed with exit code 128: " + dubious.trim();
    expect(gitIdentity(runGit, input({ "a.txt": "a\n" }))).toEqual({ formatVersion: 1, snapshotRef: "snapshot-check",
      status: "not-available", gitVersion: "git version 2.43.0", reason,
      gaps: [{ kind: "git-unavailable", subjectRefs: ["snapshot-check"], reason: unavailable + reason }] });
    expect(calls).toHaveLength(2);
  });

  test("records that Git did not run", () => {
    const { runGit } = gitDouble(repository({ version: { error: "spawnSync git ENOENT" } }));
    expect(gitIdentity(runGit, input({}))).toMatchObject({ status: "not-available", gitVersion: null,
      reason: "Git did not run `git version`: spawnSync git ENOENT" });
  });

  test("records a target outside a work tree, a HEAD without a commit and an unexpected answer", () => {
    const listing = `ls-tree -r -z --full-name ${commit}`;
    const outside = `100644 blob ${blob["a\n"]}\tother/a.txt`;
    const cases: [Repository, string][] = [
      [{ "rev-parse --is-inside-work-tree --show-prefix": { stdout: "false\n\n" } },
        "The target folder is not in the work tree of a Git repository."],
      [{ "rev-parse --verify HEAD^{commit}": { status: 128, stderr: "fatal: Needed a single revision\n" } },
        "`git rev-parse --verify HEAD^{commit}` failed with exit code 128: fatal: Needed a single revision"],
      [{ "rev-parse --verify HEAD^{commit}": { stdout: "HEAD\n" } }, "Git gave an unexpected commit ID: \"HEAD\""],
      [{ [listing]: { stdout: "100644 blob 7898\ta.txt\0" } },
        "Git gave an unexpected tree entry: " + JSON.stringify("100644 blob 7898\ta.txt")],
      [{ "rev-parse --is-inside-work-tree --show-prefix": { stdout: "true\napp/\n" }, [listing]: { stdout: outside + "\0" } },
        "Git gave an unexpected tree entry: " + JSON.stringify(outside)],
    ];
    for (const [change, reason] of cases) {
      const { runGit } = gitDouble(repository(change));
      expect(gitIdentity(runGit, input({ "a.txt": "a\n" }))).toMatchObject({ status: "not-available", reason });
    }
  });
});

describe("the discovery gaps of the Git identity record", () => {
  const available = gitIdentity(gitDouble(repository()).runGit, input({ "a.txt": "a\n" }));
  const missing = gitIdentity(gitDouble(repository({ version: { error: "spawnSync git ENOENT" } })).runGit, input({}));

  test("are the git-unavailable gap of a record without Git evidence, with a stable ID and the record as evidence", () => {
    expect(gitIdentityGaps(missing, "snapshot-check")).toEqual([{ id: "s1-git-identity-gap-001", kind: "git-unavailable",
      subjectRefs: ["snapshot-check"], reason: unavailable + "Git did not run `git version`: spawnSync git ENOENT",
      evidenceRefs: ["git-identity-001#/gaps/0"] }]);
  });

  test("are none for a record with Git evidence", () => {
    expect(gitIdentityGaps(available, "snapshot-check")).toEqual([]);
  });

  test("are refused for a record that is not valid", () => {
    for (const record of [null, { ...available, formatVersion: 2 }, { ...available, snapshotRef: "snapshot-other" },
      { ...available, status: "unknown" }, { ...available, gaps: missing.gaps }, { ...missing, gaps: [] }])
      expect(() => gitIdentityGaps(record, "snapshot-check"))
        .toThrow(new Error("The Git identity record evidence/git-identity.json is not valid. Start a new run."));
  });
});
