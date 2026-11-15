import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { stageThree, stageThreeAttempt, type StageThreeAttempt, stageTwoRun }
  from "../../packages/producer/test/support/stage-3-attempt.ts";
import type { SnapshotFile } from "../../packages/producer/test/support/staged-run.ts";

// The scenarios finish Stage 2 on a small saved snapshot through the command
// line, start Stage 3 and search the snapshot with the Stage 3 text search.
interface TextMatch { path?: unknown; line?: unknown; text?: unknown }
interface CaptureExclusions { ref?: unknown; path?: unknown; rules?: unknown }
interface SearchScope {
  root?: unknown; inventoryRef?: unknown; indexedRegularFiles?: unknown; searchedFiles?: unknown;
  captureExclusions?: CaptureExclusions;
}
interface TextSearchRecord { outcome?: unknown; matches?: TextMatch[]; scope?: SearchScope; tool?: { version?: unknown } }
interface SavedRun { artifacts: Record<string, { path: string }> }

interface SnapshotSearchWorld extends World {
  searchScratch?: string;
  searchAttempt?: StageThreeAttempt;
  searchCommand?: CommandResult;
}

const scriptName = "scripts/worker.mjs";
const missingText = "createInvoice";
const snapshot: SnapshotFile[] = [
  { path: "README.md", text: `Run \`node ${scriptName}\` to start the worker.\n` },
  { path: "app.ts", text: "export const value = 1;\n" },
  { path: "deploy/worker.yaml", text: `services:\n  worker:\n    command: node ${scriptName}\n` },
  { path: scriptName, text: "console.log('Working');\n" },
];

function savedSnapshot(world: SnapshotSearchWorld): void {
  const scratch = makeScratch();
  world.searchScratch = scratch;
  const stageTwoWork = stageTwoRun(scratch, snapshot);
  const folder = join(scratch, "search");
  mkdirSync(folder);
  world.searchAttempt = stageThreeAttempt(stageTwoWork, folder);
}

function currentAttempt(world: SnapshotSearchWorld): StageThreeAttempt {
  assert.ok(world.searchAttempt, "Prepare a saved snapshot first.");
  return world.searchAttempt;
}

function search(world: SnapshotSearchWorld, text: string): void {
  const attempt = currentAttempt(world);
  const start = stageThree(attempt, ["stage-3", "start"]);
  assert.equal(start.status, 0, start.stderr);
  world.searchCommand = stageThree(attempt, ["stage-3", "text-search", text]);
}

// The tool-call record that the first search of the attempt saved.
function savedRecord(world: SnapshotSearchWorld): TextSearchRecord {
  const command = world.searchCommand;
  assert.ok(command, "Search the snapshot first.");
  assert.equal(command.status, 0, command.stderr);
  return JSON.parse(readFileSync(join(currentAttempt(world).folder, "text-search-001.json"), "utf8")) as TextSearchRecord;
}

function savedScope(world: SnapshotSearchWorld): SearchScope {
  const scope = savedRecord(world).scope;
  assert.ok(scope, "The record has no searched scope.");
  return scope;
}

After({ tags: "@producer" }, function (this: SnapshotSearchWorld) {
  if (this.searchScratch) removeScratch(this.searchScratch);
});

Given("a saved snapshot whose deployment file names a worker script", { timeout: 120_000 },
  function (this: SnapshotSearchWorld) {
    savedSnapshot(this);
  });

Given("a saved snapshot", { timeout: 120_000 }, function (this: SnapshotSearchWorld) {
  savedSnapshot(this);
});

When("the operator searches the snapshot for that script name", { timeout: 60_000 }, function (this: SnapshotSearchWorld) {
  search(this, scriptName);
});

When("the operator searches for text that is not in it", { timeout: 60_000 }, function (this: SnapshotSearchWorld) {
  search(this, missingText);
});

Then("the result lists the file, line and text of each match", function (this: SnapshotSearchWorld) {
  const record = savedRecord(this);
  assert.equal(record.outcome, "match");
  assert.deepEqual((record.matches ?? []).map(({ path, line, text }) => ({ path, line, text })), [
    { path: "README.md", line: 1, text: `Run \`node ${scriptName}\` to start the worker.` },
    { path: "deploy/worker.yaml", line: 3, text: `    command: node ${scriptName}` },
  ]);
});

Then("it records the searched scope and the ripgrep version", function (this: SnapshotSearchWorld) {
  const record = savedRecord(this);
  const { root, inventoryRef, indexedRegularFiles, searchedFiles } = savedScope(this);
  assert.deepEqual({ root, inventoryRef, indexedRegularFiles, searchedFiles },
    { root: "snapshot", inventoryRef: "inventory-001", indexedRegularFiles: snapshot.length, searchedFiles: snapshot.length });
  assert.match(String(record.tool?.version), /^ripgrep \d+\.\d+\.\d+\b/);
  // Stage 3 start records the same ripgrep in the attempt's tool versions.
  const handoff = JSON.parse(readFileSync(join(currentAttempt(this).folder, "handoff.json"), "utf8")) as
    { versions?: { ripgrep?: { version?: unknown } } };
  assert.equal(handoff.versions?.ripgrep?.version, record.tool?.version);
});

Then("the result says that there is no match", function (this: SnapshotSearchWorld) {
  const record = savedRecord(this);
  assert.equal(record.outcome, "no-match");
  assert.deepEqual(record.matches, []);
});

Then("it names the searched files and the capture exclusions", function (this: SnapshotSearchWorld) {
  const { work } = currentAttempt(this);
  const scope = savedScope(this);
  // The scope names the registered inventory, which lists each searched file.
  const run = parse(readFileSync(join(work, "run.yaml"), "utf8")) as SavedRun;
  const inventory = run.artifacts[String(scope.inventoryRef)];
  assert.ok(inventory, "The scope names no registered inventory.");
  const files = (JSON.parse(readFileSync(join(work, inventory.path), "utf8")) as { files: { path: string }[] }).files;
  assert.deepEqual(files.map(({ path }) => path), snapshot.map(({ path }) => path).sort());
  assert.equal(scope.searchedFiles, files.length);
  const rules = readFileSync(join(work, "exclusions.txt"), "utf8").split("\n").filter((line) => line !== "");
  const { ref, path, rules: savedRules } = scope.captureExclusions ?? {};
  assert.deepEqual({ ref, path, rules: savedRules }, { ref: "exclusions-001", path: "exclusions.txt", rules });
});
