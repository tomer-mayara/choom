import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { runCli, toolsRoot } from "./commands.ts";

// A run that Stage 6 completed: the Stage 6 producer fixture, published through
// the producer command line. The model `model` made the readiness review, so the
// LLM call record that Stage 6 saves names that model. Use a fictional model name.
export interface FixtureComponent {
  id: string;
  name: string;
  purpose: { value: string; status: string };
}
export interface FixtureBaseline { id: string; components: FixtureComponent[] }
export interface CompletedRunFixture {
  root: string;
  work: string;
  baselineId: string;
  // The published baseline, relative to the run folder.
  baselinePath: string;
}
type BaselineChange = (baseline: FixtureBaseline) => void;
// The fixture is JavaScript. This local type states only what these tests use.
interface ProducerFixture { root: string; work: string; review: string; baseline: FixtureBaseline }
interface FixtureModule { producerFixture(change?: BaselineChange): ProducerFixture }

const fixtureModule = new URL("../fixtures/entry-points/producer.mjs", import.meta.url);
export const stageSixAttempt = "s6-decisions";

// `change` edits the proposed baseline before Stage 6 starts.
export async function completedRun(model: string, change?: BaselineChange): Promise<CompletedRunFixture> {
  const { producerFixture } = (await import(fixtureModule.href)) as FixtureModule;
  const fixture = producerFixture(change);
  writeFileSync(join(fixture.review, "llm/analysis-call.yaml"), stringify({ provider: "fixture", model, date: "2026-01-01",
    settings: "unknown", hiddenReasoning: "not-saved" }));
  const settings = { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: fixture.work, CHOOM_STAGE6_ID: stageSixAttempt,
    CHOOM_STAGE6: join(fixture.work, "evidence", stageSixAttempt) };
  for (const args of [["start", fixture.review], ["finish"]]) {
    const result = runCli(["stage-6", ...args], settings);
    if (result.status !== 0) throw new Error(`Stage 6 ${args.join(" ")} failed: ${result.stderr}`);
  }
  return { root: fixture.root, work: fixture.work, baselineId: fixture.baseline.id,
    baselinePath: `baselines/${fixture.baseline.id}/baseline.yaml` };
}

export interface DecisionEntry { action: string; itemId: string; field: string; oldValue?: unknown; newValue?: unknown }
export interface DecisionFile {
  formatVersion: number;
  id: string;
  baselineRef: string;
  baselineDigest: string;
  decider: { name: string; kind: string };
  decidedAt: string;
  entries: DecisionEntry[];
}

// The YAML text of a decision file of a person for the published baseline in the
// run folder `run.work`, with the fields of `change` replaced. It starts with a
// YAML comment that names the baseline, as a copied entry does.
export function decisionFileYaml(run: CompletedRunFixture, entries: DecisionEntry[], change: Partial<DecisionFile> = {}): string {
  const digest = createHash("sha256").update(readFileSync(join(run.work, run.baselinePath))).digest("hex");
  return `# Baseline ${run.baselineId}, SHA-256 ${digest}\n` + stringify({ formatVersion: 1, id: "decisions-001",
    baselineRef: run.baselineId, baselineDigest: digest, decider: { name: "Ada Example", kind: "human" },
    decidedAt: "2026-11-15T10:30:00Z", entries, ...change });
}

// A file of a small run folder that a test writes. run.yaml registers it with its
// SHA-256 unless `registered` is false.
export interface RunFile { path: string; text: string; registered?: boolean }

const smallRunBaselineId = "baseline-check";
export const smallRunBaselinePath = `baselines/${smallRunBaselineId}/baseline.yaml`;

// The call record that a stage saves for one LLM call.
export const llmCallRecord = (model: string): string =>
  stringify({ provider: "fixture", model, date: "2026-01-01", settings: "unknown", hiddenReasoning: "not-saved" });

// Writes the files and the run.yaml of a run that Stage 6 completed, with the
// fields of `manifest` replaced. Only the fields that the baseline decide command
// reads are real: the status, the published baseline and the artifact registry.
export function writeSmallCompletedRun(work: string, files: RunFile[], manifest: Record<string, unknown> = {}): void {
  const artifacts: Record<string, { path: string; sha256: string }> = {};
  for (const { path, text, registered } of files) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), text);
    const ref = path === smallRunBaselinePath ? smallRunBaselineId : "file@" + encodeURIComponent(path);
    if (registered !== false) artifacts[ref] = { path, sha256: createHash("sha256").update(text).digest("hex") };
  }
  writeFileSync(join(work, "run.yaml"), stringify({ formatVersion: 1, id: "run-check", mode: "A", status: "completed",
    progress: { inventory: "complete", baselineRecovery: "complete" }, artifacts, baselineRef: smallRunBaselineId,
    discoveryRef: "s6-check-discovery", completedAt: "2026-01-01T00:00:00.000Z", ...manifest }));
}
