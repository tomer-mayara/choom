import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as tsMorph from "ts-morph";
import { parse, stringify } from "yaml";
import { choomDefaultProfile } from "../../../src/parsing-profile.ts";
import { producerReceipt } from "../../../src/producer-code.ts";
import { RunSummary } from "../../../src/run-summary.ts";
import { settingsTool, stageOneGaps } from "../../../src/stage-1-gaps.ts";
import { noProjectSettingsGap, readProjectSettings } from "../../../src/stage-1-settings.ts";
import { collect, loadTools } from "../../../src/stage-4-graph.ts";
import { type CommandResult, removeScratch, runCli, toolsRoot } from "../../support/commands.ts";

// A run after Stage 3 with a complete Stage 4 attempt and a reviewed Stage 4
// packet, for the Stage 4/5 publisher. Stage 4 start and source collection use
// the CLI. Traversal scenarios run the graph collector with the checkout's
// pinned tools. Other scenarios supply graph edges. The fixture writes the
// phase receipts that the collector and publisher read. The packet copies each
// required gap that collect saved, as the review prompt asks.
// A test can add snapshot files that no component owns, can stop before the source
// collection, can run the helpers of a copied tool checkout, and can use the
// settings record that the Stage 1 collector makes for the snapshot.
interface Statement<Value> { value: Value; status: "proposed"; evidenceRefs: string[] }
interface FixtureComponent {
  id: string;
  name: string;
  purpose: Statement<string | null>;
  membership: Statement<{ paths: string[] }>;
  groupingReason: Statement<string | null>;
}
export interface FixtureBaseline {
  formatVersion: number;
  id: string;
  parentId: null;
  components: FixtureComponent[];
  interfaces: unknown[];
  resources: unknown[];
  rules: unknown[];
}
// A saved snapshot file, optionally inspected during a prior review.
export interface ExtraFile { path: string; text: string | Buffer; priorReview?: { stage: 1 | 3; lines: [number, number] } }
export interface ReviewedProject {
  key: string;
  reference?: string;
  fileEntries?: typeof candidates;
  entryPatterns?: string[];
  reviewPaths: string[];
  edges: { from: string; to: string | null; specifier: string; type?: boolean }[];
}
// A Stage 4 attempt whose start, toolchain and graph phases completed, before the source
// collection, and the tool checkout whose helpers run it.
export interface StageFourAttempt { root: string; work: string; attempt: string; tools: string }
// The settings record of the run: the fixture record, which names the Choom parsing
// profile, or the record that the Stage 1 collector makes for the snapshot files.
export type FixtureSettings = "profile" | "collected";
export interface StageFourPublication extends StageFourAttempt { review: string }
// Changes the five records of the packet, by file name, before the fixture writes them.
type RecordsChange =(records: Record<string, Record<string, unknown>>, prepared: StageFourAttempt) => void;
interface InventoryFile { path: string; kind: "file"; bytes: number; sha256: string }
interface GraphContext {
  id: string;
  sourceFiles: string[];
  roots: { path: string; evidenceRefs: string[] }[];
  compilerSettingsRef: string | null;
  conditionNames: string[];
  moduleSystems: string[];
}

const stageFourAttemptId = "s4-check";
export const stageFourBaselineId = "baseline-check";
const runRef = "run-check";
const snapshotRef = "snapshot-check";
const inventoryRef = "inventory-001";
const planRef = "s2-check-entry-plan";
const knipRunsRef = "s2-check-knip-runs";
const stageThreeAnalysis = "s3-check-entry-analysis";
const stageFourAnalysis = `${stageFourAttemptId}-entry-analysis`;
const evidenceRefs = ["launch-settings"];
const limits = ["Only the saved fixture launch settings and source ranges were reviewed."];
const sourceFiles = [
  { path: "cli.ts", text: "export function start() {}\n", component: "cli" },
  { path: "http.ts", text: "export function orders() {}\n", component: "http" },
];
const gaps = [{ id: "s3-check-unknown-plugin", kind: "entry", reason: "The plugin start path is unknown.",
  subjectRefs: ["plugin-candidate"], evidenceRefs: ["launch-settings#/unresolved"] }];
