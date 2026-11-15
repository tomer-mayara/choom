import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withScratch } from "../../support/commands.ts";
import { entryPlan, savedJson, stageOneRun, stageTwo, stageTwoAttempt, stageTwoSnapshot, planPacket,
  type JsonRecord } from "../../support/stage-2-attempt.ts";
import type { SnapshotFile } from "../../support/staged-run.ts";
import { pathWithoutDocker } from "../../support/tool-doubles.ts";

// Prepare checks whether the fixed Knip profile can run on the saved snapshot.
// Each case records the preflight decision and the toolchain decision that follows.
interface PreflightCase {
  name: string;
  snapshot: SnapshotFile[];
  plan?: JsonRecord;
  reasons: string[];
  workspaces?: JsonRecord;
}

const id = "s2-check";
const app = { path: "app.ts", text: "export const value = 1;\n" };
const manifest = (value: JsonRecord): SnapshotFile => ({ path: "package.json", text: JSON.stringify(value) + "\n" });
const rootWorkspace = { entry: ["app.ts!"], project: ["**/*.ts!"] };
const unsupported = "Preflight marked this profile unsupported.";

const cases: PreflightCase[] = [
  { name: "a root and a library workspace with captured manifests",
    snapshot: [app, { path: "lib/index.ts", text: "export const lib = 1;\n" }, { path: "lib/package.json", text: "{}\n" },
      manifest({ name: "fixture" })],
    plan: { workspaces: [{ dir: ".", ...rootWorkspace }, { dir: "lib", entry: ["index.ts"], project: ["*.{ts,mts}", "!old/**"] }] },
    reasons: [], workspaces: { ".": rootWorkspace, lib: { entry: ["index.ts"], project: ["*.{ts,mts}", "!old/**"] } } },
  { name: "Knip settings in a package manifest", snapshot: [app, manifest({ name: "fixture", knip: { entry: [] } })],
    reasons: ["package.json contains knip configuration, which this profile does not load."] },
  { name: "includes in pnpm-workspace.yaml",
    snapshot: [app, manifest({ name: "fixture" }), { path: "pnpm-workspace.yaml", text: "include:\n  - lib\n" }],
    reasons: ["pnpm-workspace.yaml contains includes, which this profile does not load."] },
  { name: "a malformed root manifest", snapshot: [app, { path: "package.json", text: "{ name\n" }],
    reasons: ["package.json: Expected property name or '}' in JSON at position 2 (line 1 column 3)"] },
  { name: "a manifest that is not a mapping", snapshot: [app, { path: "package.json", text: "[]\n" }],
    reasons: ["package.json: Expected a mapping"] },
  { name: "no captured root manifest", snapshot: [app], reasons: ["Workspace lacks a captured manifest: package.json"] },
  { name: "a symbolic link in the inventory", snapshot: [...stageTwoSnapshot, { path: "link.ts", text: "", kind: "symlink" }],
    reasons: ["Snapshot contains symbolic links; this profile does not follow them."] },
  { name: "a manifest larger than 2 MiB",
    snapshot: [app, { path: "package.json", text: JSON.stringify({ name: "fixture", padding: "x".repeat(2 * 1024 * 1024) }) }],
    reasons: ["Preflight input exceeds 2 MiB: package.json"] },
  { name: "several reasons, in check order",
    snapshot: [app, { path: "lib/package.json", text: "{\"knip\":{}}\n" }, { path: "link.ts", text: "", kind: "symlink" }],
    plan: { workspaces: [{ dir: ".", ...rootWorkspace }, { dir: "lib", entry: [], project: ["*.ts"] }] },
    reasons: ["Workspace lacks a captured manifest: package.json",
      "Snapshot contains symbolic links; this profile does not follow them.",
      "lib/package.json contains knip configuration, which this profile does not load."] },
];

