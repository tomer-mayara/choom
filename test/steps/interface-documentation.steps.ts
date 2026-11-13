import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { stringify } from "yaml";
import { baselineCodec } from "../../src/lib/baseline-yaml.ts";
import { baselineWithSignature, enrichedBaseline, invalidDocumentation } from "../support/interface-documentation-fixtures.ts";

interface DocumentationWorld extends World {
  documentationInput: unknown;
  documentationResult: ReturnType<typeof baselineCodec.decode>;
}

Given("a valid documented version 2 baseline", function (this: DocumentationWorld) {
  this.documentationInput = enrichedBaseline();
});
Given("a documented method with its parameters and return type recorded", function (this: DocumentationWorld) {
  this.documentationInput = baselineWithSignature().input;
});
Given("a version 1 baseline with new documentation fields", function (this: DocumentationWorld) {
  this.documentationInput = { ...enrichedBaseline(), formatVersion: 1 };
});
Given(/^documented baseline data with (.+)$/, function (this: DocumentationWorld, defect: string) {
  this.documentationInput = invalidDocumentation(defect);
});
When("the public decoder reads the documented baseline", function (this: DocumentationWorld) {
  this.documentationResult = baselineCodec.decode(stringify(this.documentationInput));
});
Then("all saved architecture and documentation values are preserved", function (this: DocumentationWorld) {
  assert.equal(this.documentationResult.status, "success", JSON.stringify(this.documentationResult));
  assert.deepEqual(this.documentationResult.baseline, this.documentationInput);
});
Then("the documentation is rejected as an invalid document", function (this: DocumentationWorld) {
  assert.equal(this.documentationResult.status, "failure");
  assert.equal(this.documentationResult.code, "invalid-document");
});
Then("the documentation is rejected at an affected field", function (this: DocumentationWorld) {
  assert.equal(this.documentationResult.status, "failure");
  assert.equal(this.documentationResult.code, "invalid-document");
  assert.match(this.documentationResult.message, /interfaces\.0/);
});