const candidates = [
  { id: "cli-candidate", expression: "choom serve", path: "cli.ts", workspace: ".", roles: ["application"],
    origin: "script", evidenceRefs: ["launch-settings#/cli"] },
  { id: "plugin-candidate", expression: "plugin command", path: null, workspace: ".", roles: ["application"],
    origin: "unknown", evidenceRefs: ["launch-settings#/unresolved"] },
];
const inspectionPriorities = [{ id: "s3-check-read-handler", priority: 1, subjectRefs: ["http.ts"],
  action: "Read the order handler.", reason: "It serves the saved HTTP route.", evidenceRefs: ["launch-settings#/http/0"] }];
const knipAssessment = { action: "reuse", reason: "The saved Knip inputs still describe this snapshot.", evidenceRefs };

const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const artifactId = (name: string): string => `${stageFourAttemptId}-file@${encodeURIComponent(name)}`;
const jsonText = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";
// Each statement gets its own evidence list. The saved YAML must not use anchors or aliases.
const yamlText = (value: unknown): string => stringify(value, { aliasDuplicateObjects: false });
const statement = <Value>(value: Value): Statement<Value> => ({ value, status: "proposed", evidenceRefs: [...evidenceRefs] });
// The JavaScript and TypeScript files that the Stage 3 source query selects.
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;

// The inventory of the two component files and the extra files.
function inventoryOf(extraFiles: readonly ExtraFile[]): InventoryFile[] {
  return [...sourceFiles, ...extraFiles].map(({ path, text }) =>
    ({ path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }));
}

