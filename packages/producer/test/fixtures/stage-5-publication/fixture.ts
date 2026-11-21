import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import { type ExtraFile, publishStageFour, stageFourPublication, type StageFourPublication }
  from "../stage-4-publication/fixture.ts";
import { type CommandResult, runCli, toolsRoot } from "../../support/commands.ts";

// A run after a published Stage 4 review, with a Stage 5 attempt whose start and
// collect ran through the command line, and a reviewed Stage 5 packet in a separate
// folder, for the Stage 4/5 publisher. The packet starts from the published Stage 4
// records. A test changes the proposed baseline, and then the code mapping, whose
// whole-file units the fixture makes from the exact paths of the changed baseline.
type Json = Record<string, unknown>;
interface Position { line: number; column: number }
export type SourceRange = [Position, Position];
interface Statement<Value> { value: Value; status: "proposed"; evidenceRefs: string[] }
export interface SymbolSelector { path: string; symbol: string }
export interface StageFiveComponent {
  id: string;
  name: string;
  purpose: Statement<string>;
  membership: Statement<{ paths: string[]; symbols?: SymbolSelector[] }>;
  groupingReason: Statement<string>;
}
export interface StageFiveBaseline { formatVersion: number; components: StageFiveComponent[]; [field: string]: unknown }
export interface MappingUnit {
  id: string; path: string; owner: string | null; membershipRef: string | null; reason: string;
  unitKind?: string; symbol?: string; ranges?: SourceRange[]; [field: string]: unknown;
}
export interface CodeMapping { scope: Json; units: MappingUnit[]; [field: string]: unknown }
// A run after the published Stage 4 review whose Stage 5 start and collect ran, and the Stage 5 attempt folder.
export interface StageFiveCollection extends StageFourPublication { stageFive: string }
export interface StageFivePublication extends StageFiveCollection { reviewFive: string }
export interface StageFiveChanges {
  baseline?(baseline: StageFiveBaseline): void;
  mapping?(mapping: CodeMapping, baseline: StageFiveBaseline): void;
  // Changes the five records, by file name, after the baseline and the mapping.
  records?(records: Record<string, Json>): void;
}

const stageFiveAttemptId = "s5-check";
const stageFourEntryRef = "s4-check-entry-analysis";
const stageFiveEntryRef = `${stageFiveAttemptId}-entry-analysis`;
const evidenceRefs = ["launch-settings"];
const artifactId = (name: string): string => `${stageFiveAttemptId}-file@${encodeURIComponent(name)}`;
const jsonText = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";
// The saved YAML must not use anchors or aliases.
const yamlText = (value: unknown): string => stringify(value, { aliasDuplicateObjects: false });
const statement = <Value>(value: Value): Statement<Value> => ({ value, status: "proposed", evidenceRefs: [...evidenceRefs] });

// The membership statement of a component of the proposed Stage 5 baseline.
export function membershipRef(baseline: StageFiveBaseline, componentId: string): string {
  const index = baseline.components.findIndex((component) => component.id === componentId);
  if (index < 0) throw new Error(`The proposed baseline has no component ${componentId}.`);
  return `${artifactId("baseline.proposed.yaml")}#/components/${index}/membership`;
}

export function component(id: string, membership: { paths: string[]; symbols?: SymbolSelector[] }): StageFiveComponent {
  return { id, name: id, purpose: statement(`Own the ${id} code.`), membership: statement(membership),
    groupingReason: statement(`The reviewed ${id} source.`) };
}

function stageEnvironment(work: string, tools: string): Record<string, string> {
  return { CHOOM_TOOLS: tools, CHOOM_WORK: work, CHOOM_STAGE5_ID: stageFiveAttemptId,
    CHOOM_STAGE5: join(work, "evidence", stageFiveAttemptId) };
}

