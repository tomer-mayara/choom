import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { baselineSchema } from "../../src/domain/baseline.ts";
import { baselineExample, invalidBaseline, reviewedBaseline } from "../support/baseline-fixtures.ts";

interface BaselineWorld extends World {
  baselineInput: unknown;
  originalBaseline: unknown;
  invalidBaselinePath: string;
  baselineValidation: ReturnType<typeof baselineSchema.safeParse>;
}

Given("a supported baseline with proposed and accepted statements", function (this: BaselineWorld) {
  this.baselineInput = baselineExample();
});

Given("its evidence and acceptance records are not available", function (this: BaselineWorld) {
  assert.match(JSON.stringify(this.baselineInput), /missing-evidence/);
  assert.match(JSON.stringify(this.baselineInput), /missing-review/);
});

Given(/^an otherwise valid baseline with (.+)$/, function (this: BaselineWorld, problem: string) {
  const example = invalidBaseline(problem);
  this.baselineInput = example.input;
  this.invalidBaselinePath = example.path;
});

Given(/^the reviewed (empty|full) baseline$/, function (this: BaselineWorld, example: "empty" | "full") {
  this.baselineInput = reviewedBaseline(example);
});

When("a caller validates it for viewing", function (this: BaselineWorld) {
  this.originalBaseline = structuredClone(this.baselineInput);
  this.baselineValidation = baselineSchema.safeParse(this.baselineInput);
});

Then("its values, statuses, and references are preserved", function (this: BaselineWorld) {
  assert.equal(this.baselineValidation.success, true, JSON.stringify(this.baselineValidation));
  assert.deepEqual(this.baselineValidation.data, this.originalBaseline);
});

Then("no statement changes status", function (this: BaselineWorld) {
  assert.deepEqual(this.baselineInput, this.originalBaseline);
});

Then("validation identifies the invalid item or field", function (this: BaselineWorld) {
  assert.equal(this.baselineValidation.success, false);
  assert.ok(this.baselineValidation.error?.issues.some((issue) => issue.path.join(".") === this.invalidBaselinePath),
    JSON.stringify(this.baselineValidation));
});

Then("all recorded architecture items are preserved", function (this: BaselineWorld) {
  assert.equal(this.baselineValidation.success, true, JSON.stringify(this.baselineValidation));
  assert.deepEqual(this.baselineValidation.data, this.originalBaseline);
});