function write(path: string, text: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function checked(result: CommandResult, label: string): void {
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr}`);
}

function stageEnvironment(work: string, tools: string): Record<string, string> {
  return { CHOOM_TOOLS: tools, CHOOM_WORK: work, CHOOM_STAGE4_ID: stageFourAttemptId,
    CHOOM_STAGE4: join(work, "evidence", stageFourAttemptId) };
}

// The settings record of the run. The fixture record has no compiler settings, so
// it names the Choom parsing profile.
function settingsRecord(work: string, inventoryFiles: InventoryFile[], settings: FixtureSettings): unknown {
  if (settings === "profile") return { formatVersion: 2, snapshotId: snapshotRef, configs: [], packages: [],
    parsingProfile: choomDefaultProfile, gaps: [noProjectSettingsGap(snapshotRef, choomDefaultProfile)] };
  return readProjectSettings({ inventory: { snapshotId: snapshotRef, files: inventoryFiles },
    snapshotRoot: realpathSync(join(work, "snapshot")), extraConfigs: [] }, { tsMorph, parsingProfile: choomDefaultProfile });
}

// The drafts and registered records that a run has after Stage 3 finish. The Stage 2
// preflight record holds the copied Knip plugin patterns of the root workspace.
function writeStageThreeRun(extraFiles: readonly ExtraFile[], settings: FixtureSettings, pluginEntryPatterns: readonly unknown[],
  project?: ReviewedProject, entry = project?.entryPatterns ?? ["cli.ts"]): { root: string; work: string } {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "choom-stage-4-publication-"));
  const work = join(root, "run");
  const artifacts: Record<string, { path: string; sha256: string }> = {};
  const register = (ref: string, path: string, text: string): string => {
    write(join(work, path), text);
    artifacts[ref] = { path, sha256: sha256(text) };
    return sha256(text);
  };
  for (const { path, text } of [...sourceFiles, ...extraFiles]) write(join(work, "snapshot", path), text);
  const inventoryFiles = inventoryOf(extraFiles);
  function priorRanges(stage: 1 | 3) {
    const reviewed = extraFiles.flatMap(({ path, text, priorReview }) => {
      if (priorReview?.stage !== stage) return [];
      const [first, last] = priorReview.lines;
      const excerpt = String(text).split(/\r\n|\r|\n/).slice(first - 1, last)
        .map((line, index) => (first + index) + ": " + line).join("\n");
      const record = { id: `s${stage}-check-source-${encodeURIComponent(path)}`, snapshotRef, path, sha256: sha256(text), lines: priorReview.lines };
      return [{ record, excerpt }];
    });
    if (reviewed.length) register(`s${stage}-check-file@source-excerpts.json`, `evidence/s${stage}-check/source-excerpts.json`,
      jsonText({ formatVersion: 1, snapshotRef, excerpts: reviewed.map(({ record, excerpt }) => ({ ...record, excerpt })) }));
    return reviewed.map(({ record }) => record);
  }
  const inventorySha256 = register(inventoryRef, "evidence/inventory.json",
    jsonText({ formatVersion: 1, snapshotId: snapshotRef, files: inventoryFiles }));
  const referenceBaseline = project?.reference ? { artifactRef: "reference-baseline-001",
    sha256: register("reference-baseline-001", "evidence/reference-baseline.yaml", project.reference) } : null;
  if (project) {
    register("s1-file@evidence%2Fstage1-inputs.json", "evidence/stage1-inputs.json",
      jsonText({ projectKey: project.key, referenceBaseline }));
    register("git-identity-001", "evidence/git-identity.json", jsonText({ formatVersion: 1, snapshotRef,
      gitVersion: null, status: "not-available", reason: "The reviewed fixture has no Git checkout.", gaps: [] }));
  }
  register("s1-file@evidence%2Fproducer.json", "evidence/producer.json", jsonText(producerReceipt(toolsRoot)));
  // Both forms of the settings record have the gaps that Stage 1 saves.
  const settingsValue = settingsRecord(work, inventoryFiles, settings) as { gaps: unknown[] };
  register("settings-001", "evidence/settings.json", jsonText(settingsValue));
  // The gaps that Stage 1 finish adds from the settings record, which later stages keep, and then the gap of the Stage 3 review.
  const priorGaps = [...stageOneGaps.fromRecord({ ...settingsTool, gaps: settingsValue.gaps }), ...gaps];
  // The Stage 1 review. Its role record makes the test folder a test folder.
  register("review-001", "evidence/review.yaml", yamlText({ formatVersion: 1, snapshotRef, reviewedFiles: priorRanges(1),
    roles: [{ selector: "test", roles: ["tests"], basis: "observed", evidenceRefs: [inventoryRef] }],
    workspaceDeclarations: [], questions: [], gaps: [], llmReview: "recorded" }));
  register("launch-settings", "evidence/launch-settings.json",
    jsonText({ cli: "choom serve", http: ["GET /orders"], unresolved: "plugin command" }));
  const planSha256 = register(planRef, "evidence/s2-check/entry-plan.json",
    jsonText({ formatVersion: 1, snapshotRef, workspaces: [{ dir: ".", entry }] }));
  const profileSha256 = register("s2-check-knip-profile", "evidence/s2-check/knip-profile.json", jsonText({ formatVersion: 1,
    snapshotRef, workspaces: { ".": { entry, project: ["**/*.ts"] } } }));
  const preflightSha256 = register("s2-check-knip-preflight", "evidence/s2-check/knip-preflight.json",
    jsonText({ formatVersion: 1, snapshotRef, pluginEntryPatterns, pluginPatternsNotCopied: [], pluginsNotCopied: [] }));
  register(knipRunsRef, "evidence/s2-check/knip-runs.json", jsonText({ formatVersion: 1, snapshotRef,
    profileRef: "s2-check-knip-profile", preflightRef: "s2-check-knip-preflight", runs: [],
    inputDigests: { planSha256, profileSha256, preflightSha256, inventorySha256 } }));
  register("s3-check-file@loading-search.json", "evidence/s3-check/loading-search.json", jsonText({ snapshotRef,
    status: "completed", scope: inventoryFiles.filter(({ path }) => sourceExtension.test(path))
      .map(({ path, sha256: digest }) => ({ path, sha256: digest })) }));
  register(stageThreeAnalysis, "evidence/s3-check/entry-analysis.yaml", yamlText({ formatVersion: 1, kind: "entry-analysis",
    snapshotRef, planRef, knipRunsRef, llmReview: "recorded", reviewedFiles: priorRanges(3), questions: [], gaps: priorGaps, knipAssessment,
    candidates: [...candidates, ...project?.fileEntries ?? []], inspectionPriorities: prioritiesOf(project) }));
  // The summary that the Stage 3 finalizer writes. The Stage 4/5 publisher writes a new one.
  const progress = { inventory: "complete", entryAnalysis: "complete", inspectionPriorities: "complete", baselineRecovery: "pending" };
  const coverage = new RunSummary({ progress, inventory: { files: inventoryFiles }, reviewRef: stageThreeAnalysis,
    issuesRef: stageThreeAnalysis, issues: { questions: [], gaps: priorGaps } }).coverage();
  write(join(work, "run.yaml"), yamlText({ formatVersion: 1, id: runRef, mode: "A", status: "in-progress", progress,
    ...(project ? { projectKey: project.key, referenceBaseline } : {}),
    snapshot: { id: snapshotRef, root: "snapshot", inventoryRef }, coverage, artifacts }));
  write(join(work, "discovery.yaml"), yamlText({ formatVersion: 1, kind: "architecture-discovery", runRef,
    entryAnalysisRef: stageThreeAnalysis, questions: [], gaps: priorGaps }));
  write(join(work, "baseline.yaml"), yamlText({ formatVersion: 1, id: stageFourBaselineId, parentId: null,
    components: [], interfaces: [], resources: [], rules: [] }));
  return { root, work };
}

// A completed phase receipt in the form that the Stage 4 commands write.
function writePhase(attempt: string, phase: string, outputs: Record<string, string>): void {
  const command = { args: [process.execPath, join(toolsRoot, "packages/producer/src/stage-4-commands.ts"), phase],
    cwd: attempt, environment: { CHOOM_STAGE4_ID: stageFourAttemptId, CHOOM_STAGE4: attempt } };
  const started = { formatVersion: 1, attemptId: stageFourAttemptId, phase, action: phase, command,
    startedAt: "2026-01-01T00:00:00.000Z", status: "started" };
  const logs: Record<string, string> = { [`operator-${phase}.started.json`]: jsonText(started),
    [`operator-${phase}.stdout.txt`]: `The ${phase} fixture completed.\n`, [`operator-${phase}.stderr.txt`]: "" };
  for (const [name, text] of Object.entries({ ...outputs, ...logs })) write(join(attempt, name), text);
  const digests = (files: Record<string, string>) =>
    Object.fromEntries(Object.entries(files).map(([name, text]) => [name, sha256(text)]));
  write(join(attempt, `operator-${phase}.json`), jsonText({ ...started, finishedAt: "2026-01-01T00:00:01.000Z",
    status: "completed", exitCode: 0, digests: digests(outputs), logDigests: digests(logs) }));
}

function prioritiesOf(project?: ReviewedProject) {
  return project ? [{ ...inspectionPriorities[0], subjectRefs: ["http.ts", ...project.reviewPaths] }] : inspectionPriorities;
}

function graphOutputs(attempt: string, project?: ReviewedProject): Record<string, string> {
  const profileText = readFileSync(join(attempt, "graph-profile.json"), "utf8");
  const profile = JSON.parse(profileText) as { contexts: GraphContext[] };
  const contexts = profile.contexts.map((context) => {
    const roots = context.roots.map(({ path }) => path);
    const edges = (project?.edges ?? []).filter((edge) => context.sourceFiles.includes(edge.from)).map((edge, index) => ({
      id: `${context.id}-edge-${index}`, from: edge.from, to: edge.to, specifier: edge.specifier,
      targetKind: edge.to === null ? "unresolved" : "internal", dynamic: false, preCompilationOnly: Boolean(edge.type),
      dependencyTypes: edge.type ? ["type-only"] : ["local"], evidenceRefs,
    }));
    const reached = new Set(roots);
    const stopped: string[] = [];
    for (const from of reached) for (const edge of edges.filter((edge) => edge.from === from)) {
      if (edge.to === null) stopped.push(edge.id);
      else reached.add(edge.to);
    }
    return { id: context.id, status: "completed", coverage: "partial", limits, scanFiles: context.sourceFiles,
      roots: context.roots, compilerSettingsRef: context.compilerSettingsRef, conditionNames: context.conditionNames,
      moduleSystems: context.moduleSystems, edges, reachability: { status: "completed-with-limits",
        method: "breadth-first traversal of retained internal source edges",
        edgePolicy: "includes type-only, re-export, and literal-dynamic source dependencies; not runtime execution",
        roots, reached: [...reached].sort(), notReached: context.sourceFiles.filter((path) => !reached.has(path)).sort(),
        stoppedEdges: stopped.sort() } };
  });
  const graph = jsonText({ formatVersion: 1, snapshotRef, attemptId: stageFourAttemptId, profileRef: artifactId("graph-profile.json"),
    status: "completed", coverage: "partial", limits, contexts });
  return graphFiles(profileText, graph);
}

function graphFiles(profileText: string, graph: string): Record<string, string> {
  const graphRun = jsonText({ formatVersion: 1, attemptId: stageFourAttemptId, snapshotRef, status: "completed",
    profileRef: artifactId("graph-profile.json"), profileSha256: sha256(profileText),
    graphRef: artifactId("graph-results.json"), graphSha256: sha256(graph) });
  return { "graph-results.json": graph, "graph-run.json": graphRun };
}

function proposedBaseline(): FixtureBaseline {
  return { formatVersion: 1, id: stageFourBaselineId, parentId: null, interfaces: [], resources: [], rules: [],
    components: sourceFiles.map(({ path, component }) => ({ id: component, name: component,
      purpose: statement(`Serve the saved ${component} entry.`), membership: statement({ paths: [path] }),
      groupingReason: statement("One reviewed entry file.") })) };
}

// The five review records. The code mapping follows the exact paths of the final
// baseline; a file that no membership selects has no owner. The review keeps the gaps
// of the run after Stage 3 (`priorGaps`).
function packetRecords(baseline: FixtureBaseline, graph: { contexts: { id: string }[] }, priorGaps: unknown[],
  extraFiles: readonly ExtraFile[], project?: ReviewedProject): Record<string, unknown> {
  const proposal = artifactId("baseline.proposed.yaml");
  const graphRef = artifactId("graph-results.json");
  const reviewed = new Set(["http.ts", ...project?.reviewPaths ?? []]);
  const inventoryFiles = inventoryOf(extraFiles);
  const earlier = new Set(extraFiles.filter(file => file.priorReview?.stage === 3).map(file => file.path));
  const reviewedFiles = inventoryFiles.filter((file) => reviewed.has(file.path)).map(({ path, sha256 }) =>
    ({ id: `${stageFourAttemptId}-source-${encodeURIComponent(path)}`, snapshotRef, path, sha256, lines: [1, 1] }));
  const units = inventoryFiles.map(({ path, sha256: digest }) => {
    const index = baseline.components.findIndex((item) => item.membership.value.paths.includes(path));
    return { id: `${stageFourAttemptId}-unit-${path.replace(".ts", "")}`, path, sha256: digest, roles: ["source"],
      reason: index < 0 ? "No component membership selects this file." : "The component membership selects this file.",
      inspection: reviewed.has(path) || earlier.has(path) ? "reviewed" : "unreviewed",
      owner: baseline.components[index]?.id ?? null, membershipRef: index < 0 ? null : `${proposal}#/components/${index}/membership`,
      evidenceRefs: [...evidenceRefs] };
  });
  const historicalEntryAnalysisRefs = [stageThreeAnalysis];
  return {
    "baseline.proposed.yaml": baseline,
    "discovery.proposed.yaml": { formatVersion: 1, kind: "architecture-discovery", runRef, entryAnalysisRef: stageFourAnalysis,
      codeMappingRef: artifactId("code-mapping.json"), dependenciesRef: graphRef, resourceAccessRef: artifactId("resource-access.json"),
      overview: { text: "The CLI starts the service, and the HTTP file serves orders.", evidenceRefs: [...evidenceRefs] },
      inspectedPaths: [], questions: [], gaps: priorGaps },
    "entry-analysis.yaml": { formatVersion: 1, kind: "entry-analysis", snapshotRef, previousEntryAnalysisRef: stageThreeAnalysis,
      planRef, knipRunsRef, llmReview: "recorded", reviewedFiles, questions: [], gaps: priorGaps, knipAssessment, candidates: [...candidates, ...project?.fileEntries ?? []],
      inspectionPriorities: prioritiesOf(project), behaviorEntries: [], behaviorEntryCandidatesRef: artifactId("behavior-entry-candidates.json"),
      reachability: { status: "assessed-with-limits",
        method: "context-specific-source-graph-traversal", dependenciesRef: graphRef, reason: "Each context has one saved root.",
        contexts: graph.contexts.map(({ id }, index) => ({ id, resultRef: `${graphRef}#/contexts/${index}/reachability` })) } },
    "code-mapping.json": { formatVersion: 1, kind: "code-mapping", snapshotRef, limits, units,
      scope: { inventoryRef, basis: "all-inventoried-regular-files", unitKind: "file",
        inspectionMeaning: "Reviewed means that the review read a saved range of the file.",
        selectedEntryAnalysisRef: stageFourAnalysis, historicalEntryAnalysisRefs } },
    "resource-access.json": { formatVersion: 1, kind: "resource-observations", snapshotRef, observations: [], limits,
      scope: { method: "source-inspection", reviewedFilesRef: `${stageFourAnalysis}#/reviewedFiles`, historicalEntryAnalysisRefs },
      resourceAccessCandidatesRef: artifactId("resource-access-candidates.json") },
  };
}

