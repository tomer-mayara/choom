import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { stringify } from "yaml";
import { baselineCodec } from "../../src/lib/baseline-yaml.ts";
import { invalidSourceUsage, sourceUsageBaseline } from "../support/source-usage-fixtures.ts";

interface SourceUsageWorld extends World {
  sourceInput: unknown;
  sourcePath?: string;
  sourceResult: ReturnType<typeof baselineCodec.decode>;
}

Given("a version 3 baseline with source use and unknown permission", function (this: SourceUsageWorld) {
  this.sourceInput = sourceUsageBaseline();
});
Given("a version {int} baseline with source-use fields", function (this: SourceUsageWorld, version: number) {
  const input = { ...sourceUsageBaseline(), formatVersion: version };
  if (version === 1) for (const item of input.interfaces) Reflect.deleteProperty(item, "documentation");
  this.sourceInput = input;
});
Given("a version 3 baseline without source-use fields", function (this: SourceUsageWorld) {
  const { sourceUsage: _sourceUsage, ...input } = sourceUsageBaseline();
  this.sourceInput = input;
});
Given(/^source-use data with (.+)$/, function (this: SourceUsageWorld, defect: string) {
  const { input, path } = invalidSourceUsage(defect);
  this.sourceInput = input;
  this.sourcePath = path;
});
When("the public decoder reads the source-use baseline", function (this: SourceUsageWorld) {
  this.sourceResult = baselineCodec.decode(stringify(this.sourceInput));
});
Then("it retains all source uses and the unchanged permission", function (this: SourceUsageWorld) {
  assert.equal(this.sourceResult.status, "success", JSON.stringify(this.sourceResult));
  assert.deepEqual(this.sourceResult.baseline, this.sourceInput);
});
Then("it rejects the source-use baseline as invalid", function (this: SourceUsageWorld) {
  assert.equal(this.sourceResult.status, "failure");
  assert.equal(this.sourceResult.code, "invalid-document");
});
Then("it reports the affected source-use field", function (this: SourceUsageWorld) {
  assert.equal(this.sourceResult.status, "failure");
  assert.equal(this.sourceResult.code, "invalid-document");
  assert.ok(this.sourcePath);
  assert.ok(this.sourceResult.message.includes(this.sourcePath), this.sourceResult.message);
});
