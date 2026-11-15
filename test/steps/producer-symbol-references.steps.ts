import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type ExtraFile, inspectStageFour, type StageFourAttempt, stageFourAttempt }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { type CommandResult, toolsRoot } from "../../packages/producer/test/support/commands.ts";

// The scenarios prepare a run after Stage 3, run Stage 4 start through the command
// line, collect the Stage 4 source sites, and ask Stage 4 inspect for the references
// to a symbol of one source file. The toolchain and graph phases of the fixture need
// no Docker.
interface Position { line?: unknown; column?: unknown }
interface Reference { path?: unknown; range?: Position[]; kind?: unknown; localName?: unknown }
interface Unresolved { path?: unknown; lines?: unknown; kind?: unknown; expression?: unknown }
interface ReferencesRecord {
  status?: unknown; path?: unknown; symbol?: unknown; compilerSettingsRef?: unknown;
  compilerSettings?: { source?: unknown; configPath?: unknown }; completeness?: unknown;
  references?: Reference[]; unresolved?: Unresolved[];
}

interface ReferencesWorld extends World {
  referencesAttempt?: StageFourAttempt;
  referencesCommand?: CommandResult;
}

const invoicePath = "src/billing/invoice.ts";
const invoice: ExtraFile = { path: invoicePath, text: "export function createInvoice(id: string) {\n  return { id };\n}\n" };
// The compiler settings map @billing/* to the billing folder. One user imports through that alias.
const compilerSettings: ExtraFile = { path: "tsconfig.json", text: JSON.stringify({ compilerOptions: { strict: true,
  module: "esnext", moduleResolution: "bundler", paths: { "@billing/*": ["./src/billing/*"] } } }, null, 2) + "\n" };
const orders: ExtraFile = { path: "src/orders.ts", text: "import { createInvoice } from '@billing/invoice';\n\n" +
  "export function placeOrder(id: string) {\n  return createInvoice(id);\n}\n" };
const refunds: ExtraFile = { path: "src/refunds.ts", text: "import { createInvoice as invoiceFor } from './billing/invoice';\n\n" +
  "export const refund = (id: string) => invoiceFor(id);\n" };
// The plugin loader makes the module name at run time.
const plugins: ExtraFile = { path: "src/plugins.ts", text: "export async function loadPlugin(name: string) {\n" +
  "  return import('./billing/' + name);\n}\n" };
const position = (line: number, column: number): Position => ({ line, column });

// The record that the first references request of the attempt saved.
function referencesRecord(world: ReferencesWorld): ReferencesRecord {
  const command = world.referencesCommand;
  assert.ok(command && world.referencesAttempt, "Ask for the references first.");
  assert.equal(command.status, 0, command.stderr);
  return JSON.parse(readFileSync(join(world.referencesAttempt.attempt, "references-001.json"), "utf8")) as ReferencesRecord;
}

After({ tags: "@producer" }, function (this: ReferencesWorld) {
  if (this.referencesAttempt) rmSync(this.referencesAttempt.root, { recursive: true, force: true });
});

Given("a saved snapshot where {string} is exported from one file and used in two other files", { timeout: 120_000 },
  function (this: ReferencesWorld, symbol: string) {
    assert.equal(symbol, "createInvoice");
    this.referencesAttempt = stageFourAttempt([compilerSettings, invoice, orders, refunds], toolsRoot, "collected");
  });

Given("a saved snapshot where one file loads the module by a computed name", { timeout: 120_000 },
  function (this: ReferencesWorld) {
    this.referencesAttempt = stageFourAttempt([invoice, plugins]);
  });

When("the operator asks for references to {string}", { timeout: 120_000 }, function (this: ReferencesWorld, symbol: string) {
  const attempt = this.referencesAttempt;
  assert.ok(attempt, "Prepare a saved snapshot first.");
  const collect = inspectStageFour(attempt, ["collect"]);
  assert.equal(collect.status, 0, collect.stderr);
  this.referencesCommand = inspectStageFour(attempt, ["references", invoicePath, symbol]);
});

Then("the result lists the two files with source ranges", function (this: ReferencesWorld) {
  const record = referencesRecord(this);
  assert.deepEqual({ status: record.status, path: record.path, symbol: record.symbol },
    { status: "completed", path: invoicePath, symbol: "createInvoice" });
  // A range starts at the first character of the name at the site and ends after its last character.
  assert.deepEqual((record.references ?? []).map(({ path, range, kind, localName }) => ({ path, range, kind, localName })), [
    { path: orders.path, range: [position(1, 10), position(1, 23)], kind: "import", localName: "createInvoice" },
    { path: orders.path, range: [position(4, 10), position(4, 23)], kind: "call", localName: "createInvoice" },
    { path: refunds.path, range: [position(1, 10), position(1, 37)], kind: "import", localName: "invoiceFor" },
    { path: refunds.path, range: [position(3, 39), position(3, 49)], kind: "call", localName: "invoiceFor" },
  ]);
});

Then("it records the compiler settings that the query used", function (this: ReferencesWorld) {
  const record = referencesRecord(this);
  assert.deepEqual({ ref: record.compilerSettingsRef, source: record.compilerSettings?.source,
    configPath: record.compilerSettings?.configPath },
  { ref: "settings-001#/configs/0", source: "configuration", configPath: "tsconfig.json" });
});

Then("that file is listed as a possible use that is not resolved", function (this: ReferencesWorld) {
  const record = referencesRecord(this);
  assert.deepEqual(record.references, []);
  assert.deepEqual((record.unresolved ?? []).map(({ path, lines, kind, expression }) => ({ path, lines, kind, expression })),
    [{ path: plugins.path, lines: [2, 2], kind: "dynamic-import", expression: "import('./billing/' + name)" }]);
});

Then("the result says that the list may be incomplete", function (this: ReferencesWorld) {
  assert.equal(referencesRecord(this).completeness, "partial");
});
