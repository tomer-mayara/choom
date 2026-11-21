import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { type FixtureBaseline, stageFourPublication, type StageFourPublication }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { type CommandResult, toolsRoot } from "../../packages/producer/test/support/commands.ts";

// The completion checks of the producer. The Stage 4 drafts use the Stage 4
// publication fixture; producer-recovery.steps.ts publishes them, checks that
// nothing changed, and removes the run folder after the scenario.
interface CompletionWorld extends World {
  stageFourRun?: StageFourPublication;
  publishCommand?: CommandResult;
}

type Records = Record<string, Record<string, unknown>>;

const question = { id: "s4-check-question-001", subjectRefs: ["http.purpose"], text: "Does http serve every order route?",
  evidenceRefs: ["launch-settings"] };

function refusal(world: CompletionWorld): string {
  assert.ok(world.publishCommand, "Publish the Stage 4 draft first.");
  return world.publishCommand.stderr;
}

Given("a Stage 4 draft with a question about a component that the draft renamed", function (this: CompletionWorld) {
  const rename = (baseline: FixtureBaseline): void => {
    const http = baseline.components.find((component) => component.id === "http");
    assert.ok(http, "The fixture has an http component.");
    http.id = "web";
  };
  const ask = (records: Records): void => {
    for (const name of ["discovery.proposed.yaml", "entry-analysis.yaml"]) Object.assign(records[name] ?? {}, { questions: [question] });
  };
  this.stageFourRun = stageFourPublication(rename, [], toolsRoot, ask);
});

Then("the operator is told which question names a subject that names nothing", function (this: CompletionWorld) {
  const message = refusal(this);
  assert.ok(message.includes(`Question ${question.id} names the subject http.purpose`), message);
});

// The review read the saved range of http.ts. Stage 4 collect also saved the first
// lines of cli.ts, a file of an entry candidate, but the review did not read them.
const reviewed = "s4-check-source-http.ts";
const unread = "s4-check-source-cli.ts";

Given("a Stage 4 draft whose inspected path cites an excerpt that the review did not read", function (this: CompletionWorld) {
  const route = { id: "s4-check-orders-route", kind: "route", expression: "GET /orders", componentRef: "http",
    source: { path: "http.ts", lines: [1, 1] }, fileEntryRefs: ["cli-candidate"], evidenceRefs: [reviewed, "launch-settings#/http/0"] };
  const path = { id: "s4-check-orders-path", description: "The HTTP file serves the order route of the CLI service.",
    entryPointRef: route.id, componentIds: ["http", "cli"], evidenceRefs: [reviewed],
    steps: [{ action: "The handler lists the orders.", evidenceRefs: [reviewed] },
      { action: "The CLI starts the service.", evidenceRefs: [unread] }],
    limits: ["Source inspection only; the path is not a runtime trace."] };
  this.stageFourRun = stageFourPublication(() => {}, [], toolsRoot, (records: Records) => {
    Object.assign(records["entry-analysis.yaml"] ?? {}, { behaviorEntries: [route] });
    Object.assign(records["discovery.proposed.yaml"] ?? {}, { inspectedPaths: [path] });
  });
});

Then("the operator is told which step of the inspected path cites the excerpt", function (this: CompletionWorld) {
  const message = refusal(this);
  assert.ok(message.includes(`s4-check-orders-path step 2: ${unread}`), message);
});

// The Stage 4 publication fixture starts from a run with the summaries of Stages 1 and 3.
Given("a reviewed Stage 4 draft of a run whose summaries describe Stage 3", function (this: CompletionWorld) {
  this.stageFourRun = stageFourPublication();
});

function runSummaries(world: CompletionWorld): Record<string, string> {
  assert.ok(world.stageFourRun && world.publishCommand, "Publish the Stage 4 draft first.");
  assert.equal(world.publishCommand.status, 0, world.publishCommand.stderr);
  const run = parse(readFileSync(join(world.stageFourRun.work, "run.yaml"), "utf8")) as { coverage: Record<string, string> };
  return run.coverage;
}

Then("the run summaries name the published Stage 4 records with their current counts", function (this: CompletionWorld) {
  const { inspected = "", unresolved = "" } = runSummaries(this);
  assert.ok(inspected.includes("s4-check-entry-analysis#/reviewedFiles") && inspected.includes("inspected behavior paths (0)"),
    inspected);
  assert.ok(unresolved.includes("recorded questions (0) and recorded gaps (1)") &&
    unresolved.includes("files with unknown owners (0)"), unresolved);
});

Then("the run summaries no longer say that the baseline is not yet recovered", function (this: CompletionWorld) {
  assert.doesNotMatch(Object.values(runSummaries(this)).join("\n"), /not yet recovered/);
});
