import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { stageFourPublication, type StageFourPublication }
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

function refusal(world: CompletionWorld): string {
  assert.ok(world.publishCommand, "Publish the Stage 4 draft first.");
  return world.publishCommand.stderr;
}

function draftRun(world: CompletionWorld): StageFourPublication {
  assert.ok(world.stageFourRun, "Prepare a Stage 4 draft first.");
  return world.stageFourRun;
}

// The review read the saved range of http.ts. Stage 4 collect also saved the first
// lines of cli.ts, a file of an entry candidate, but the review did not read them.
const reviewed = "s4-check-source-http.ts";
const unread = "s4-check-source-cli.ts";

Given("a Stage 4 draft whose order path cites, in step 2, a saved excerpt of cli.ts that the review did not read",
  function (this: CompletionWorld) {
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

Then("the operator is told that step 2 of the order path cites the unread excerpt of cli.ts", function (this: CompletionWorld) {
  const message = refusal(this);
  assert.ok(message.includes(`outside the selected source review history: s4-check-orders-path step 2: ${unread}`), message);
});

// The Stage 4 publication fixture starts from a run with the summaries of Stages 1
// and 3. Its draft records 1 gap, and the components select every file.
Given("a reviewed Stage 4 draft with 1 gap, no question, no inspected path and no file with an unknown owner",
  function (this: CompletionWorld) {
    const run = stageFourPublication();
    const read = (name: string): Record<string, unknown[]> => parse(readFileSync(join(run.review, name), "utf8")) as Record<string, unknown[]>;
    const discovery = read("discovery.proposed.yaml");
    assert.deepEqual([discovery.gaps?.length, discovery.questions?.length, discovery.inspectedPaths?.length], [1, 0, 0]);
    const units = read("code-mapping.json").units as { owner: string | null }[];
    assert.ok(units.length > 0 && units.every((unit) => unit.owner !== null), "Every file of the draft has an owner.");
    this.stageFourRun = run;
  });

function runSummaries(world: CompletionWorld): Record<string, string> {
  const run = parse(readFileSync(join(draftRun(world).work, "run.yaml"), "utf8")) as { coverage: Record<string, string> };
  return run.coverage;
}

function publishedSummaries(world: CompletionWorld): Record<string, string> {
  assert.ok(world.publishCommand, "Publish the Stage 4 draft first.");
  assert.equal(world.publishCommand.status, 0, world.publishCommand.stderr);
  return runSummaries(world);
}

Given("the run summaries say that the baseline is not yet recovered", function (this: CompletionWorld) {
  assert.match(Object.values(runSummaries(this)).join("\n"), /not yet recovered/);
});

Then("the run summaries cite the reviewed files of the Stage 4 entry analysis", function (this: CompletionWorld) {
  const { inspected = "" } = publishedSummaries(this);
  assert.ok(inspected.includes("s4-check-entry-analysis#/reviewedFiles"), inspected);
});

Then("the run summaries count 1 recorded gap, no question, no inspected path and no file with an unknown owner",
  function (this: CompletionWorld) {
    const { inspected = "", unresolved = "" } = publishedSummaries(this);
    assert.ok(inspected.includes("inspected behavior paths (0)"), inspected);
    assert.ok(unresolved.includes("recorded questions (0) and recorded gaps (1)") &&
      unresolved.includes("files with unknown owners (0)"), unresolved);
  });

Then("the run summaries no longer say that the baseline is not yet recovered", function (this: CompletionWorld) {
  assert.doesNotMatch(Object.values(publishedSummaries(this)).join("\n"), /not yet recovered/);
});