function writePacket(review: string, records: Record<string, unknown>): void {
  const texts = Object.entries(records).map(([name, value]): [string, string] =>
    [name, name.endsWith(".json") ? jsonText(value) : yamlText(value)]);
  for (const [name, text] of texts) write(join(review, name), text);
  write(join(review, "llm/analysis-prompt.md"), "Review the saved Stage 4 evidence and propose the components.\n");
  write(join(review, "llm/analysis-response.md"), texts.map(([, text]) => text).join("\n"));
  write(join(review, "llm/analysis-call.yaml"), yamlText({ provider: "fixture", model: "fixture", date: "2026-01-01", settings: "unknown",
    hiddenReasoning: "not-saved" }));
  write(join(review, "llm/review-scope.json"), jsonText({ formatVersion: 1, runRef, snapshotRef, attemptId: stageFourAttemptId,
    suppliedArtifactRefs: [artifactId("artifact-map.json"), "launch-settings"], limits }));
}

function prepareStageFour(root: string, work: string, tools = toolsRoot): StageFourAttempt {
  const attempt = join(work, "evidence", stageFourAttemptId);
  checked(runCli(["stage-4", "start"], stageEnvironment(work, tools), tools), "Stage 4 start");
  writePhase(attempt, "toolchain", { "toolchain-selection.json": jsonText({ formatVersion: 1, status: "approved",
    imageId: "sha256:" + "0".repeat(64), limits: ["The fixture records no Docker image."] }) });
  return { root, work, attempt, tools };
}

