import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { parse, stringify } from "yaml";
import { type CommandResult, producerDocuments, toolsRoot } from "../../support/commands.ts";
import { folderState } from "../../support/producer-record.ts";
import { fixtureRecords, fixtureValidation, jsonText, nodeVersion, publishedResult, type StageSixFixture, stageSix, stageSixCommandRecord,
  stageSixFixture } from "../../support/stage-6-run.ts";

// What each Stage 6 action reports and saves for the producer fixture, when an
// operator runs preflight, start, check, finish and verify in this order: the
// command results, the receipts, the prepared and fixed records, and the completed
// run manifest with its coverage summaries. The texts of the saved JSON and YAML
// files are compared exactly, so the order of their fields is recorded too.
type Json = Record<string, unknown>;
interface RunManifest extends Json { progress: Json; coverage?: Json; artifacts: Record<string, { path: string; sha256: string }> }
type FolderState = [string, string][];

const id = "s6-outputs";
const discoveryRef = `${id}-discovery`;
const { runRef, baselineRef, baselinePath, discoveryPath } = fixtureRecords;
const draftNames = ["run.yaml", "baseline.yaml", "discovery.yaml"];
const packetNames = ["readiness.yaml", "review-scope.json", "llm/analysis-prompt.md", "llm/analysis-response.md",
  "llm/analysis-call.yaml"];
// The files that start saves, in the order of its result and of its receipt.
const startWrites = ["run.before.yaml", "baseline.before.yaml", "discovery.before.yaml", "step-6-cookbook.md", ...packetNames,
  "baseline.candidate.yaml", "discovery.candidate.yaml", "validation.json", "handoff.json", "commands.md", "operator-start.json"];
const finishReceipts = ["operator-finish.started.json", "operator-finish.json"];
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

let fixture: StageSixFixture;
let drafts: Map<string, Buffer>;
const results = new Map<string, CommandResult>();
const states = new Map<string, FolderState>();

const runFile = (path: string): Buffer => readFileSync(join(fixture.work, path));
const attemptFile = (name: string): Buffer => runFile(`evidence/${id}/${name}`);
const attemptJson = (name: string): Json => JSON.parse(attemptFile(name).toString("utf8")) as Json;
const draft = (name: string): Buffer => drafts.get(name) ?? Buffer.alloc(0);
const draftRun = (): RunManifest => parse(draft("run.yaml").toString("utf8")) as RunManifest;
function result(action: string): CommandResult | undefined { return results.get(action); }
function state(action: string): FolderState { return states.get(action) ?? []; }
// The entries of a folder state that are not in another one.
const added = (after: FolderState, before: FolderState): FolderState =>
  after.filter((entry) => !before.some((other) => other[0] === entry[0] && other[1] === entry[1]));

beforeAll(async () => {
  fixture = await stageSixFixture();
  drafts = new Map(draftNames.map((name) => [name, readFileSync(join(fixture.work, name))]));
  states.set("before", folderState(fixture.work));
  const actions: [string, string[]][] = [["preflight", [fixture.review]], ["start", [fixture.review]], ["check", []], ["finish", []],
    ["verify", []]];
  for (const [action, args] of actions) {
    results.set(action, stageSix(fixture.work, id, [action, ...args]));
    states.set(action, folderState(fixture.work));
  }
}, 120_000);

afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

// The fixed discovery result: the reviewed working discovery and the ID of the fixed baseline.
function fixedDiscovery(): string {
  return stringify({ ...(parse(draft("discovery.yaml").toString("utf8")) as Json), baselineRef });
}

// The digests of the files of the trusted YAML package, by path in the package, in path order.
function yamlPackageDigests(): Record<string, string> {
  const root = join(toolsRoot, "node_modules/yaml");
  const paths = readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name))).sort();
  return Object.fromEntries(paths.map((path) => [path, sha256(readFileSync(join(root, path)))]));
}

