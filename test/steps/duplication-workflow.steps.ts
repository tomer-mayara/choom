import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { duplicationWorkflow } from "../support/duplication-workflow-fixtures.ts";

interface DuplicationWorkflowWorld extends World {
  reviewWorkspace?: ReturnType<typeof duplicationWorkflow>;
  baselineView?: unknown;
  reportOutcome?: unknown;
}

Given("the duplication workspace has opened its saved baseline", async function (this: DuplicationWorkflowWorld) {
  this.reviewWorkspace = duplicationWorkflow();
  const outcome = await this.reviewWorkspace.workflow.openBaseline();
  assert.equal(outcome.status, "success");
  this.baselineView = this.reviewWorkspace.workflow.getSnapshot().current;
});

When("the matching duplication report is opened through the workspace", async function (this: DuplicationWorkflowWorld) {
  assert.ok(this.reviewWorkspace);
  this.reportOutcome = await this.reviewWorkspace.workflow.openDuplicationReport();
});

Then("the workspace exposes the attached report and the same baseline view", function (this: DuplicationWorkflowWorld) {
  assert.ok(this.reviewWorkspace);
  assert.partialDeepStrictEqual(this.reportOutcome, { status: "success" });
  const snapshot = this.reviewWorkspace.workflow.getSnapshot();
  assert.partialDeepStrictEqual(snapshot, { duplication: { report: { id: "illustrative-duplication-review" } } });
  assert.equal(snapshot.current, this.baselineView);
});
