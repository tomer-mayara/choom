import assert from "node:assert/strict";
import { Given, Then, type World } from "@cucumber/cucumber";
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
