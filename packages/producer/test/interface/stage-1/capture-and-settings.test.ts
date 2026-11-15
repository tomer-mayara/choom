import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { producerCommands } from "../../../src/cli.ts";
import { withScratch } from "../../support/commands.ts";
import { type Excerpt, reviewPacket, savedHelper, stageOne, stageOneRun, type StageOneRun,
  writeReview } from "../../support/stage-1-run.ts";
import { breakProducerFiles, copyToolCheckout } from "../../support/tool-checkout.ts";
import { pathWithDoubles } from "../../support/tool-doubles.ts";

// Stage 1 runs through the command line with an rsync test double. The expected
// settings record is the collector's output for the fixture target in
// stage-1-run.ts, after the second probe adds configs/custom.json.
interface SettingsRecord { configs: { path: string }[]; contentReads: { path: string }[] }
interface ProbeCommand { args: string[]; exitCode: number }
interface Selection { probe: string; collectorSha256: string; settingsSha256: string }
interface SavedRun { artifacts: Record<string, { path: string; sha256: string }>; progress: Record<string, string> }

const expectedSettings = JSON.parse(readFileSync(new URL("../../fixtures/stage-1/settings.json", import.meta.url), "utf8")) as
  SettingsRecord;
const extraConfig = "configs/custom.json";
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const firstProbeSettings: SettingsRecord = {
  ...expectedSettings,
  configs: expectedSettings.configs.filter(({ path }) => path !== "/repo/" + extraConfig),
  contentReads: expectedSettings.contentReads.filter(({ path }) => path !== extraConfig),
};

function readJson<T>(work: string, path: string): T {
  return JSON.parse(readFileSync(join(work, path), "utf8")) as T;
}

function expectSuccess(result: { status: number | null; stderr: string }): void {
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
}

// The settings action runs this saved program; the probe record names it.
function collectorPath(work: string, probe = "evidence/settings-probes/probe-001"): string {
  const [collector] = readJson<ProbeCommand>(work, probe + ".json").args;
  if (collector === undefined) throw new Error("The probe record names no collector.");
  return collector;
}

function captureAndCollect(run: StageOneRun): void {
  for (const action of ["start", "capture", "settings"]) expectSuccess(stageOne(run, action));
}

function finishWithReview(run: StageOneRun): ReturnType<typeof stageOne> {
  const excerpt = stageOne(run, "excerpt", "package.json", "1", "5", "Check the workspace patterns.");
  expectSuccess(excerpt);
  return stageOne(run, "finish", writeReview(run, reviewPacket(JSON.parse(excerpt.stdout) as Excerpt)));
}