// Start the stage and supply the saved graph for a publication fixture.
export function startStageFour(root: string, work: string, tools = toolsRoot, project?: ReviewedProject): StageFourAttempt {
  const fixture = prepareStageFour(root, work, tools);
  writePhase(fixture.attempt, "run", graphOutputs(fixture.attempt, project));
  return fixture;
}

// Prepares the run after Stage 3 with the extra snapshot files and the copied Knip
// plugin patterns of Stage 2, runs Stage 4 start, and writes the toolchain and graph
// phases. The source collection is next.
export function stageFourAttempt(extraFiles: readonly ExtraFile[] = [], tools = toolsRoot,
  settings: FixtureSettings = "profile", pluginEntryPatterns: readonly unknown[] = [], project?: ReviewedProject): StageFourAttempt {
  const { root, work } = writeStageThreeRun(extraFiles, settings, pluginEntryPatterns, project);
  return startStageFour(root, work, tools, project);
}

// Run the same graph collector as the container with the checkout's pinned tools.
export async function stageFourGraphAttempt(files: readonly ExtraFile[], entry: string[]): Promise<StageFourAttempt> {
  const { root, work } = writeStageThreeRun(files, "collected", [], undefined, entry);
  try {
    const fixture = prepareStageFour(root, work);
    const profile = readFileSync(join(fixture.attempt, "graph-profile.json"), "utf8");
    const graph = await collect(JSON.parse(profile), await loadTools(fixture.tools), join(work, "snapshot"));
    if (graph.status !== "completed") throw new Error("Graph collection failed: " + JSON.stringify(graph.contexts.map(pass => pass.limits)));
    writePhase(fixture.attempt, "run", graphFiles(profile, jsonText(graph)));
    return fixture;
  } catch (error) {
    removeScratch(root);
    throw error;
  }
}

