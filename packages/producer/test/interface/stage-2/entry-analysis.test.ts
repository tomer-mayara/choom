import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { producerSource, withScratch } from "../../support/commands.ts";
import { candidate, finishAttempt, priorQuestion, runAttempt, savedJson, stageOneRun, stageTwoAttempt,
  type JsonRecord } from "../../support/stage-2-attempt.ts";
import { dockerCalls, pathWithDoubles } from "../../support/tool-doubles.ts";

// A complete Stage 2 attempt on a small saved Stage 1 run. The Docker double
// approves the tool image and returns one Knip issue in each mode.
interface Run { mode: string; status: string; args: string[]; containerName: string; report: JsonRecord; cleanup: JsonRecord }
interface KnipRuns { runs: Run[]; inputDigests: JsonRecord; imageId: string; imageFixture: JsonRecord; inputView: JsonRecord;
  dockerEndpoint: JsonRecord; limits: JsonRecord }
interface SavedRun { artifacts: Record<string, { path: string; sha256: string }>; progress: JsonRecord; coverage: JsonRecord }

const id = "s2-check";
const imageId = "sha256:" + "a".repeat(64);
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const dockerfile = "FROM node:24-bookworm-slim\nWORKDIR /opt/choom-tools\n" +
  "RUN npm init -y && npm install --ignore-scripts --save-exact knip@6.44.1\nUSER 65534:65534\nWORKDIR /repo\n";
const containerLimits = ["--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65534:65534",
  "--pids-limit", "128", "--memory", "2g", "--memory-swap", "2g", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777"];

function files(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name))).sort();
}

function knipArgs(run: Run, inputRoot: string, profile: string): string[] {
  return ["--host", "unix:///var/run/docker.sock", "run", "--rm", "--pull=never", "--name", run.containerName,
    "--network", "none", "--read-only", "--cap-drop", "ALL", "--env", "KNIP_DISABLE_RAW_TRANSFER=1",
    "--security-opt", "no-new-privileges", "--user", "65534:65534", "--pids-limit", "128", "--memory", "2g",
    "--memory-swap", "2g", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777",
    "--mount", `type=bind,source=${inputRoot},target=/repo,readonly`,
    "--mount", `type=bind,source=${profile},target=/control/knip.json,readonly`,
    "--workdir", "/repo", "--entrypoint", "node", imageId, "/opt/choom-tools/node_modules/knip/bin/knip.js",
    "--config", "/control/knip.json", "--reporter", "json", "--no-progress", "--no-gitignore",
    ...(run.mode === "production" ? ["--production"] : [])];
}

