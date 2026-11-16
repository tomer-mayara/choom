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
// The plugins of Knip 6.44.1 that no dependency of an enablers list turns on, in the order of the plugin names, as the
// preflight records them.
const onlyByDependency = " The profile copies the patterns of a plugin only when a dependency turns it on, so it copies none " +
  "of the patterns of this plugin.";
const byFiles = "Knip 6.44.1 turns this plugin on when it finds a file or a manifest field that the plugin names, not by a " +
  "dependency." + onlyByDependency;
const withoutDependency = [["bun", byFiles], ["github-actions", byFiles], ["mcp", byFiles], ["mise", byFiles],
  ["node", "Knip 6.44.1 turns this plugin on in every workspace, not by a dependency." + onlyByDependency],
  ["openclaw", byFiles], ["pnpm", byFiles], ["taskfile", byFiles], ["travis", byFiles],
  ["tsx", "The definition of this plugin in Knip 6.44.1 names no enablers, so only its code decides when the plugin is on. " +
    "The profile does not run plugin code, so it copies none of the patterns of this plugin."],
  ["typescript-content-mapper", byFiles], ["yarn", byFiles],
].map(([plugin, reason]) => ({ workspace: null, manifest: null, plugin, dependency: null, reason }));
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
        // The manifest has no dependencies, so no plugin adds a pattern. Each plugin that Knip 6.44.1 turns on
        // without a dependency of its enablers has one record.
        disabledPlugins: plugins, pluginEntryPatterns: [], pluginPatternsNotCopied: [], pluginsNotCopied: withoutDependency,
        approvedCoreParsers: ["JS/TS", "MDX", "Sass/SCSS", "Less", "Stylus", "TSRX"],
        limits: ["Every Knip plugin is turned off, so Knip loads no settings file of the target.",
          "For each plugin that a dependency or a development dependency of a workspace manifest turns on, or of the " +
          "manifest of a workspace that holds it, the profile copies the default entry and production patterns of the " +
          "plugin from Knip 6.44.1 into the entry patterns of the workspace (pluginEntryPatterns). A pattern that looks like " +
          "a settings file by its name and a negation are not copied (pluginPatternsNotCopied). A plugin without static " +
          "patterns adds nothing (pluginsNotCopied).",
          "The settings-file test reads only names: a settings-file pattern (config) of a plugin, or a file name that holds " +
          "config or whose first part ends with rc. So the profile copies some settings files, such as " +
          ".dependency-cruiser.{js,cjs,mjs,json}, vercel.{js,mjs,cjs,ts,mts} and dangerfile.{js,cjs,mjs,ts}, and it does not " +
          "copy the Mastra pattern of the config, instructions, memory and workspace files of an agent.",
          "A plugin that Knip 6.44.1 turns on without a dependency of its enablers adds nothing: node, which is on in every " +
          "workspace, tsx, whose definition names no enablers, and the plugins that files or manifest fields turn on, such " +
          "as bun, github-actions, pnpm and yarn. pluginsNotCopied records each of them once, with a null workspace, " +
          "manifest and dependency.",
          "Only these file-name patterns come from the plugins. The profile runs no plugin code, so it loses the entries " +
          "that this code finds: the resolve steps of the plugins, such as the start files that the Vite plugin reads from " +
          "index.html, the readers of .vue, .svelte and .astro files, and the syntax visitors of the plugins. A settings " +
          "file that changes the entries of its tool is not read.",
          "Missing dependencies remain missing.",
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
