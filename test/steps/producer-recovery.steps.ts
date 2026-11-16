import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { publishStageFour, stageFourBaselineId, stageFourPublication, type StageFourPublication }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";
import { type StageSixFixture, stageSixFixture } from "../../packages/producer/test/support/stage-6-run.ts";
import { copyToolCheckout } from "../../packages/producer/test/support/tool-checkout.ts";
import { pathWithDoubles } from "../../packages/producer/test/support/tool-doubles.ts";
import { checkBaselineDisplayLimits } from "../../src/lib/baseline-display-limits.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";

interface FixtureComponent {
  id: string;
  membership: { value: { paths: string[] } };
}
interface FixtureBaseline { id: string; components: FixtureComponent[] }
type ProducerFixture = StageSixFixture<FixtureBaseline>;
type BaselineChange = (baseline: FixtureBaseline) => void;
interface RegisteredArtifact { path: string; sha256: string }
interface SavedRun {
  id: string;
  status: string;
  progress: Record<string, string>;
  baselineRef?: string;
  discoveryRef?: string;
  completedAt?: string;
  artifacts: Record<string, RegisteredArtifact>;
}
interface PublishedPaths { status: string; baselinePath: string; discoveryPath: string }
interface Statement { value: unknown; status: string; evidenceRefs: unknown }
// A new Stage 1 run in a scratch folder: a small target, the run folder and the tool checkout.
interface StageOneRun { root: string; target: string; work: string; tools: string }

interface RecoveryWorld extends World {
  producerRun?: ProducerFixture;
  savedFilesBefore?: [string, string][];
  saveCommands?: SpawnSyncReturns<string>[];
  stageOneRun?: StageOneRun;
  stageOneCommand?: SpawnSyncReturns<string>;
  stageFourRun?: StageFourPublication;
  publishCommand?: CommandResult;
}

const tools = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const producerCli = join(tools, "packages/producer/src/cli.ts");
const attempt = "s6-acceptance";
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function reviewedDraft(change?: BaselineChange): Promise<ProducerFixture> {
  return stageSixFixture<FixtureBaseline>(change);
}

function stageSixCommand(run: ProducerFixture, action: string, ...args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("node", [producerCli, "stage-6", action, ...args], {
    encoding: "utf8",
    env: { ...process.env, CHOOM_TOOLS: tools, CHOOM_WORK: run.work, CHOOM_STAGE6_ID: attempt,
      CHOOM_STAGE6: join(run.work, "evidence", attempt) },
  });
  assert.ifError(result.error);
  return result;
}

function newStageOneRun(root: string, checkout = tools): StageOneRun {
  const target = join(root, "target");
  mkdirSync(target);
  writeFileSync(join(target, "app.ts"), "export const value = 1;\n");
  return { root, target, work: join(root, "run"), tools: checkout };
}

function scratchFolder(): string {
  return mkdtempSync(join(realpathSync(tmpdir()), "choom-producer-code-"));
}

function stageOneCommand(run: StageOneRun, action: string, env: Record<string, string> = {}): SpawnSyncReturns<string> {
  const result = spawnSync("node", [join(run.tools, "packages/producer/src/cli.ts"), "stage-1", action], {
    encoding: "utf8",
    env: { ...process.env, CHOOM_TOOLS: run.tools, CHOOM_WORK: run.work, CHOOM_TARGET: run.target,
      CHOOM_RUN_ID: "run-acceptance", CHOOM_SNAPSHOT_ID: "snapshot-acceptance", CHOOM_BASELINE_ID: "baseline-acceptance",
      ...env },
  });
  assert.ifError(result.error);
  return result;
}

// The code digest that the record format defines: SHA-256 over one "<file SHA-256>  <path>" line
// for each regular file in the two code folders, in byte order of the paths.
function codeDigest(root: string): string {
  const paths = ["packages/producer/src", "packages/baseline-model/src"].flatMap((folder) =>
    readdirSync(join(root, folder), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name))));
  paths.sort((first, second) => Buffer.compare(Buffer.from(first), Buffer.from(second)));
  return sha256(Buffer.from(paths.map((path) => `${sha256(readFileSync(join(root, path)))}  ${path}\n`).join("")));
}

function gitCommit(root: string): string {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return head.status === 0 ? head.stdout.trim() : "not-available";
}

function producerRecord(run: StageOneRun): Record<string, unknown> {
  const path = join(run.work, "evidence/producer.json");
  assert.ok(existsSync(path), "The run has no producer code record.");
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

// Every saved directory and file digest, so a refused save can show that nothing changed.
function savedFiles(root: string, prefix = ""): [string, string][] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry): [string, string][] => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return [[path, "directory"], ...savedFiles(root, path)];
      return [[path, sha256(readFileSync(join(root, path)))]];
    });
}

