import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { billingFile, billingPath, billingRestRanges, billingText, computePriceRanges, divideBilling, noPathOwner, textAt }
  from "../../packages/producer/test/fixtures/stage-5-publication/divided-file.ts";
import { type CodeMapping, component, type MappingUnit, publishStageFive, type StageFivePublication, stageFivePublication }
  from "../../packages/producer/test/fixtures/stage-5-publication/fixture.ts";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";

// The scenarios publish the Stage 4 review of a small run whose snapshot holds
// billing.ts, run Stage 5 start and collect through the command line, and check a
// Stage 5 packet with the Stage 4/5 publisher, as an operator does. In the packet,
// a version 5 baseline names symbols of billing.ts, and the code mapping divides
// the file into the units of those symbols and one rest unit.
interface Plan {
  // Whether the Billing component owns billing.ts by its membership paths.
  billingPaths: boolean;
  billingSymbols: string[];
  pricingSymbols: string[];
  // The refusal that the scenario expects, when it expects one.
  refusal?: string;
}

interface CodeUnitsWorld extends World {
  codeUnitsPlan?: Plan;
  codeUnitsRun?: StageFivePublication;
  codeUnitsCheck?: CommandResult;
  codeUnitsBefore?: [string, string][];
}

const declaration = "/** The price of a number of items. */\nexport function computePrice(count: number): number {\n" +
  "  return count * 2;\n}";

function plan(world: CodeUnitsWorld): Plan {
  assert.ok(world.codeUnitsPlan, "Prepare the file first.");
  return world.codeUnitsPlan;
}

// The units of billing.ts in the code mapping that the check accepted.
function acceptedUnits(world: CodeUnitsWorld): MappingUnit[] {
  const check = world.codeUnitsCheck;
  assert.ok(check && world.codeUnitsRun, "Check the code mapping first.");
  assert.deepEqual({ status: check.status, stderr: check.stderr }, { status: 0, stderr: "" });
  assert.equal((JSON.parse(check.stdout) as { status?: unknown }).status, "stage5-review-verified");
  const mapping = JSON.parse(readFileSync(join(world.codeUnitsRun.reviewFive, "code-mapping.json"), "utf8")) as CodeMapping;
  return mapping.units.filter((unit) => unit.path === billingPath);
}

function onlyRest(world: CodeUnitsWorld): MappingUnit {
  const rest = acceptedUnits(world).filter((unit) => unit.unitKind === "rest");
  assert.equal(rest.length, 1);
  return rest[0] as MappingUnit;
}

After({ tags: "@producer" }, function (this: CodeUnitsWorld) {
  if (this.codeUnitsRun) rmSync(this.codeUnitsRun.root, { recursive: true, force: true });
});

Given("a file that Billing owns and that also declares {string}", function (this: CodeUnitsWorld, symbol: string) {
  assert.ok(billingText.includes(`export function ${symbol}(`), `billing.ts does not declare ${symbol}.`);
  this.codeUnitsPlan = { billingPaths: true, billingSymbols: [], pricingSymbols: [] };
});

Given("a file that no path selector matches", function (this: CodeUnitsWorld) {
  this.codeUnitsPlan = { billingPaths: false, billingSymbols: [], pricingSymbols: [] };
});

function pricingNames(this: CodeUnitsWorld, symbol: string): void {
  plan(this).pricingSymbols.push(symbol);
}

Given("Pricing names the symbol {string} in its membership", pricingNames);
Given("Pricing names the symbol {string} in that file", pricingNames);

Given("a component that names a symbol that the file does not declare", function (this: CodeUnitsWorld) {
  this.codeUnitsPlan = { billingPaths: true, billingSymbols: [], pricingSymbols: ["computeTax"],
    refusal: "The symbol selector computeTax of billing.ts matched nothing: the file has no top-level declaration with that name." };
});

Given("two components that name the same symbol", function (this: CodeUnitsWorld) {
  this.codeUnitsPlan = { billingPaths: true, billingSymbols: ["computePrice"], pricingSymbols: ["computePrice"],
    refusal: "The symbol computePrice of billing.ts has two owners: billing and pricing. A symbol has one direct owner." };
});

When("the code mapping is checked", { timeout: 120_000 }, function (this: CodeUnitsWorld) {
  const { billingPaths, billingSymbols, pricingSymbols } = plan(this);
  const selectors = (symbols: string[]) => symbols.map((symbol) => ({ path: billingPath, symbol }));
  this.codeUnitsRun = stageFivePublication([billingFile], {
    baseline(baseline) {
      baseline.formatVersion = 5;
      if (billingPaths || billingSymbols.length) baseline.components.push(component("billing",
        { paths: billingPaths ? [billingPath] : [], symbols: selectors(billingSymbols) }));
      baseline.components.push(component("pricing", { paths: [], symbols: selectors(pricingSymbols) }));
    },
    mapping(mapping, baseline) {
      divideBilling(mapping, baseline, pricingSymbols.map((symbol) => ({ symbol, owner: "pricing", ranges: computePriceRanges })),
        { owner: billingPaths ? "billing" : null, ranges: billingRestRanges });
    },
  });
  this.codeUnitsBefore = folderState(this.codeUnitsRun.work);
  this.codeUnitsCheck = publishStageFive(this.codeUnitsRun, "check");
});

Then("{string} is a code unit that Pricing owns", function (this: CodeUnitsWorld, symbol: string) {
  const units = acceptedUnits(this).filter((unit) => unit.unitKind === "symbol");
  assert.deepEqual(units.map((unit) => ({ symbol: unit.symbol, owner: unit.owner })), [{ symbol, owner: "pricing" }]);
  // The unit holds the declaration and the comment above it.
  assert.equal(textAt(billingText, units[0]?.ranges ?? []), declaration);
});

Then("the rest of the file is one code unit that Billing owns", function (this: CodeUnitsWorld) {
  const rest = onlyRest(this);
  assert.equal(rest.owner, "billing");
  assert.equal(textAt(billingText, rest.ranges ?? []), billingText.replace(declaration, ""));
});

Then("the rest of the file has an unknown owner and a reason", function (this: CodeUnitsWorld) {
  const { owner, membershipRef, reason } = onlyRest(this);
  assert.deepEqual({ owner, membershipRef, reason }, { owner: null, membershipRef: null, reason: noPathOwner });
});

Then("the mapping is refused", function (this: CodeUnitsWorld) {
  const check = this.codeUnitsCheck;
  assert.ok(check && this.codeUnitsRun, "Check the code mapping first.");
  assert.deepEqual(check, { status: 1, stdout: "", stderr: `${plan(this).refusal ?? ""}\n` });
  assert.deepEqual(folderState(this.codeUnitsRun.work), this.codeUnitsBefore);
});

Then("the operator is told which selector matched nothing", function (this: CodeUnitsWorld) {
  assert.match(this.codeUnitsCheck?.stderr ?? "", /^The symbol selector computeTax of billing\.ts matched nothing: /);
});