describe("Stage 2 preflight and skip decisions", () => {
  test.each(cases)("$name", ({ snapshot, plan, reasons, workspaces }) => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work, snapshot);
      const attempt = stageTwoAttempt(work, id);
      expect(stageTwo(attempt, "start").status).toBe(0);
      expect(stageTwo(attempt, "plan", [planPacket(join(scratch, "plan"), id, entryPlan(id, plan))]).status).toBe(0);
      const prepare = stageTwo(attempt, "prepare");
      const eligible = reasons.length === 0;
      expect({ status: prepare.status, stderr: prepare.stderr }).toEqual({ status: 0, stderr: "" });
      expect(prepare.stdout).toBe(eligible ? "Profile prepared.\nInventory-only input prepared.\n" :
        "Knip unsupported for this profile; continue with explicit gaps.\nInput preparation skipped: unsupported profile.\n");
      expect(savedJson(attempt, "preflight.json")).toMatchObject({ status: eligible ? "eligible" : "unsupported", reasons });
      if (workspaces) expect(savedJson(attempt, "knip-profile.json").workspaces).toEqual(workspaces);
      expect(existsSync(join(attempt.folder, "knip-input.json"))).toBe(eligible);
      expect(Object.keys(savedJson(attempt, "operator-prepare.json").digests as JsonRecord)).toEqual(
        expect.arrayContaining(["knip-profile.json", "preflight.json", ...(eligible ? ["knip-input.json"] : [])]));

      // Without Docker, an eligible profile has no approved image; an unsupported profile needs none.
      const toolchain = stageTwo(attempt, "toolchain", [], { PATH: pathWithoutDocker(scratch) });
      const selection = { status: "unavailable", imageId: null, reason: eligible ?
        "Docker build, image inspection, or fixture check did not produce a complete receipt." : unsupported };
      expect(savedJson(attempt, "toolchain-selection.json")).toEqual(selection);
      expect(toolchain.status).toBe(eligible ? 1 : 0);
      expect(existsSync(join(attempt.folder, "operator-toolchain-image.sh"))).toBe(eligible);
      if (eligible) expect(toolchain.stdout).toStartWith("Docker is unavailable.\n");
      if (eligible) expect(toolchain.stderr).toContain("No tool image was approved. Run can still record skipped Knip outcomes.");
    });
  }, 30_000);

  test("run records two skipped outcomes with the preflight reasons", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work, [app]);
      const attempt = stageTwoAttempt(work, id);
      for (const action of ["start", "plan", "prepare", "toolchain", "run"]) {
        const args = action === "plan" ? [planPacket(join(scratch, "plan"), id, entryPlan(id))] : [];
        expect({ action, status: stageTwo(attempt, action, args).status }).toEqual({ action, status: 0 });
      }
      const runs = savedJson(attempt, "knip-runs.json").runs as JsonRecord[];
      expect(runs.map(({ mode, status, reasons, args, cleanup }) => ({ mode, status, reasons, args, cleanup }))).toEqual(
        ["normal", "production"].map((mode) => ({ mode, status: "skipped", args: null, cleanup: { status: "not-needed" },
          reasons: ["Workspace lacks a captured manifest: package.json",
            "No approved available tool image: CHOOM_KNIP_IMAGE must be an inspected sha256 image ID."] })));
    });
  }, 30_000);

  test("prepare refuses a project pattern outside JavaScript and TypeScript sources", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const attempt = stageTwoAttempt(work, id);
      expect(stageTwo(attempt, "start").status).toBe(0);
      const plan = entryPlan(id, { workspaces: [{ dir: ".", entry: ["app.ts"], project: ["**/*.css"] }] });
      expect(stageTwo(attempt, "plan", [planPacket(join(scratch, "plan"), id, plan)]).status).toBe(0);
      const prepare = stageTwo(attempt, "prepare");
      expect(prepare.status).toBe(1);
      expect(prepare.stderr).toContain("Error: Invalid workspace or patterns. Ask the LLM to correct the plan.");
      expect(prepare.stderr).toContain("Saved command failed: operator-prepare-profile.sh");
      expect(["knip-profile.json", "preflight.json"].filter((name) => existsSync(join(attempt.folder, name)))).toEqual([]);
      expect(savedJson(attempt, "operator-prepare.json")).toMatchObject({ exitCode: 1,
        error: "Saved command failed: operator-prepare-profile.sh" });
    });
  }, 30_000);
});