function expectedHandoff(): Json {
  const run = draftRun();
  const snapshot = join(fixture.work, "snapshot");
  const { dev, ino } = lstatSync(snapshot);
  const yamlVersion = (JSON.parse(readFileSync(join(toolsRoot, "node_modules/yaml/package.json"), "utf8")) as Json).version;
  return { formatVersion: 1, attemptId: id, runRef, snapshotRef: "fixture-snapshot", baselineRef, discoveryRef, baselinePath,
    discoveryPath, work: fixture.work, tools: toolsRoot, snapshot: { path: snapshot, dev, ino }, inventoryRef: "inventory",
    inventorySha256: run.artifacts.inventory?.sha256, indexedFiles: 3, registeredArtifacts: 15,
    draftDigests: Object.fromEntries(draftNames.map((name) => [name, sha256(draft(name))])),
    selectedRefs: { entryAnalysisRef: "s5-fixture-entry-analysis", codeMappingRef: "s5-fixture-file@code-mapping.json",
      dependenciesRef: "source-graph", resourceAccessRef: "s5-fixture-file@resource-access.json" },
    registeredArtifactDigests: Object.fromEntries(Object.entries(run.artifacts).map(([ref, item]) => [ref, item.sha256])),
    toolInputDigests: { "step-6-cookbook.md": sha256(readFileSync(join(producerDocuments, "step-6-cookbook.md"))) },
    packetDigests: Object.fromEntries(packetNames.map((name) => [name, sha256(readFileSync(join(fixture.review, name)))])),
    parserVersions: { node: nodeVersion, yaml: yamlVersion, files: yamlPackageDigests() },
    validationSha256: sha256(jsonText(fixtureValidation(id))),
    candidateDigests: { "baseline.candidate.yaml": sha256(draft("baseline.yaml")), "discovery.candidate.yaml": sha256(fixedDiscovery()) } };
}

// The completed run manifest: the draft manifest with the completed state, the
// coverage summaries, the fixed record IDs and every attempt file and fixed record
// in the registry.
function expectedRunManifest(completedAt: string): string {
  const run = draftRun();
  const artifacts = { ...run.artifacts };
  for (const name of [...startWrites, ...finishReceipts])
    artifacts[`${id}-file@${encodeURIComponent(name)}`] = { path: `evidence/${id}/${name}`, sha256: sha256(attemptFile(name)) };
  artifacts[baselineRef] = { path: baselinePath, sha256: sha256(draft("baseline.yaml")) };
  artifacts[discoveryRef] = { path: discoveryPath, sha256: sha256(fixedDiscovery()) };
  const coverage = { ...run.coverage,
    inspected: "See s5-fixture-entry-analysis#/reviewedFiles and its predecessor analyses for reviewed source ranges. " +
      `See s5-fixture-file@code-mapping.json for file review scope and ${discoveryRef}#/inspectedPaths for inspected behavior paths (0).`,
    unresolved: `Fixed baseline ${baselineRef} records proposed intent. See fixed discovery ${discoveryRef} for questions (0) and ` +
      "gaps (1), and s5-fixture-file@code-mapping.json for files with unknown owners (0)." };
  return stringify({ ...run, status: "completed", progress: { ...run.progress, baselineRecovery: "complete" }, coverage, baselineRef,
    discoveryRef, completedAt, artifacts });
}

const isTime = (value: unknown): boolean => typeof value === "string" && Number.isFinite(Date.parse(value));