describe("a Stage 2 attempt with an approved tool image", () => {
  test("prepares the profile, builds and checks the image, runs Knip and publishes the entry analysis", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const log = join(scratch, "docker.log");
      const attempt = stageTwoAttempt(work, id, { PATH: pathWithDoubles(scratch), DOCKER_DOUBLE_LOG: log });
      const results = { ...runAttempt(attempt, scratch), ...finishAttempt(attempt, scratch) };
      expect(Object.fromEntries(Object.entries(results).map(([action, { status, stdout, stderr }]) =>
        [action, { status, stdout, stderr }]))).toEqual({
        start: { status: 0, stderr: "", stdout: "Saved inputs verified and checkpoints saved. Preserved 0 draft registrations.\n" +
          "Prepared the attempt. Collect needed excerpts, then save the LLM plan packet with plan REVIEW_DIR.\n" },
        plan: { status: 0, stderr: "", stdout: "Saved the complete entry plan packet.\n" },
        prepare: { status: 0, stderr: "", stdout: "Profile prepared.\nInventory-only input prepared.\n" },
        toolchain: { status: 0, stderr: "", stdout: JSON.stringify({ status: "approved", imageId, reason: null }, null, 2) + "\n" },
        run: { status: 0, stderr: "", stdout: "normal: completed\nproduction: completed\n" },
        "save-review": { status: 0, stderr: "", stdout: "Saved the complete entry analysis packet.\n" },
        finish: { status: 0, stderr: "", stdout: "Stage 2 drafts updated. Structure and evidence checks passed; " +
          "semantic quality was not verified.\nKeep every attempt file unchanged.\n" },
      });

      // The fixed Knip profile disables all 202 plugins of Knip 6.44.1 and keeps the plan's patterns.
      const profile = savedJson(attempt, "knip-profile.json");
      const preflight = savedJson(attempt, "preflight.json");
      const plugins = preflight.disabledPlugins as string[];
      expect(plugins).toHaveLength(202);
      expect(profile).toEqual({ ...Object.fromEntries(plugins.map((name) => [name, false])), preprocessor: [],
        workspaces: { ".": { entry: ["app.ts!"], project: ["**/*.ts!"] } } });
      const saved = (name: string): Buffer => readFileSync(join(attempt.folder, name));
      const inventory = readFileSync(join(work, "evidence/inventory.json"));
      expect(preflight).toEqual({ formatVersion: 1, snapshotRef: "snapshot-check", knipVersion: "6.44.1",
        planSha256: sha256(saved("entry-plan.json")), profileSha256: sha256(saved("knip-profile.json")),
        inventory: { ref: "inventory-001", path: "evidence/inventory.json", sha256: sha256(inventory) },
        status: "eligible", reasons: [], environment: { KNIP_DISABLE_RAW_TRANSFER: "1" },
        disabledPlugins: plugins, approvedCoreParsers: ["JS/TS", "MDX", "Sass/SCSS", "Less", "Stylus", "TSRX"],
        limits: ["All framework plugins disabled.", "Missing dependencies remain missing.",
          "Explicit workspaces and entries do not replace metadata-discovered workspaces or roots.",
          "Knip reports issues, not its complete root set or reachability."] });
      const inputRoot = join(work, "knip-input-" + sha256(inventory));
      expect(savedJson(attempt, "knip-input.json")).toMatchObject({ status: "verified", operation: "prepare", files: 2,
        viewRoot: inputRoot, reused: false, unindexedInputsAvailable: false });

      // The tool image steps save these records, then the selection approves the checked image.
      expect(files(join(attempt.folder, "toolchain"))).toEqual(["Dockerfile", "build-exit.txt", "build-image-id.txt",
        "build.stderr.txt", "build.stdout.txt", "check-exit.txt", "check.stderr.txt", "docker-version.txt", "image-id.txt",
        "image-inspect-exit.txt", "image-inspect.stderr.txt", "metadata.json"]);
      const toolchain = (name: string): string => saved("toolchain/" + name).toString();
      expect(["Dockerfile", "build-exit.txt", "image-inspect-exit.txt", "check-exit.txt", "image-id.txt", "docker-version.txt",
        "build.stdout.txt", "build.stderr.txt", "check.stderr.txt"].map(toolchain)).toEqual([dockerfile, "0\n", "0\n", "0\n",
        imageId + "\n", "Docker version 0.0.0, build test-double\n", "#1 test double build\n", "", ""]);
      expect(savedJson(attempt, "toolchain-selection.json")).toEqual({ status: "approved", imageId, reason: null });

      // Docker receives exactly these calls. The image check reads the image check helper in the tool checkout.
      const runs = (savedJson(attempt, "knip-runs.json") as unknown as KnipRuns).runs;
      const calls = dockerCalls(log);
      expect(calls.map(({ args }) => args)).toEqual([
        ["--version"],
        ["build", "--progress=plain", "--iidfile", join(attempt.folder, "toolchain/build-image-id.txt"), "-"],
        ["image", "inspect", "--format", "{{.Id}}", "sha256:" + "b".repeat(64)],
        ["run", "--rm", "-i", "--pull=never", "--name", "choom-s2-check-tool-check", "--network", "none", "--read-only",
          "--env", "KNIP_DISABLE_RAW_TRANSFER=1", "--env", "CHOOM_KNIP_IMAGE_ID=" + imageId, ...containerLimits,
          "--entrypoint", "node", imageId, "--input-type=module"],
        ["context", "inspect", "--format", "{\"name\":{{json .Name}},\"endpoint\":{{json .Endpoints.docker.Host}}}"],
        ["--host", "unix:///var/run/docker.sock", "image", "inspect", "--format", "{{.Id}}", imageId],
        ...runs.map((run) => knipArgs(run, inputRoot, join(attempt.folder, "knip-profile.json"))),
      ]);
      expect(calls[1]?.stdin).toBe(dockerfile);
      expect(calls[3]?.stdin).toBe(readFileSync(join(producerSource, "check-knip-image.mjs"), "utf8"));

      const receipt = savedJson(attempt, "knip-runs.json") as unknown as KnipRuns;
      expect(runs.map(({ mode, status, containerName, report, cleanup }) => ({ mode, status, report, cleanup,
        name: containerName.replace(/[a-f0-9]{12}$/, "<random>") }))).toEqual(["normal", "production"].map((mode) => ({
        mode, status: "completed", name: `choom-s2-check-${mode}-<random>`,
        report: { valid: true, issueRecordCount: 1, error: null },
        cleanup: { status: "automatic-requested", reason: "Docker run used --rm." } })));
      expect(receipt.inputDigests).toEqual({ planSha256: preflight.planSha256, preflightSha256: sha256(saved("preflight.json")),
        profileSha256: preflight.profileSha256, inventorySha256: sha256(inventory) });
      expect(receipt.imageFixture).toEqual({ ref: "s2-check-file@toolchain%2Fmetadata.json",
        sha256: sha256(saved("toolchain/metadata.json")), status: "passed" });
      expect(receipt.inputView).toMatchObject({ status: "verified", root: inputRoot, ref: "s2-check-file@knip-input-check.stdout.txt" });
      expect(receipt.dockerEndpoint).toMatchObject({ selector: "current-context", context: "default",
        endpoint: "unix:///var/run/docker.sock" });

      // Finish adds the analysis to the drafts and registers every attempt file.
      expect(parse(readFileSync(join(work, "discovery.yaml"), "utf8"))).toEqual({ formatVersion: 1,
        kind: "architecture-discovery", runRef: "run-check", questions: [priorQuestion],
        gaps: [{ id: "s2-check-gap-001", kind: "tool-outcome", subjectRefs: ["app.ts"], reason: "Knip did not run.",
          evidenceRefs: ["s2-check-knip-runs"] }], entryAnalysisRef: "s2-check-entry-analysis" });
      const run = parse(readFileSync(join(work, "run.yaml"), "utf8")) as SavedRun;
      expect(run.progress).toEqual({ inventory: "complete", baselineRecovery: "pending", entryAnalysis: "complete",
        inspectionPriorities: "pending" });
      expect(run.coverage.inspected).toBe("LLM source inspections are listed in the saved reviews and entry analyses. " +
        "This attempt uses s2-check-entry-analysis#/reviewedFiles. Tool query scopes and limits are in s2-check-knip-runs; " +
        "tool reads do not establish LLM inspection.");
      const core: Record<string, string> = { "entry-plan.json": "entry-plan", "entry-analysis.yaml": "entry-analysis",
        "knip-runs.json": "knip-runs", "knip-profile.json": "knip-profile", "preflight.json": "preflight" };
      const expected = Object.fromEntries(files(attempt.folder).map((name) => [`${id}-${core[name] ?? "file@" + encodeURIComponent(name)}`,
        { path: `evidence/${id}/${name}`, sha256: sha256(saved(name)) }]));
      expect(Object.fromEntries(Object.entries(run.artifacts).filter(([key]) => key.startsWith(id)))).toEqual(expected);
      expect(candidate(id)).toMatchObject({ path: "app.ts" });
    });
  }, 60_000);
});
