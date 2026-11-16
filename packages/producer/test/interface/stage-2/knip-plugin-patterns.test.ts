import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { toolsRoot, withScratch } from "../../support/commands.ts";
import { computedEntry, type KnipProject, nextPage, nextProject, probeMarker, probeMessage, settingsEntry, viteProject }
  from "../../support/knip-plugin-projects.ts";
import { planPacket, savedJson, stageOneRun, stageTwo, stageTwoAttempt, type JsonRecord,
  type StageTwoAttempt } from "../../support/stage-2-attempt.ts";

// Stage 2 prepare writes the Knip profile of the plan for the two frontend projects
// of the Docker scenarios of knip-plugins.feature. Then the Knip 6.44.1 of the tool
// checkout runs that profile in the inventory-only input that prepare made, with the
// arguments of the Stage 2 runner, as the pinned image runs it without Docker.
interface KnipRun { status: number | null; stderr: string; unused: string[] }

const id = "s2-check";
const knip = join(toolsRoot, "node_modules/knip/bin/knip.js");

function preparedAttempt(scratch: string, project: KnipProject): StageTwoAttempt {
  const work = join(scratch, "run");
  stageOneRun(work, project.snapshot);
  const attempt = stageTwoAttempt(work, id);
  expect(stageTwo(attempt, "start").status).toBe(0);
  expect(stageTwo(attempt, "plan", [planPacket(join(scratch, "plan"), id, project.plan(id))]).status).toBe(0);
  const prepare = stageTwo(attempt, "prepare");
  expect({ status: prepare.status, stdout: prepare.stdout, stderr: prepare.stderr })
    .toEqual({ status: 0, stdout: "Profile prepared.\nInventory-only input prepared.\n", stderr: "" });
  return attempt;
}

// Runs Knip in one mode with the saved profile, in the input folder of the runner.
function runKnip(attempt: StageTwoAttempt, mode: "normal" | "production"): KnipRun {
  const inventory = savedJson(attempt, "preflight.json").inventory as JsonRecord;
  const run = spawnSync("node", [knip, "--config", join(attempt.folder, "knip-profile.json"), "--reporter", "json",
    "--no-progress", "--no-gitignore", ...(mode === "production" ? ["--production"] : [])],
  { cwd: join(attempt.work, "knip-input-" + String(inventory.sha256)), encoding: "utf8", timeout: 60_000,
    env: { PATH: process.env.PATH ?? "", KNIP_DISABLE_RAW_TRANSFER: "1" } });
  if (run.error) throw run.error;
  const { issues } = JSON.parse(run.stdout) as { issues: { file: string; files: unknown[] }[] };
  return { status: run.status, stderr: run.stderr,
    unused: issues.filter((issue) => issue.files.length > 0).map((issue) => issue.file).sort() };
}

describe("the Knip plugin patterns of the Stage 2 profile", () => {
  test("Knip takes the page of a Next.js app as an entry through the copied pattern of the plugin", () => {
    withScratch((scratch) => {
      const attempt = preparedAttempt(scratch, nextProject);
      // Exit code 1 reports issues, such as the unused dependencies; the runner takes 0 and 1 as a completed run.
      for (const mode of ["normal", "production"] as const) {
        const { status, unused } = runKnip(attempt, mode);
        expect({ mode, completed: status === 0 || status === 1, unused: unused.filter((file) => file === nextPage) })
          .toEqual({ mode, completed: true, unused: [] });
      }
      expect(savedJson(attempt, "preflight.json").pluginEntryPatterns).toContainEqual({ workspace: ".",
        manifest: "package.json", plugin: "next", dependency: "next", field: "production",
        pattern: "{,src/}app/**/{layout,page,route,template}.{js,jsx,ts,tsx}!" });
    });
  }, 60_000);

  test("Knip does not load the settings file of a Vite app, and the entries that only it names stay unused", () => {
    withScratch((scratch) => {
      const attempt = preparedAttempt(scratch, viteProject);
      const profile = savedJson(attempt, "knip-profile.json");
      const plugins = savedJson(attempt, "preflight.json").disabledPlugins as string[];
      expect(plugins.filter((name) => profile[name] !== false)).toEqual([]);
      expect(savedJson(attempt, "preflight.json").pluginsNotCopied).toContainEqual({ workspace: ".",
        manifest: "package.json", plugin: "vite", dependency: "vite", reason: "Knip 6.44.1 gives this plugin no " +
          "static entry or production patterns: its entries come from its settings file or from its own code, which " +
          "this profile does not run." });
      for (const mode of ["normal", "production"] as const) {
        const run = runKnip(attempt, mode);
        expect(run.stderr).not.toContain(probeMessage);
        expect(run.unused).toEqual(expect.arrayContaining([computedEntry, settingsEntry]));
      }
      expect(readdirSync(attempt.work, { recursive: true }).map(String).filter((name) => name.endsWith(probeMarker))).toEqual([]);
    });
  }, 60_000);
});
