import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { choomDefaultProfile } from "../../../src/parsing-profile.ts";
import { producerReceipt } from "../../../src/producer-code.ts";
import { noProjectSettingsGap } from "../../../src/stage-1-settings.ts";
import { type CommandResult, runCli, toolsRoot } from "../../support/commands.ts";

// A run after Stage 3 with a complete Stage 4 attempt and a reviewed Stage 4
// packet, for the Stage 4/5 publisher. Stage 4 start and the source collection
// run for real. The toolchain and graph phases need Docker, so this fixture
// writes their outputs and receipts in the form that the collection and the
// publisher read. The records are the smallest that pass every publisher check.
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
export interface StageFourPublication { root: string; work: string; review: string; attempt: string }
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
const inventoryFiles = sourceFiles.map(({ path, text }) => ({ path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }));

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function checked(result: CommandResult, label: string): void {
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr}`);
}

function stageEnvironment(work: string): Record<string, string> {
  return { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: stageFourAttemptId,
    CHOOM_STAGE4: join(work, "evidence", stageFourAttemptId) };
}

// The drafts and registered records that a run has after Stage 3 finish.
function writeStageThreeRun(work: string): void {
  const artifacts: Record<string, { path: string; sha256: string }> = {};
  const register = (ref: string, path: string, text: string): string => {
    write(join(work, path), text);
    artifacts[ref] = { path, sha256: sha256(text) };
    return sha256(text);
  };
  for (const { path, text } of sourceFiles) write(join(work, "snapshot", path), text);
  const inventorySha256 = register(inventoryRef, "evidence/inventory.json",
    jsonText({ formatVersion: 1, snapshotId: snapshotRef, files: inventoryFiles }));
  register("s1-file@evidence%2Fproducer.json", "evidence/producer.json", jsonText(producerReceipt(toolsRoot)));
  // The fixture has no compiler settings, so the settings record names the Choom parsing profile.
  register("settings-001", "evidence/settings.json", jsonText({ formatVersion: 2, snapshotId: snapshotRef, configs: [], packages: [],
    parsingProfile: choomDefaultProfile, gaps: [noProjectSettingsGap(snapshotRef, choomDefaultProfile)] }));
  register("launch-settings", "evidence/launch-settings.json",
    jsonText({ cli: "choom serve", http: ["GET /orders"], unresolved: "plugin command" }));
  const planSha256 = register(planRef, "evidence/s2-check/entry-plan.json",
    jsonText({ formatVersion: 1, snapshotRef, workspaces: [{ dir: ".", entry: ["cli.ts"] }] }));
  const profileSha256 = register("s2-check-knip-profile", "evidence/s2-check/knip-profile.json", jsonText({ formatVersion: 1, snapshotRef }));
  const preflightSha256 = register("s2-check-knip-preflight", "evidence/s2-check/knip-preflight.json",
    jsonText({ formatVersion: 1, snapshotRef }));
  register(knipRunsRef, "evidence/s2-check/knip-runs.json", jsonText({ formatVersion: 1, snapshotRef,
    profileRef: "s2-check-knip-profile", preflightRef: "s2-check-knip-preflight", runs: [],
    inputDigests: { planSha256, profileSha256, preflightSha256, inventorySha256 } }));
  register("s3-check-file@loading-search.json", "evidence/s3-check/loading-search.json", jsonText({ snapshotRef,
    status: "completed", scope: inventoryFiles.map(({ path, sha256: digest }) => ({ path, sha256: digest })) }));
  register(stageThreeAnalysis, "evidence/s3-check/entry-analysis.yaml", yamlText({ formatVersion: 1, kind: "entry-analysis",
    snapshotRef, planRef, knipRunsRef, llmReview: "recorded", reviewedFiles: [], questions: [], gaps, knipAssessment,
    candidates, inspectionPriorities }));
  write(join(work, "run.yaml"), yamlText({ formatVersion: 1, id: runRef, mode: "A", status: "in-progress",
    progress: { inventory: "complete", entryAnalysis: "complete", inspectionPriorities: "complete", baselineRecovery: "pending" },
    snapshot: { id: snapshotRef, root: "snapshot", inventoryRef }, artifacts }));
  write(join(work, "discovery.yaml"), yamlText({ formatVersion: 1, kind: "architecture-discovery", runRef,
    entryAnalysisRef: stageThreeAnalysis, questions: [], gaps }));
  write(join(work, "baseline.yaml"), yamlText({ formatVersion: 1, id: stageFourBaselineId, parentId: null,
    components: [], interfaces: [], resources: [], rules: [] }));
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

// The graph of the saved profile with no edges: each context reaches only its roots.
function graphOutputs(attempt: string): Record<string, string> {
  const profileText = readFileSync(join(attempt, "graph-profile.json"), "utf8");
  const profile = JSON.parse(profileText) as { contexts: GraphContext[] };
  const contexts = profile.contexts.map((context) => {
    const roots = context.roots.map(({ path }) => path);
    return { id: context.id, status: "completed", coverage: "partial", limits, scanFiles: context.sourceFiles,
      roots: context.roots, compilerSettingsRef: context.compilerSettingsRef, conditionNames: context.conditionNames,
      moduleSystems: context.moduleSystems, edges: [], reachability: { status: "completed-with-limits",
        method: "breadth-first traversal of retained internal source edges",
        edgePolicy: "includes type-only, re-export, and literal-dynamic source dependencies; not runtime execution",
        roots, reached: [...roots].sort(), notReached: context.sourceFiles.filter((path) => !roots.includes(path)).sort(),
        stoppedEdges: [] } };
  });
  const graph = jsonText({ formatVersion: 1, snapshotRef, attemptId: stageFourAttemptId, profileRef: artifactId("graph-profile.json"),
    status: "completed", coverage: "partial", limits, contexts });
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

// The five review records. The code mapping follows the exact paths of the final baseline.
function packetRecords(baseline: FixtureBaseline, graph: { contexts: { id: string }[] }): Record<string, unknown> {
  const proposal = artifactId("baseline.proposed.yaml");
  const graphRef = artifactId("graph-results.json");
  const http = inventoryFiles[1];
  const reviewedFiles = [{ id: `${stageFourAttemptId}-source-http.ts`, snapshotRef, path: "http.ts", sha256: http?.sha256, lines: [1, 1] }];
  const units = inventoryFiles.map(({ path, sha256: digest }) => {
    const index = baseline.components.findIndex((item) => item.membership.value.paths.includes(path));
    return { id: `${stageFourAttemptId}-unit-${path.replace(".ts", "")}`, path, sha256: digest, roles: ["source"],
      reason: "The component membership selects this file.", inspection: path === "http.ts" ? "reviewed" : "unreviewed",
      owner: baseline.components[index]?.id ?? null, membershipRef: index < 0 ? null : `${proposal}#/components/${index}/membership`,
      evidenceRefs: [...evidenceRefs] };
  });
  const historicalEntryAnalysisRefs = [stageThreeAnalysis];
  return {
    "baseline.proposed.yaml": baseline,
    "discovery.proposed.yaml": { formatVersion: 1, kind: "architecture-discovery", runRef, entryAnalysisRef: stageFourAnalysis,
      codeMappingRef: artifactId("code-mapping.json"), dependenciesRef: graphRef, resourceAccessRef: artifactId("resource-access.json"),
      overview: { text: "The CLI starts the service, and the HTTP file serves orders.", evidenceRefs: [...evidenceRefs] },
      inspectedPaths: [], questions: [], gaps },
    "entry-analysis.yaml": { formatVersion: 1, kind: "entry-analysis", snapshotRef, previousEntryAnalysisRef: stageThreeAnalysis,
      planRef, knipRunsRef, llmReview: "recorded", reviewedFiles, questions: [], gaps, knipAssessment, candidates,
      inspectionPriorities, behaviorEntries: [], reachability: { status: "assessed-with-limits",
        method: "context-specific-source-graph-traversal", dependenciesRef: graphRef, reason: "Each context has one saved root.",
        contexts: graph.contexts.map(({ id }, index) => ({ id, resultRef: `${graphRef}#/contexts/${index}/reachability` })) } },
    "code-mapping.json": { formatVersion: 1, kind: "code-mapping", snapshotRef, limits, units,
      scope: { inventoryRef, basis: "all-inventoried-regular-files", unitKind: "file",
        inspectionMeaning: "Reviewed means that the review read a saved range of the file.",
        selectedEntryAnalysisRef: stageFourAnalysis, historicalEntryAnalysisRefs } },
    "resource-access.json": { formatVersion: 1, kind: "resource-observations", snapshotRef, observations: [], limits,
      scope: { method: "source-inspection", reviewedFilesRef: `${stageFourAnalysis}#/reviewedFiles`, historicalEntryAnalysisRefs } },
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

// Prepares the run, the Stage 4 attempt and the review folder. `change` edits the
// proposed baseline before the fixture writes the packet.
export function stageFourPublication(change: (baseline: FixtureBaseline) => void = () => {}): StageFourPublication {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "choom-stage-4-publication-"));
  const work = join(root, "run");
  const review = join(root, "review");
  const attempt = join(work, "evidence", stageFourAttemptId);
  writeStageThreeRun(work);
  checked(runCli(["stage-4", "start"], stageEnvironment(work)), "Stage 4 start");
  writePhase(attempt, "toolchain", { "toolchain-selection.json": jsonText({ formatVersion: 1, status: "approved",
    imageId: "sha256:" + "0".repeat(64), limits: ["The fixture records no Docker image."] }) });
  const graph = graphOutputs(attempt);
  writePhase(attempt, "run", graph);
  checked(runCli(["stage-4-inspect", "collect"], stageEnvironment(work)), "Stage 4 collection");
  const baseline = proposedBaseline();
  change(baseline);
  writePacket(review, packetRecords(baseline, JSON.parse(graph["graph-results.json"] ?? "{}") as { contexts: { id: string }[] }));
  return { root, work, review, attempt };
}

// Runs one Stage 4/5 publisher action on the fixture, as an operator does.
export function publishStageFour(fixture: StageFourPublication, action: "check" | "finish" | "verify"): CommandResult {
  const args = action === "verify" ? ["stage-4-5-publish", action, "4"] : ["stage-4-5-publish", action, "4", fixture.review];
  return runCli(args, stageEnvironment(fixture.work));
}