describe("Stage 1 capture, settings and save", () => {
  test("collects the settings record with extends, references and extra paths, then saves the run", () => {
    withScratch((scratch) => {
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) });
      expect(stageOne(run, "start").stdout).toBe("Working folder prepared. Review exclusions.txt and scope-notes.md before capture.\n");
      expect(stageOne(run, "capture").stdout).toBe("Captured 10 regular files. Atomic capture is not proven.\n");
      const first = stageOne(run, "settings");
      expectSuccess(first);
      expect(first.stdout).toBe("Settings collected. Evidence ID for this probe: s1-file@evidence%2Fsettings-probes%2Fprobe-001.result.json\n");
      expect(readJson(run.work, "evidence/settings.json")).toEqual(firstProbeSettings);
      writeFileSync(join(run.work, "evidence/extra-configs.json"), JSON.stringify([extraConfig]) + "\n");
      expect(stageOne(run, "settings").stdout).toContain("probe-002.result.json");
      expect(readJson(run.work, "evidence/settings.json")).toEqual(expectedSettings);
      expect(readJson(run.work, "evidence/settings-probes/probe-001.result.json")).toEqual(firstProbeSettings);

      const finish = finishWithReview(run);
      expectSuccess(finish);
      expect(finish.stdout).toBe("Stage 1 saved. Run verify, then continue to Stage 2.\n");
      const verify = stageOne(run, "verify");
      expectSuccess(verify);
      expect(JSON.parse(verify.stdout)).toMatchObject({ status: "stage1-inputs-verified", files: 10, writes: [] });

      // Both programs that later checks run from the run folder are registered with their digests.
      const saved = parse(readFileSync(join(run.work, "run.yaml"), "utf8")) as SavedRun;
      const registered = new Map(Object.values(saved.artifacts).map(({ path, sha256: digest }) => [path, digest]));
      for (const [path, digest] of registered) expect({ path, digest }).toEqual({ path, digest: sha256(readFileSync(join(run.work, path))) });
      const selection = readJson<Selection>(run.work, "evidence/settings-selection.json");
      const collector = relative(run.work, collectorPath(run.work, selection.probe));
      expect(registered.get(collector)).toBe(selection.collectorSha256);
      expect(registered.has("inventory.mjs")).toBe(true);
      expect(saved.progress).toEqual({ inventory: "complete", baselineRecovery: "pending" });
    });
  }, 60_000);

  test("a later action refuses a Stage 1 helper that changed after start", () => {
    withScratch((scratch) => {
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) });
      expectSuccess(stageOne(run, "start"));
      appendFileSync(savedHelper(run.work), "// changed\n");
      const capture = stageOne(run, "capture");
      expect({ status: capture.status, stderr: capture.stderr }).toEqual({ status: 1,
        stderr: "The trusted helper changed since start. Use the saved tool checkout version.\n" });
      expect(existsSync(join(run.work, "evidence/inventory.json"))).toBe(false);
    });
  });

  test("settings runs the collector copy in the run folder", () => {
    withScratch((scratch) => {
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) });
      expectSuccess(stageOne(run, "start"));
      expectSuccess(stageOne(run, "capture"));
      const record = { formatVersion: 1, snapshotId: "snapshot-check", configs: [], packages: [], marker: "saved copy" };
      const collector = existsSync(join(run.work, "settings.mjs")) ? "settings.mjs" : "settings.mts";
      writeFileSync(join(run.work, collector), `console.log(JSON.stringify(${JSON.stringify(record)}));\n`);
      expectSuccess(stageOne(run, "settings"));
      expect(readJson(run.work, "evidence/settings.json")).toEqual(record);
      expect(collectorPath(run.work)).toBe(join(run.work, collector));
    });
  });

  test("finish refuses a collector that changed after the selected probe and saves nothing", () => {
    withScratch((scratch) => {
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) });
      captureAndCollect(run);
      appendFileSync(collectorPath(run.work), "// changed\n");
      mkdirSync(run.review);
      const finish = stageOne(run, "finish", run.review);
      expect({ status: finish.status, stderr: finish.stderr }).toEqual({ status: 1, stderr:
        "Settings do not match the selected successful probe and current extra paths. Rerun settings before review.\n" });
      expect(["run.yaml", "baseline.yaml", "discovery.yaml"].filter((name) => existsSync(join(run.work, name)))).toEqual([]);
    });
  });

  // Start saves the code that capture and settings run. Later changes to the
  // checkout's documents and producer code, other than the helper that each
  // action compares with its saved copy, do not reach the run.
  test("capture and settings use the code that start saved, not the current tool checkout", () => {
    withScratch((scratch) => {
      const tools = copyToolCheckout(scratch);
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) }, tools);
      expectSuccess(stageOne(run, "start"));
      const helper = producerCommands.get("stage-1")?.helper ?? "";
      expect(breakProducerFiles(tools, ["cli.ts", helper, "run-layout.mjs"])).toContain("step-1-cookbook.md");
      expectSuccess(stageOne(run, "capture"));
      expectSuccess(stageOne(run, "settings"));
      expect(readJson(run.work, "evidence/settings.json")).toEqual(firstProbeSettings);
      expectSuccess(finishWithReview(run));
      expectSuccess(stageOne(run, "verify"));
    });
  }, 60_000);
});
