import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import type { ExtraFile } from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { runStageFive, type StageFiveCollection, stageFiveCollection }
  from "../../packages/producer/test/fixtures/stage-5-publication/fixture.ts";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";

// The scenarios publish the Stage 4 review of a small run whose snapshot holds
// billing.ts, run Stage 5 start and collect through the command line, and ask
// Stage 5 for the parts of billing.ts that the symbol computePrice divides, with
// the dependencies of each part, as an operator does.
interface Dependency { kind?: unknown; specifier?: unknown; localNames?: unknown; expression?: unknown; reason?: unknown }
interface Part { unitKind?: unknown; symbol?: unknown; dependencies?: Dependency[] }
interface PartsRecord { parts?: Part[]; fileDependencies?: Dependency[] }

interface PartDependenciesWorld extends World {
  partFiles?: ExtraFile[];
  partSymbol?: string;
  partRun?: StageFiveCollection;
  partCommand?: CommandResult;
}

const billingPath = "billing.ts";
const money: ExtraFile = { path: "money.ts", text: "export function round(value: number): number {\n  return Math.round(value);\n}\n" };
// Only computePrice uses round. computeInvoice, which is in the rest of the file, uses rate.
const usedByOnePart = [
  "import { round } from './money';",
  "import { rate } from './rate';",
  "",
  "export function computeInvoice(total: number): number {",
  "  return total * rate;",
  "}",
  "",
  "/** The price of a number of items. */",
  "export function computePrice(count: number): number {",
  "  return round(count * 2);",
  "}",
  "",
].join("\n");
// The setup code loads a plugin whose module name it makes at run time.
const computedImport = [
  "import { round } from './money';",
  "",
  "// Load the plugin that the settings name.",
  "const pluginName = process.env.BILLING_PLUGIN ?? 'standard';",
  "void import('./plugins/' + pluginName);",
  "",
  "/** The price of a number of items. */",
  "export function computePrice(count: number): number {",
  "  return round(count * 2);",
  "}",
  "",
].join("\n");
const pluginImport = "import('./plugins/' + pluginName)";

// The record that the first parts request of the attempt saved.
function partsRecord(world: PartDependenciesWorld): PartsRecord {
  const command = world.partCommand;
  assert.ok(command && world.partRun, "Record the dependencies of the divided file first.");
  assert.deepEqual({ status: command.status, stderr: command.stderr }, { status: 0, stderr: "" });
  return JSON.parse(readFileSync(join(world.partRun.stageFive, "parts-001.json"), "utf8")) as PartsRecord;
}

// Each dependency of the record: the dependencies of each part, then the dependencies at file level.
const listed = (record: PartsRecord): Dependency[] =>
  [...(record.parts ?? []).flatMap(({ dependencies = [] }) => dependencies), ...record.fileDependencies ?? []];

After({ tags: "@producer" }, function (this: PartDependenciesWorld) {
  if (this.partRun) rmSync(this.partRun.root, { recursive: true, force: true });
});

Given("a divided file in which only the {string} part uses an imported module", function (this: PartDependenciesWorld, symbol: string) {
  assert.ok(usedByOnePart.includes(`export function ${symbol}(`), `billing.ts does not declare ${symbol}.`);
  this.partFiles = [{ path: billingPath, text: usedByOnePart }, money];
  this.partSymbol = symbol;
});

Given("a divided file with a computed import in its setup code", function (this: PartDependenciesWorld) {
  this.partFiles = [{ path: billingPath, text: computedImport }, money];
  this.partSymbol = "computePrice";
});

When("the dependencies of the divided file are recorded", { timeout: 120_000 }, function (this: PartDependenciesWorld) {
  assert.ok(this.partFiles && this.partSymbol, "Prepare the divided file first.");
  this.partRun = stageFiveCollection(this.partFiles);
  this.partCommand = runStageFive(this.partRun, ["parts", billingPath, this.partSymbol]);
});

Then("the import belongs to the {string} part", function (this: PartDependenciesWorld, symbol: string) {
  const record = partsRecord(this);
  const moneyImports = (dependencies: Dependency[] = []) => dependencies.filter(({ specifier }) => specifier === "./money")
    .map(({ kind, localNames }) => ({ kind, localNames }));
  assert.deepEqual((record.parts ?? []).map((part) => ({ unitKind: part.unitKind, symbol: part.symbol,
    imports: moneyImports(part.dependencies) })), [
    { unitKind: "symbol", symbol, imports: [{ kind: "import", localNames: ["round"] }] },
    { unitKind: "rest", symbol: undefined, imports: [] },
  ]);
  assert.deepEqual(moneyImports(record.fileDependencies), []);
});

Then("the dependency is recorded at file level as not resolved", function (this: PartDependenciesWorld) {
  const computed = (partsRecord(this).fileDependencies ?? []).filter(({ expression }) => expression === pluginImport);
  assert.deepEqual(computed.map(({ kind, specifier, reason }) => ({ kind, specifier, reason })),
    [{ kind: "dynamic-import", specifier: null, reason: "not-resolved" }]);
});

Then("it is not dropped and not copied to every part", function (this: PartDependenciesWorld) {
  const record = partsRecord(this);
  assert.deepEqual((record.parts ?? []).map(({ unitKind, symbol }) => ({ unitKind, symbol })),
    [{ unitKind: "symbol", symbol: "computePrice" }, { unitKind: "rest", symbol: undefined }]);
  // The record lists the computed import once, at file level, and in no part.
  assert.equal(listed(record).filter(({ expression }) => expression === pluginImport).length, 1);
  for (const part of record.parts ?? [])
    assert.ok(!(part.dependencies ?? []).some(({ expression }) => expression === pluginImport), "A part lists the computed import.");
});
