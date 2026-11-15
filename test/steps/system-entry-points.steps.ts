import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { stringify } from "yaml";
import { baselineCodec } from "../../src/lib/baseline-yaml.ts";
import { invalidSystemEntryPoints, systemEntryPointsBaseline } from "../support/system-entry-points-fixtures.ts";

interface EntryPointsWorld extends World {
  entryInput: unknown;
  entryPath?: string;
  entryResult: ReturnType<typeof baselineCodec.decode>;
}

Given("a valid version 4 baseline with a Startup and an External entry", function (this: EntryPointsWorld) {
  this.entryInput = systemEntryPointsBaseline();
});
Given("no source repository or evidence bundle is available for the entry points", function (this: EntryPointsWorld) {
  assert.ok(this.entryInput);
});
Given(/^a version 4 baseline with (.+)$/, function (this: EntryPointsWorld, problem: string) {
  const { input, path } = invalidSystemEntryPoints(problem);
  this.entryInput = input;
  this.entryPath = path;
});
When("the public baseline decoder reads the entry-point file", function (this: EntryPointsWorld) {
  this.entryResult = baselineCodec.decode(stringify(this.entryInput));
});
Then("it returns both entry points with their paths and interface links", function (this: EntryPointsWorld) {
  assert.equal(this.entryResult.status, "success", JSON.stringify(this.entryResult));
  assert.deepEqual(this.entryResult.baseline, this.entryInput);
  if (this.entryResult.baseline.formatVersion !== 4) throw new Error("Expected a version 4 baseline.");
  const entries = this.entryResult.baseline.systemEntryPoints?.entries;
  assert.deepEqual(entries?.map(({ kind, path, interfaceId, entryId }) => ({ kind, path, interfaceId, entryId })), [
    { kind: "startup", path: "checkout/order.ts", interfaceId: undefined, entryId: undefined },
    { kind: "external", path: "billing/invoice.ts", interfaceId: "invoice-api", entryId: "create-invoice" },
  ]);
});
Then("it reports the invalid entry-point field", function (this: EntryPointsWorld) {
  assert.equal(this.entryResult.status, "failure");
  assert.equal(this.entryResult.code, "invalid-document");
  assert.ok(this.entryPath);
  assert.ok(this.entryResult.message.includes(this.entryPath), this.entryResult.message);
});