// Runs one action of the Stage 4 source collection helper on the attempt, as an operator does.
export function inspectStageFour(fixture: StageFourAttempt, args: readonly string[]): CommandResult {
  return runCli(["stage-4-inspect", ...args], stageEnvironment(fixture.work, fixture.tools), fixture.tools);
}

// Prepares the run and the Stage 4 attempt with the extra snapshot files, and runs the
// source collection. The review packet is next.
export function collectedStageFour(extraFiles: readonly ExtraFile[] = [], tools = toolsRoot,
  project?: ReviewedProject): StageFourAttempt {
  const prepared = stageFourAttempt(extraFiles, tools, "profile", [], project);
  checked(inspectStageFour(prepared, ["collect"]), "Stage 4 collection");
  return prepared;
}

// The review copies each gap that the candidate records of collect require
// (required-gaps.json) into the gaps of the entry analysis and of the discovery, after
// the gaps of Stage 3.
function copyRequiredGaps(records: Record<string, Record<string, unknown>>, prepared: StageFourAttempt): void {
  const { gaps: required } = JSON.parse(readFileSync(join(prepared.attempt, "required-gaps.json"), "utf8")) as { gaps: unknown[] };
  for (const name of ["entry-analysis.yaml", "discovery.proposed.yaml"]) {
    const record = records[name] as { gaps: unknown[] };
    record.gaps = [...record.gaps, ...structuredClone(required)];
  }
}