describe("Stage 6 actions on the producer fixture", () => {
  test("preflight reports the validation of the drafts and the readiness packet and writes nothing", () => {
    expect(result("preflight")).toEqual({ status: 0, stderr: "",
      stdout: jsonText({ ...fixtureValidation(id), status: "stage6-preflight-verified", writes: [] }) });
    expect(state("preflight")).toEqual(state("before"));
  });

  test("start reports the validation and the attempt files that it saves, and changes nothing else", () => {
    expect(result("start")).toEqual({ status: 0, stderr: "",
      stdout: jsonText({ ...fixtureValidation(id), status: "stage6-prepared", writes: startWrites }) });
    expect(added(state("start"), state("before")).map(([path]) => path))
      .toEqual([`evidence/${id}`, ...[...startWrites, "llm"].sort().map((name) => `evidence/${id}/${name}`)].sort());
    expect(added(state("before"), state("start"))).toEqual([]);
  });

  test("start saves the checkpoints, the cookbook, the readiness packet and the prepared records", () => {
    for (const name of draftNames) expect(attemptFile(name.replace(".yaml", ".before.yaml"))).toEqual(draft(name));
    expect(attemptFile("step-6-cookbook.md")).toEqual(readFileSync(join(producerDocuments, "step-6-cookbook.md")));
    for (const name of packetNames) expect(attemptFile(name)).toEqual(readFileSync(join(fixture.review, name)));
    expect(attemptFile("baseline.candidate.yaml")).toEqual(draft("baseline.yaml"));
    expect(attemptFile("discovery.candidate.yaml").toString("utf8")).toBe(fixedDiscovery());
    expect(attemptFile("validation.json").toString("utf8")).toBe(jsonText(fixtureValidation(id)));
    expect(attemptFile("handoff.json").toString("utf8")).toBe(jsonText(expectedHandoff()));
  });

  test("start saves its command and its receipt", () => {
    const command = stageSixCommandRecord(fixture.work, id, ["start", fixture.review]);
    expect(attemptFile("commands.md").toString("utf8")).toBe("# Stage 6 commands\n\n" +
      "The trusted checkout helper prepares and publishes the fixed records. Saved scripts are evidence.\n\n" +
      `Start command: ${JSON.stringify(command)}\n`);
    const { startedAt, finishedAt } = attemptJson("operator-start.json");
    expect([isTime(startedAt), isTime(finishedAt), String(startedAt) <= String(finishedAt)]).toEqual([true, true, true]);
    expect(attemptFile("operator-start.json").toString("utf8")).toBe(jsonText({ formatVersion: 1, attemptId: id, action: "start",
      status: "completed", command, startedAt, finishedAt,
      digests: Object.fromEntries(startWrites.slice(0, -1).map((name) => [name, sha256(attemptFile(name))])) }));
  });

  test("check reports the validation of the prepared attempt and writes nothing", () => {
    expect(result("check")).toEqual({ status: 0, stderr: "",
      stdout: jsonText({ ...fixtureValidation(id), status: "stage6-prepared-verified", writes: [] }) });
    expect(state("check")).toEqual(state("start"));
  });

  test("finish reports the fixed records and its writes, and leaves no lock or temporary file", () => {
    expect(result("finish")).toEqual({ status: 0, stderr: "", stdout: jsonText(publishedResult(id)) });
    expect(added(state("finish"), state("check")).map(([path]) => path)).toEqual(["baselines", `baselines/${baselineRef}`,
      baselinePath, "discovery.yaml", ...finishReceipts.map((name) => `evidence/${id}/${name}`).sort(), "run.yaml", "runs",
      `runs/${runRef}`, discoveryPath]);
    expect(added(state("check"), state("finish")).map(([path]) => path)).toEqual(["discovery.yaml", "run.yaml"]);
  });

  test("finish saves its receipts", () => {
    const command = stageSixCommandRecord(fixture.work, id, ["finish"]);
    const { startedAt } = attemptJson("operator-finish.started.json");
    expect(isTime(startedAt)).toBe(true);
    expect(attemptFile("operator-finish.started.json").toString("utf8")).toBe(jsonText({ formatVersion: 1, attemptId: id,
      action: "finish", status: "started", startedAt, command }));
    expect(attemptFile("operator-finish.json").toString("utf8")).toBe(jsonText({ formatVersion: 1, attemptId: id, runRef,
      snapshotRef: "fixture-snapshot", action: "finish", status: "prepared-for-publication", completedAt: startedAt,
      startedSha256: sha256(attemptFile("operator-finish.started.json")),
      records: { baseline: { id: baselineRef, path: baselinePath, sha256: sha256(draft("baseline.yaml")) },
        discovery: { id: discoveryRef, path: discoveryPath, sha256: sha256(fixedDiscovery()) } },
      note: "The completed run manifest is the publication marker. The baseline draft stays unchanged." }));
  });

  test("finish saves the fixed records, makes the working discovery match the fixed one and completes the run manifest", () => {
    expect(runFile(baselinePath)).toEqual(draft("baseline.yaml"));
    expect(runFile("baseline.yaml")).toEqual(draft("baseline.yaml"));
    expect(runFile(discoveryPath).toString("utf8")).toBe(fixedDiscovery());
    expect(runFile("discovery.yaml").toString("utf8")).toBe(fixedDiscovery());
    const { completedAt } = attemptJson("operator-finish.json");
    expect(runFile("run.yaml").toString("utf8")).toBe(expectedRunManifest(String(completedAt)));
  });

  test("verify reports the completed result and writes nothing", () => {
    const { completedAt } = attemptJson("operator-finish.json");
    expect(result("verify")).toEqual({ status: 0, stderr: "", stdout: jsonText({ ...fixtureValidation(id),
      status: "stage6-completed-verified", registeredArtifactsVerified: 34, baselinePath, discoveryPath, discoveryRef, completedAt,
      writes: [] }) });
    expect(state("verify")).toEqual(state("finish"));
  });
});
