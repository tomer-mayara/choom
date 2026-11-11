import assert from "node:assert/strict";
import { Given, When, Then, type World } from "@cucumber/cucumber";
import { LoadWorkflow, type SelectedBaseline } from "../../src/architecture/load-workflow.ts";
import { baselineWorkflowDependencies, pending } from "../support/baseline-workflow-fixtures.ts";

interface BaselineWorkflowWorld extends World {
  renewNotifications?: number;
  workflow?: LoadWorkflow;
  selected?: ReturnType<typeof pending<SelectedBaseline | null>>;
  load?: ReturnType<LoadWorkflow["openBaseline"]>;
}
Given("a baseline load with a pending file selection", function (this: BaselineWorkflowWorld) {
  const dependencies = baselineWorkflowDependencies();
  const selected = pending<SelectedBaseline | null>();
  this.selected = selected;
  dependencies.selectBaseline = () => selected.promise;
  this.workflow = new LoadWorkflow(dependencies);
});
When("a view observer renews its subscription during notification", function (this: BaselineWorkflowWorld) {
  const workflow = this.workflow;
  assert.ok(workflow);
  this.renewNotifications = 0;
  let remove = () => {};
  const observer = () => {
    this.renewNotifications = (this.renewNotifications ?? 0) + 1;
    remove();
    if (this.renewNotifications < 20) remove = workflow.subscribe(observer);
  };
  remove = workflow.subscribe(observer);
  this.load = workflow.openBaseline();
});
Then("that observer is notified once for the selection state", async function (this: BaselineWorkflowWorld) {
  try { assert.equal(this.renewNotifications, 1); }
  finally {
    this.selected?.resolve(null);
    assert.equal((await this.load)?.status, "cancelled");
    await this.workflow?.dispose();
  }
});
