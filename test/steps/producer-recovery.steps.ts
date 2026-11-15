import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";

interface FixtureComponent {
  id: string;
  membership: { value: { paths: string[] } };
}
interface ProducerFixture {
  root: string;
  work: string;
  review: string;
  baseline: { id: string; components: FixtureComponent[] };
}
type BaselineChange = (baseline: ProducerFixture["baseline"]) => void;
interface FixtureModule { producerFixture(change?: BaselineChange): ProducerFixture }
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

interface RecoveryWorld extends World {
  producerRun?: ProducerFixture;
  savedFilesBefore?: [string, string][];
  saveCommands?: SpawnSyncReturns<string>[];
}

const tools = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const stageSix = join(tools, "docs/design/app-a/stage-6-commands.mjs");
// The fixture is JavaScript. This local type states only what these steps use.
const fixtureModule = new URL("../fixtures/entry-points/producer.mjs", import.meta.url);
const attempt = "s6-acceptance";
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

async function reviewedDraft(change?: BaselineChange): Promise<ProducerFixture> {
  const { producerFixture } = (await import(fixtureModule.href)) as FixtureModule;
  return producerFixture(change);
}

function stageSixCommand(run: ProducerFixture, action: string, ...args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("node", [stageSix, action, ...args], {
    encoding: "utf8",
    env: { ...process.env, CHOOM_TOOLS: tools, CHOOM_WORK: run.work, CHOOM_STAGE6_ID: attempt,
      CHOOM_STAGE6: join(run.work, "evidence", attempt) },
  });
  assert.ifError(result.error);
  return result;
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

function currentRun(world: RecoveryWorld): ProducerFixture {
  assert.ok(world.producerRun, "Prepare a reviewed Stage 5 draft first.");
  return world.producerRun;
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
});

Given("a reviewed Stage 5 draft for a small fixture repository", async function (this: RecoveryWorld) {
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
