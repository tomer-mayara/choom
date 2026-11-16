import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { stageThree, stageThreeAttempt, type StageThreeAttempt, stageTwoRun }
  from "../../packages/producer/test/support/stage-3-attempt.ts";
import type { SnapshotFile } from "../../packages/producer/test/support/staged-run.ts";

// The scenarios finish Stage 2 on a small saved snapshot through the command line,
// start Stage 3 and ask for the exports of one source file. The run has the
// settings record that the Stage 1 collector makes for the snapshot.
interface Position { line?: unknown; column?: unknown }
interface ListedExport { name?: unknown; kind?: unknown; typeOnly?: unknown; range?: Position[] }
interface ProjectGap { kind?: unknown; input?: unknown; missing?: unknown; reason?: unknown }
interface ExportsRecord {
  status?: unknown; path?: unknown; compilerSettingsRef?: unknown; exports?: ListedExport[]; gaps?: ProjectGap[];
}

interface SourceStructureWorld extends World {
  structureScratch?: string;
  structureAttempt?: StageThreeAttempt;
  exportsCommand?: CommandResult;
}

const app: SnapshotFile = { path: "app.ts", text: "export const value = 1;\n" };
const invoicePath = "src/invoice.ts";
const invoice = "export type Invoice = { id: string; total: number };\n\n" +
  "export function createInvoice(id: string): Invoice {\n  return { id, total: 0 };\n}\n";
// The compiler settings name a declaration file that the capture did not save.
const missingDeclaration = "types/env.d.ts";
const compilerSettings: SnapshotFile = { path: "tsconfig.json",
  text: JSON.stringify({ compilerOptions: { strict: true }, files: [app.path, missingDeclaration] }, null, 2) + "\n" };

function savedRun(world: SourceStructureWorld, snapshot: SnapshotFile[]): void {
  const scratch = makeScratch();
  world.structureScratch = scratch;
  const stageTwoWork = stageTwoRun(scratch, snapshot);
  const folder = join(scratch, "exports");
  mkdirSync(folder);
  world.structureAttempt = stageThreeAttempt(stageTwoWork, folder);
}

function askForExports(world: SourceStructureWorld, path: string): void {
  const attempt = world.structureAttempt;
  assert.ok(attempt, "Prepare a saved snapshot first.");
  const start = stageThree(attempt, ["stage-3", "start"]);
  assert.equal(start.status, 0, start.stderr);
  world.exportsCommand = stageThree(attempt, ["stage-3", "exports", path]);
}

// The record that the first exports request of the attempt saved.
function exportsRecord(world: SourceStructureWorld): ExportsRecord {
  const command = world.exportsCommand;
  assert.ok(command && world.structureAttempt, "Ask for the exports first.");
  assert.equal(command.status, 0, command.stderr);
  return JSON.parse(readFileSync(join(world.structureAttempt.folder, "exports-001.json"), "utf8")) as ExportsRecord;
}

After({ tags: "@producer" }, function (this: SourceStructureWorld) {
  if (this.structureScratch) removeScratch(this.structureScratch);
});

Given("a saved snapshot with a file that exports a function and a type", { timeout: 120_000 },
  function (this: SourceStructureWorld) {
    savedRun(this, [app, { path: invoicePath, text: invoice }]);
  });

Given("a saved snapshot whose compiler settings name a declaration file that was not captured", { timeout: 120_000 },
  function (this: SourceStructureWorld) {
    savedRun(this, [app, compilerSettings]);
  });

When("the operator asks for the exports of that file", { timeout: 60_000 }, function (this: SourceStructureWorld) {
  askForExports(this, invoicePath);
});

When("the operator opens the source project", { timeout: 60_000 }, function (this: SourceStructureWorld) {
  askForExports(this, app.path);
});

Then("the result lists both exports with their kinds and source ranges", function (this: SourceStructureWorld) {
  const record = exportsRecord(this);
  assert.equal(record.path, invoicePath);
  // A range starts at the first character of the export and ends after its last character.
  assert.deepEqual((record.exports ?? []).map(({ name, kind, typeOnly, range }) => ({ name, kind, typeOnly, range })), [
    { name: "Invoice", kind: "type", typeOnly: true, range: [{ line: 1, column: 1 }, { line: 1, column: 53 }] },
    { name: "createInvoice", kind: "function", typeOnly: false, range: [{ line: 3, column: 1 }, { line: 5, column: 2 }] },
  ]);
});

Then("the project opens", function (this: SourceStructureWorld) {
  const record = exportsRecord(this);
  assert.deepEqual({ status: record.status, path: record.path, compilerSettingsRef: record.compilerSettingsRef,
    exports: (record.exports ?? []).map(({ name }) => name) },
  { status: "completed", path: app.path, compilerSettingsRef: "settings-001#/configs/0", exports: ["value"] });
});

Then("a gap names the missing declaration file", function (this: SourceStructureWorld) {
  const gaps = (exportsRecord(this).gaps ?? []).filter(({ missing }) => missing === missingDeclaration);
  assert.equal(gaps.length, 1, "No gap names " + missingDeclaration + ".");
  const [gap] = gaps;
  assert.deepEqual({ kind: gap?.kind, input: gap?.input }, { kind: "missing-compiler-input", input: "files" });
  assert.ok(String(gap?.reason).includes(missingDeclaration), "The gap reason does not name " + missingDeclaration + ".");
});
