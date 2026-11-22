import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import contracts from "../../../../../cookbook/interfaces/generated/contracts.schema.json";
import { producerSource, withScratch } from "../../support/commands.ts";
import { changeBaselineModelCode, changedCodeMessage, folderState } from "../../support/producer-record.ts";
import { capturedStageOneRun, type Excerpt, reviewPacket, stageOne, stageOneRun, type StageOneRun, writeReview }
  from "../../support/stage-1-run.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";
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
// The settings action runs the collector in the tool checkout.
const collector = join(producerSource, "stage-1-settings.ts");
const runManifestContract = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "RunManifest.json" });

function readJson<T>(work: string, path: string): T {
  return JSON.parse(readFileSync(join(work, path), "utf8")) as T;
}

function expectSuccess(result: { status: number | null; stderr: string }): void {
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
}

// The program that a settings probe ran; the probe record names it.
function collectorPath(work: string, probe = "evidence/settings-probes/probe-001"): string {
  const [program] = readJson<ProbeCommand>(work, probe + ".json").args;
  if (program === undefined) throw new Error("The probe record names no collector.");
  return program;
}

function captureAndCollect(run: StageOneRun): void {
  for (const action of ["start", "capture", "settings"]) expectSuccess(stageOne(run, action));
}

function reviewFolder(run: StageOneRun): string {
  const excerpt = stageOne(run, "excerpt", "package.json", "1", "5", "Check the workspace patterns.");
  expectSuccess(excerpt);
  return writeReview(run, reviewPacket(JSON.parse(excerpt.stdout) as Excerpt));
}

describe("Stage 1 capture, settings and save", () => {
  test("collects the settings record with extends, references and extra paths, then saves the run", () => {
    withScratch((scratch) => {
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) });
      expect(stageOne(run, "start").stdout).toBe("Working folder prepared. Review exclusions.txt and scope-notes.md before capture.\n");
      // The scratch target is not a Git repository.
      expect(stageOne(run, "capture").stdout).toBe("Captured 10 regular files. Atomic capture is not proven.\n" +
        "Git evidence is not available. See evidence/git-identity.json.\n");
      const first = stageOne(run, "settings");
      expectSuccess(first);
      expect(first.stdout).toBe("Settings collected. Evidence ID for this probe: s1-file@evidence%2Fsettings-probes%2Fprobe-001.result.json\n");
      expect(readJson(run.work, "evidence/settings.json")).toEqual(firstProbeSettings);
      writeFileSync(join(run.work, "evidence/extra-configs.json"), JSON.stringify([extraConfig]) + "\n");
      expect(stageOne(run, "settings").stdout).toContain("probe-002.result.json");
      expect(readJson(run.work, "evidence/settings.json")).toEqual(expectedSettings);
      expect(readJson(run.work, "evidence/settings-probes/probe-001.result.json")).toEqual(firstProbeSettings);

      const finish = stageOne(run, "finish", reviewFolder(run));
      expectSuccess(finish);
      expect(finish.stdout).toBe("Stage 1 saved. Run verify, then continue to Stage 2.\n");
      const verify = stageOne(run, "verify");
      expectSuccess(verify);
      expect(JSON.parse(verify.stdout)).toMatchObject({ status: "stage1-inputs-verified", files: 10, writes: [] });

      // The run registers the producer code record and the generated inventory program, and no producer code.
      const saved = parse(readFileSync(join(run.work, "run.yaml"), "utf8")) as SavedRun;
      const registered = new Map(Object.values(saved.artifacts).map(({ path, sha256: digest }) => [path, digest]));
      for (const [path, digest] of registered) expect({ path, digest }).toEqual({ path, digest: sha256(readFileSync(join(run.work, path))) });
      expect(saved.artifacts["s1-file@evidence%2Fproducer.json"]?.path).toBe("evidence/producer.json");
      expect(registered.has("inventory.mjs")).toBe(true);
      expect([...registered.keys()].filter((path) => /\.m?ts$/.test(path))).toEqual([]);
      // Each probe ran the collector in the tool checkout, and the selection records its digest.
      const selection = readJson<Selection>(run.work, "evidence/settings-selection.json");
      expect([collectorPath(run.work), collectorPath(run.work, selection.probe)]).toEqual([collector, collector]);
      expect(selection.collectorSha256).toBe(sha256(readFileSync(collector)));
      expect(saved.progress).toEqual({ inventory: "complete", baselineRecovery: "pending" });
    });
  }, 60_000);

  test("settings runs the collector in the tool checkout, not a program in the run folder", () => {
    withScratch((scratch) => {
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) });
      expectSuccess(stageOne(run, "start"));
      expectSuccess(stageOne(run, "capture"));
      expect(existsSync(join(run.work, "settings.mts"))).toBe(false);
      writeFileSync(join(run.work, "settings.mts"), `console.log(JSON.stringify({ marker: "run folder" }));\n`);
      expectSuccess(stageOne(run, "settings"));
      expect(readJson(run.work, "evidence/settings.json")).toEqual(firstProbeSettings);
      expect(collectorPath(run.work)).toBe(collector);
    });
  });

  // DB4: the review has 1 question and 1 gap, and finish adds the gap of the missing Git
  // evidence. The run manifest conforms to its contract (producer-run-records.tsp).
  test("finish writes the summary of the run, and the run manifest has the fields of its contract", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedStageOneRun(scratch);
      expectSuccess(stageOne(run, "finish", writeReview(run, reviewPacket(excerpt))));
      const saved = parse(readFileSync(join(run.work, "run.yaml"), "utf8")) as { coverage: unknown };
      expect(saved.coverage).toEqual({ inventoried: "10 regular files in the selected capture scope.",
        inspected: "review-001#/reviewedFiles lists the source ranges that the selected review read. Earlier reviews keep " +
          "their own ranges. Tool reads are not LLM inspection.",
        recorded: "discovery-001 records 1 question and 2 gaps, with history and linked notes.",
        pending: "Stages 2, 3, 4, 5 and 6 are pending." });
      expect(runManifestContract(saved)).toBe(true);
    });
  }, 60_000);
});