function checked(result: CommandResult, label: string): void {
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr}`);
}

// A registered artifact of the published run, as JSON or YAML data.
function published(work: string, ref: string): Json {
  const run = parse(readFileSync(join(work, "run.yaml"), "utf8")) as { artifacts: Record<string, { path: string }> };
  const path = run.artifacts[ref]?.path;
  if (path === undefined) throw new Error(`The published run has no artifact ${ref}.`);
  const text = readFileSync(join(work, path), "utf8");
  return (path.endsWith(".json") ? JSON.parse(text) : parse(text)) as Json;
}

// The whole-file unit of each inventory file: its owner is the component whose paths name it exactly.
function fileUnits(work: string, baseline: StageFiveBaseline, reviewed: Set<string>): MappingUnit[] {
  const inventory = published(work, "inventory-001") as { files: { path: string; sha256: string }[] };
  return inventory.files.map(({ path, sha256 }, index) => {
    const owner = baseline.components.find((item) => item.membership.value.paths.includes(path))?.id ?? null;
    return { id: `${stageFiveAttemptId}-unit-${index + 1}`, path, sha256, roles: ["source"],
      reason: owner === null ? "No component membership selects this file." : "The component membership selects this file.",
      inspection: reviewed.has(path) ? "reviewed" : "unreviewed", owner,
      membershipRef: owner === null ? null : membershipRef(baseline, owner), evidenceRefs: [...evidenceRefs] };
  });
}

// The five review records of Stage 5, made from the published Stage 4 records.
function packetRecords(work: string, changes: StageFiveChanges): Record<string, unknown> {
  const baseline = parse(readFileSync(join(work, "baseline.yaml"), "utf8")) as StageFiveBaseline;
  changes.baseline?.(baseline);
  const priorDiscovery = parse(readFileSync(join(work, "discovery.yaml"), "utf8")) as Json;
  const priorEntry = published(work, stageFourEntryRef);
  const priorMapping = published(work, priorDiscovery.codeMappingRef as string) as { scope: Json };
  const priorAccess = published(work, priorDiscovery.resourceAccessRef as string) as { scope: Json };
  const historicalEntryAnalysisRefs = [stageFourEntryRef, ...priorMapping.scope.historicalEntryAnalysisRefs as string[]];
  const reviewed = new Set((priorEntry.reviewedFiles as { path: string }[]).map(({ path }) => path));
  const mapping: CodeMapping = { ...priorMapping, units: fileUnits(work, baseline, reviewed),
    scope: { ...priorMapping.scope, selectedEntryAnalysisRef: stageFiveEntryRef, historicalEntryAnalysisRefs } };
  changes.mapping?.(mapping, baseline);
  const records: Record<string, Json> = {
    "baseline.proposed.yaml": baseline,
    "discovery.proposed.yaml": { ...priorDiscovery, entryAnalysisRef: stageFiveEntryRef,
      codeMappingRef: artifactId("code-mapping.json"), resourceAccessRef: artifactId("resource-access.json") },
    "entry-analysis.yaml": { ...priorEntry, previousEntryAnalysisRef: stageFourEntryRef, reviewedFiles: [] },
    "code-mapping.json": mapping,
    "resource-access.json": { ...priorAccess, scope: { ...priorAccess.scope,
      reviewedFilesRef: `${stageFiveEntryRef}#/reviewedFiles`, historicalEntryAnalysisRefs } },
  };
  changes.records?.(records);
  return records;
}

const reviewScope = { formatVersion: 1, runRef: "run-check", snapshotRef: "snapshot-check", attemptId: stageFiveAttemptId,
  suppliedArtifactRefs: [artifactId("artifact-map.json"), "launch-settings"], limits: ["The saved Stage 5 evidence only."] };
const callRecord = { provider: "fixture", model: "fixture", date: "2026-01-01", settings: "unknown", hiddenReasoning: "not-saved" };

// The packet folder: the five records, and the LLM records whose response holds the exact text of each record.
function writeReview(review: string, records: Record<string, unknown>): void {
  const files = new Map(Object.entries(records).map(([name, value]) => [name, name.endsWith(".json") ? jsonText(value) : yamlText(value)]));
  const response = [...files.values()].join("\n");
  files.set("llm/analysis-prompt.md", "Review the saved Stage 5 evidence and account for the remaining code.\n");
  files.set("llm/analysis-response.md", response);
  files.set("llm/analysis-call.yaml", yamlText(callRecord));
  files.set("llm/review-scope.json", jsonText(reviewScope));
  for (const [name, text] of files) {
    mkdirSync(dirname(join(review, name)), { recursive: true });
    writeFileSync(join(review, name), text);
  }
}

// Runs one action of the Stage 5 helper on the fixture, as an operator does.
export function runStageFive(fixture: StageFourPublication, args: readonly string[]): CommandResult {
  return runCli(["stage-5", ...args], stageEnvironment(fixture.work, fixture.tools), fixture.tools);
}

// Runs Stage 5 start and collect on a run whose Stage 4 review was published, with
// the command line of the run's tool checkout.
export function collectStageFive(stageFour: StageFourPublication): StageFiveCollection {
  checked(runStageFive(stageFour, ["start"]), "Stage 5 start");
  checked(runStageFive(stageFour, ["collect"]), "Stage 5 collect");
  return { ...stageFour, stageFive: join(stageFour.work, "evidence", stageFiveAttemptId) };
}

// Publishes the Stage 4 review of a run with the extra snapshot files, and runs Stage 5 start and collect,
// with the command line of `tools`.
export function stageFiveCollection(extraFiles: readonly ExtraFile[], tools = toolsRoot): StageFiveCollection {
  const stageFour = stageFourPublication(undefined, extraFiles, tools);
  checked(publishStageFour(stageFour, "finish"), "Stage 4 publication");
  return collectStageFive(stageFour);
}

// Writes the Stage 5 packet of a collected run with the changes, in a separate review folder.
export function writeStageFivePacket(collected: StageFiveCollection, changes: StageFiveChanges = {}): StageFivePublication {
  const reviewFive = join(collected.root, "review-5");
  writeReview(reviewFive, packetRecords(collected.work, changes));
  return { ...collected, reviewFive };
}

// Publishes the Stage 4 review of a run with the extra snapshot files, runs Stage 5
// start and collect, and writes the Stage 5 packet with the changes.
export function stageFivePublication(extraFiles: readonly ExtraFile[], changes: StageFiveChanges = {}, tools = toolsRoot):
StageFivePublication {
  return writeStageFivePacket(stageFiveCollection(extraFiles, tools), changes);
}

// Runs one Stage 4/5 publisher action for Stage 5 on the fixture, as an operator does.
export function publishStageFive(fixture: StageFivePublication, action: "check" | "finish" | "verify"): CommandResult {
  const args = action === "verify" ? ["stage-4-5-publish", action, "5"] : ["stage-4-5-publish", action, "5", fixture.reviewFive];
  return runCli(args, stageEnvironment(fixture.work, fixture.tools), fixture.tools);
}
