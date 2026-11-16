import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { helperCall } from "../../src/cli.ts";
import { type CommandResult, runCli, toolsRoot } from "./commands.ts";

// Stage 6 on the Stage 6 producer fixture (fixtures/entry-points/producer.mjs): a
// run after Stage 5 with a reviewed readiness packet in a separate folder. The
// actions run through the producer command line, as an operator runs them, so
// these helpers do not name the file of the Stage 6 helper.
export interface StageSixFixture<Baseline = BaselineId> {
  root: string;
  // The run folder and the folder of the readiness packet.
  work: string;
  review: string;
  // The proposed baseline of the drafts.
  baseline: Baseline;
}
interface BaselineId { id: string }
// The fixture is JavaScript. Each caller states the baseline fields that it uses.
interface FixtureModule<Baseline> { producerFixture(change?: (baseline: Baseline) => void): StageSixFixture<Baseline> }
// The receipts of a Stage 6 action record the helper process that ran it.
export interface CommandRecord { args: string[]; cwd: string; environment: Record<string, string> }

const fixtureModule = new URL("../fixtures/entry-points/producer.mjs", import.meta.url);

// A new copy of the fixture in a scratch folder. `change` edits the proposed
// baseline before the fixture saves the drafts.
export async function stageSixFixture<Baseline = BaselineId>(change?: (baseline: Baseline) => void):
Promise<StageSixFixture<Baseline>> {
  const { producerFixture } = (await import(fixtureModule.href)) as FixtureModule<Baseline>;
  return producerFixture(change);
}

// The settings of the Stage 6 attempt `id` of the run in `work`.
function stageSixSettings(work: string, id: string): Record<string, string> {
  return { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE6_ID: id, CHOOM_STAGE6: join(work, "evidence", id) };
}

// Runs one Stage 6 action of the attempt `id` with the command line of `tools`.
// `settings` replaces or adds settings.
export function stageSix(work: string, id: string, args: readonly string[], settings: Record<string, string> = {},
  tools = toolsRoot): CommandResult {
  return runCli(["stage-6", ...args], { ...stageSixSettings(work, id), ...settings }, tools);
}

// The node on PATH, which runs the command line. The command line starts the same
// program for the helper, by its full path.
const node = JSON.parse(spawnSync("node", ["-p", "JSON.stringify({ program: process.execPath, version: process.version })"],
  { encoding: "utf8" }).stdout) as { program: string; version: string };
export const nodeVersion = node.version;

// The command record of a Stage 6 action in this checkout: the arguments of the
// helper process, the folder that it ran in, and the four settings.
export function stageSixCommandRecord(work: string, id: string, args: readonly string[]): CommandRecord {
  const call = helperCall(["stage-6", ...args], node.program);
  if (call === undefined) throw new Error("The producer command line has no stage-6 command.");
  return { args: [call.program, ...call.args], cwd: process.cwd(),
    environment: { CHOOM_WORK: work, CHOOM_TOOLS: toolsRoot, CHOOM_STAGE6_ID: id, CHOOM_STAGE6: join(work, "evidence", id) } };
}

export const jsonText = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

// The fixed records of the fixture.
export const fixtureRecords = { runRef: "fixture-run", snapshotRef: "fixture-snapshot", baselineRef: "fixture-baseline",
  baselinePath: "baselines/fixture-baseline/baseline.yaml", discoveryPath: "runs/fixture-run/discovery.yaml" };

// The validation result that every Stage 6 action of the fixture reports.
export function fixtureValidation(id: string): Record<string, unknown> {
  const { runRef, snapshotRef, baselineRef } = fixtureRecords;
  return { formatVersion: 1, attemptId: id, runRef, snapshotRef, baselineRef, status: "verified",
    registeredArtifactsVerified: 15, indexedFilesVerified: 3, evidenceRefsResolved: 42, sourceRecordsVerified: 1, graphContexts: 1,
    mappedFiles: 3, unknownOwners: 0, components: 3, interfaces: 1, resources: 0, rules: 0, behaviorEntries: 1, inspectedPaths: 0,
    observations: 0, questions: 0, gaps: 1, limits: [
      "Deterministic records, digests, source ranges and references only. No target execution or new tool analysis.",
      "The separate readiness review records semantic judgments and limits. Proposed intent remains proposed.",
    ] };
}

// The result of a successful finish of the attempt `id` of the fixture.
export function publishedResult(id: string): Record<string, unknown> {
  const { baselinePath, discoveryPath } = fixtureRecords;
  return { ...fixtureValidation(id), status: "stage6-published", baselinePath, discoveryPath, discoveryRef: `${id}-discovery`,
    writes: ["operator-finish.started.json", "operator-finish.json", baselinePath, discoveryPath, "discovery.yaml", "run.yaml"] };
}

// A copy of the fixture after a successful Stage 6 start of the attempt `id`.
export async function startedFixture(id: string): Promise<StageSixFixture> {
  const fixture = await stageSixFixture();
  const started = stageSix(fixture.work, id, ["start", fixture.review]);
  if (started.status !== 0) throw new Error(`Stage 6 start failed: ${started.stderr}`);
  return fixture;
}

// A copy of the fixture after a successful Stage 6 start and finish of the attempt `id`.
export async function publishedFixture(id: string): Promise<StageSixFixture> {
  const fixture = await startedFixture(id);
  const finished = stageSix(fixture.work, id, ["finish"]);
  if (finished.status !== 0) throw new Error(`Stage 6 finish failed: ${finished.stderr}`);
  return fixture;
}

// The working discovery of the fixture and the registered files of Stage 5 that a
// test can give new text.
export const stageFiveFiles = { discovery: "discovery.yaml", proposal: "evidence/s5-fixture/discovery.proposed.yaml",
  entryAnalysis: "evidence/s5-fixture/entry-analysis.yaml" };

// Gives files of the run new text before Stage 6 starts, as Stage 5 could have
// saved them. `files` maps a path in the run folder to its new text. run.yaml and
// the readiness review then name the new SHA-256 of each changed file and of
// run.yaml, so Stage 6 checks the new text.
export function rewriteStageFiveFiles(fixture: StageSixFixture, files: Record<string, string>): void {
  const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
  const digests = new Map<string, string>();
  const replaceDigests = (text: string): string =>
    [...digests].reduce((current, [before, after]) => current.replaceAll(before, after), text);
  for (const [path, text] of Object.entries(files)) {
    digests.set(sha256(readFileSync(join(fixture.work, path))), sha256(text));
    writeFileSync(join(fixture.work, path), text);
  }
  const run = readFileSync(join(fixture.work, "run.yaml"), "utf8");
  const nextRun = replaceDigests(run);
  digests.set(sha256(run), sha256(nextRun));
  writeFileSync(join(fixture.work, "run.yaml"), nextRun);
  for (const name of ["readiness.yaml", "llm/analysis-response.md"])
    writeFileSync(join(fixture.review, name), replaceDigests(readFileSync(join(fixture.review, name), "utf8")));
}