function statements(value: unknown): Statement[] {
  if (Array.isArray(value)) return value.flatMap(statements);
  if (value === null || typeof value !== "object") return [];
  if (["value", "status", "evidenceRefs"].every((key) => Object.hasOwn(value, key))) return [value as Statement];
  return Object.values(value).flatMap(statements);
}

function currentStageOneRun(world: RecoveryWorld): StageOneRun {
  assert.ok(world.stageOneRun, "Prepare a new run first.");
  return world.stageOneRun;
}

function lastStageOneCommand(world: RecoveryWorld): SpawnSyncReturns<string> {
  assert.ok(world.stageOneCommand, "Run a Stage 1 action first.");
  return world.stageOneCommand;
}

function currentRun(world: RecoveryWorld): ProducerFixture {
  assert.ok(world.producerRun, "Prepare a reviewed Stage 5 draft first.");
  return world.producerRun;
}

function currentStageFourRun(world: RecoveryWorld): StageFourPublication {
  assert.ok(world.stageFourRun, "Prepare a Stage 4 draft first.");
  return world.stageFourRun;
}

function lastPublishCommand(world: RecoveryWorld): CommandResult {
  assert.ok(world.publishCommand, "Publish the Stage 4 draft first.");
  return world.publishCommand;
}

function savedRun(run: ProducerFixture): SavedRun {
  return parse(readFileSync(join(run.work, "run.yaml"), "utf8")) as SavedRun;
}

function publishedPaths(world: RecoveryWorld): PublishedPaths {
  const commands = world.saveCommands ?? [];
  assert.equal(commands.length, 2, "Expected start and finish commands.");
  for (const command of commands) assert.equal(command.status, 0, command.stderr);
  return JSON.parse(commands[1]?.stdout ?? "") as PublishedPaths;
}

After({ tags: "@producer" }, function (this: RecoveryWorld) {
  if (this.producerRun) rmSync(this.producerRun.root, { recursive: true, force: true });
  if (this.stageOneRun) rmSync(this.stageOneRun.root, { recursive: true, force: true });
  if (this.stageFourRun) rmSync(this.stageFourRun.root, { recursive: true, force: true });
});

Given("a reviewed Stage 5 draft( for a small fixture repository)", async function (this: RecoveryWorld) {
  this.producerRun = await reviewedDraft();
});

Given("a reviewed Stage 5 draft in which a file has two owners", async function (this: RecoveryWorld) {
  this.producerRun = await reviewedDraft((baseline) => {
    const http = baseline.components.find((component) => component.id === "http");
    assert.ok(http, "The fixture has an http component.");
    http.membership.value.paths.push("cli.ts");
  });
});

When("the operator saves the result", function (this: RecoveryWorld) {
  const run = currentRun(this);
  this.savedFilesBefore = savedFiles(run.work);
  const started = stageSixCommand(run, "start", run.review);
  this.saveCommands = started.status === 0 ? [started, stageSixCommand(run, "finish")] : [started];
});

Then("a fixed baseline and discovery result are saved by digest", function (this: RecoveryWorld) {
  const run = currentRun(this);
  const published = publishedPaths(this);
  assert.equal(published.status, "stage6-published");
  const record = savedRun(run);
  assert.equal(published.baselinePath, `baselines/${run.baseline.id}/baseline.yaml`);
  assert.equal(published.discoveryPath, `runs/${record.id}/discovery.yaml`);
  const fixedRecords: [string | undefined, string][] = [[record.baselineRef, published.baselinePath],
    [record.discoveryRef, published.discoveryPath]];
  for (const [ref, path] of fixedRecords) {
    assert.ok(ref, "The run names the fixed record.");
    assert.deepEqual(record.artifacts[ref], { path, sha256: sha256(readFileSync(join(run.work, path))) });
  }
  assert.deepEqual(readFileSync(join(run.work, published.baselinePath)), readFileSync(join(run.work, "baseline.yaml")));
  const verified = stageSixCommand(run, "verify");
  assert.equal(verified.status, 0, verified.stderr);
  assert.partialDeepStrictEqual(JSON.parse(verified.stdout), { status: "stage6-completed-verified", writes: [] });
});

Then("every statement in the baseline stays proposed", function (this: RecoveryWorld) {
  const run = currentRun(this);
  const saved = parse(readFileSync(join(run.work, publishedPaths(this).baselinePath), "utf8")) as unknown;
  const found = statements(saved);
  assert.ok(found.length > 0, "The fixed baseline has statements.");
  for (const statement of found) {
    assert.equal(statement.status, "proposed");
    assert.equal(Object.hasOwn(statement, "acceptanceRef"), false);
  }
});