describe("Stage 1 after the producer code changed", () => {
  test("each later action refuses the run after a baseline-model file changed, and changes nothing", () => {
    withScratch((scratch) => {
      const tools = copyToolCheckout(scratch);
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) }, tools);
      expectSuccess(stageOne(run, "start"));
      changeBaselineModelCode(tools);
      const before = folderState(run.work);
      const actions = [["capture"], ["settings"], ["excerpt", "app.ts", "1", "1", "Check the entry."],
        ["finish", run.review], ["verify"]];
      for (const [action = "", ...args] of actions) {
        const result = stageOne(run, action, ...args);
        expect({ action, status: result.status, stdout: result.stdout, stderr: result.stderr })
          .toEqual({ action, status: 1, stdout: "", stderr: changedCodeMessage(run.work) });
      }
      expect(folderState(run.work)).toEqual(before);
    });
  }, 60_000);

  test("finish refuses the run after the settings collector changed, and saves nothing", () => {
    withScratch((scratch) => {
      const tools = copyToolCheckout(scratch);
      const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) }, tools);
      captureAndCollect(run);
      const review = reviewFolder(run);
      appendFileSync(join(tools, "packages/producer/src/stage-1-settings.ts"), "// changed\n");
      const finish = stageOne(run, "finish", review);
      expect({ status: finish.status, stderr: finish.stderr }).toEqual({ status: 1, stderr: changedCodeMessage(run.work) });
      expect(["run.yaml", "baseline.yaml", "discovery.yaml"].filter((name) => existsSync(join(run.work, name)))).toEqual([]);
    });
  }, 60_000);
});