// Writes the review folder of a collected attempt with the same extra snapshot files.
// `change` edits the proposed baseline and `changeRecords` the five records, by file
// name, before the fixture writes the packet.
export function writeStageFourPacket(prepared: StageFourAttempt, extraFiles: readonly ExtraFile[] = [],
  change: (baseline: FixtureBaseline) => void = () => {}, changeRecords: RecordsChange = () => {},
  project?: ReviewedProject): StageFourPublication {
  const review = join(prepared.root, "review");
  const graph = JSON.parse(readFileSync(join(prepared.attempt, "graph-results.json"), "utf8")) as { contexts: { id: string }[] };
  const baseline = proposedBaseline();
  change(baseline);
  const { gaps: priorGaps } = parse(readFileSync(join(prepared.work, "discovery.yaml"), "utf8")) as { gaps: unknown[] };
  const records = packetRecords(baseline, graph, priorGaps, extraFiles, project) as Record<string, Record<string, unknown>>;
  copyRequiredGaps(records, prepared);
  changeRecords(records, prepared);
  writePacket(review, records);
  return { ...prepared, review };
}

// Prepares the run, the Stage 4 attempt and the review folder. `change` edits the
// proposed baseline and `changeRecords` the five records, by file name, before the
// fixture writes the packet.
export function stageFourPublication(change: (baseline: FixtureBaseline) => void = () => {},
  extraFiles: readonly ExtraFile[] = [], tools = toolsRoot, changeRecords: RecordsChange = () => {},
  project?: ReviewedProject): StageFourPublication {
  return writeStageFourPacket(collectedStageFour(extraFiles, tools, project), extraFiles, change, changeRecords, project);
}

// Runs one Stage 4/5 publisher action on the fixture, as an operator does.
export function publishStageFour(fixture: StageFourPublication, action: "check" | "finish" | "verify"): CommandResult {
  const args = action === "verify" ? ["stage-4-5-publish", action, "4"] : ["stage-4-5-publish", action, "4", fixture.review];
  return runCli(args, stageEnvironment(fixture.work, fixture.tools), fixture.tools);
}