Then("the run records that recovery is complete", function (this: RecoveryWorld) {
  const record = savedRun(currentRun(this));
  assert.equal(record.status, "completed");
  assert.equal(record.progress.baselineRecovery, "complete");
  assert.equal(record.baselineRef, currentRun(this).baseline.id);
  assert.ok(record.discoveryRef);
  assert.ok(Number.isFinite(Date.parse(record.completedAt ?? "")), "The run records when recovery completed.");
});

Then("nothing is saved", function (this: RecoveryWorld) {
  const commands = this.saveCommands ?? [];
  assert.equal(commands.length, 1, "A refused start stops the save.");
  assert.notEqual(commands[0]?.status, 0);
  assert.deepEqual(savedFiles(currentRun(this).work), this.savedFilesBefore);
});

Then("the operator is told which file has two owners", function (this: RecoveryWorld) {
  const message = this.saveCommands?.[0]?.stderr ?? "";
  assert.match(message, /\bcli\.ts\b/);
  assert.doesNotMatch(message, /\b(http|mcp)\.ts\b/);
});

// The viewer opens a baseline with its decoder and then checks its display limits.
Then("the viewer accepts the saved baseline without errors", function (this: RecoveryWorld) {
  const text = readFileSync(join(currentRun(this).work, publishedPaths(this).baselinePath), "utf8");
  const decoded = decodeBaselineYaml(text);
  assert.equal(decoded.status, "success", decoded.status === "failure" ? decoded.message : "");
  assert.deepEqual(decoded.baseline, parse(text), "The viewer keeps every saved value.");
  assert.doesNotThrow(() => checkBaselineDisplayLimits(decoded.baseline));
});

Given("a Stage 4 draft with a component whose ID is the baseline ID", function (this: RecoveryWorld) {
  this.stageFourRun = stageFourPublication((baseline) => {
    const http = baseline.components.find((component) => component.id === "http");
    assert.ok(http, "The fixture has an http component.");
    http.id = baseline.id;
  });
});

When("the operator publishes the Stage 4 draft", function (this: RecoveryWorld) {
  const run = currentStageFourRun(this);
  this.savedFilesBefore = savedFiles(run.work);
  this.publishCommand = publishStageFour(run, "finish");
});

Then("the draft is refused", function (this: RecoveryWorld) {
  const command = lastPublishCommand(this);
  assert.equal(command.status, 1, command.stdout);
  assert.deepEqual(savedFiles(currentStageFourRun(this).work), this.savedFilesBefore);
});

Then("the operator is told which ID is reserved", function (this: RecoveryWorld) {
  const message = lastPublishCommand(this).stderr;
  assert.ok(message.includes(stageFourBaselineId), message);
  assert.match(message, /\breserved\b/);
});

Given("a new run", function (this: RecoveryWorld) {
  this.stageOneRun = newStageOneRun(scratchFolder());
});

When("the operator starts Stage 1", function (this: RecoveryWorld) {
  this.stageOneCommand = stageOneCommand(currentStageOneRun(this), "start");
});

Then("the run records the producer version and a digest of its code", function (this: RecoveryWorld) {
  const run = currentStageOneRun(this);
  const started = lastStageOneCommand(this);
  assert.equal(started.status, 0, started.stderr);
  const manifest = JSON.parse(readFileSync(join(run.tools, "packages/producer/package.json"), "utf8")) as { version: string };
  assert.deepEqual(producerRecord(run), { formatVersion: 1, package: "@choom/producer", version: manifest.version,
    codeDigest: codeDigest(run.tools), commit: gitCommit(run.tools) });
});

Given("a run that started with one version of the producer code", function (this: RecoveryWorld) {
  const root = scratchFolder();
  this.stageOneRun = newStageOneRun(root, copyToolCheckout(root));
  const started = stageOneCommand(this.stageOneRun, "start");
  assert.equal(started.status, 0, started.stderr);
});

Given("the producer code has changed since then", function (this: RecoveryWorld) {
  appendFileSync(join(currentStageOneRun(this).tools, "packages/baseline-model/src/baseline.ts"), "// A later change.\n");
});

When("the operator starts the next stage action", function (this: RecoveryWorld) {
  const run = currentStageOneRun(this);
  this.savedFilesBefore = savedFiles(run.work);
  // The rsync double lets the capture run on a computer without rsync.
  this.stageOneCommand = stageOneCommand(run, "capture", { PATH: pathWithDoubles(run.root) });
});

Then("the action is refused", function (this: RecoveryWorld) {
  const action = lastStageOneCommand(this);
  assert.equal(action.status, 1, action.stdout);
  assert.deepEqual(savedFiles(currentStageOneRun(this).work), this.savedFilesBefore);
});

Then("the operator is told that the producer code changed", function (this: RecoveryWorld) {
  const message = lastStageOneCommand(this).stderr;
  assert.match(message, /^The producer code changed after this run started\./);
  assert.ok(message.includes(`commit ${String(producerRecord(currentStageOneRun(this)).commit)}`), message);
});
