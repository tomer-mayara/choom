import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { stageFourPublication, type StageFourPublication }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";
import { rewriteStageFiveFiles, type StageSixFixture, stageFiveFiles, stageSixFixture }
  from "../../packages/producer/test/support/stage-6-run.ts";

// The summary of the run, the coverage of run.yaml, after a publication. The Stage 4
// draft uses the Stage 4 publication fixture, and the Stage 5 draft the Stage 6
// producer fixture. producer-recovery.steps.ts publishes the Stage 4 draft, saves the
// result of the Stage 5 draft, and removes the run folders after the scenario.
type Json = Record<string, unknown>;
interface RunManifestWorld extends World {
  stageFourRun?: StageFourPublication;
  publishCommand?: CommandResult;
  producerRun?: StageSixFixture;
  saveCommands?: { status: number | null; stderr: string }[];
  // The summary that the last Then step read. The steps that start with "it" check it.
  runSummary?: Json;
}

const readYaml = (work: string, name: string): Json => parse(readFileSync(join(work, name), "utf8")) as Json;

function summary(world: RunManifestWorld): Json {
  assert.ok(world.runSummary, "Read the run summary first.");
  return world.runSummary;
}

Given("a Stage 4 draft", function (this: RunManifestWorld) {
  this.stageFourRun = stageFourPublication();
});

// The fixture draft has the gap unknown-plugin. The question names an entry candidate,
// and the later gap is a note that names the gap. The working discovery, the discovery
// proposal and the selected entry analysis keep the same lists.
Given("a reviewed Stage 5 draft with one question, one gap and a later gap that names the first gap",
  async function (this: RunManifestWorld) {
    const run = await stageSixFixture();
    this.producerRun = run;
    const question = { id: "plugin-question", subjectRefs: ["plugin-candidate"], text: "Which command starts the plugin?",
      evidenceRefs: ["launch-settings"] };
    const note = { id: "plugin-path-note", kind: "entry", subjectRefs: ["unknown-plugin"],
      reason: "The saved launch settings name the plugin command, but not the file that it starts.",
      evidenceRefs: ["launch-settings#/unresolved"] };
    const withIssues = (path: string): string => {
      const record = readYaml(run.work, path);
      assert.deepEqual((record.gaps as Json[]).map((gap) => gap.id), ["unknown-plugin"]);
      return JSON.stringify({ ...record, questions: [question], gaps: [...record.gaps as Json[], note] });
    };
    const discovery = withIssues(stageFiveFiles.discovery);
    rewriteStageFiveFiles(run, { [stageFiveFiles.discovery]: discovery, [stageFiveFiles.proposal]: discovery,
      [stageFiveFiles.entryAnalysis]: withIssues(stageFiveFiles.entryAnalysis) });
  });

Then("the run summary names the Stage 4 entry analysis for the reviewed source ranges", function (this: RunManifestWorld) {
  const run = this.stageFourRun;
  assert.ok(run && this.publishCommand, "Publish the Stage 4 draft first.");
  assert.equal(this.publishCommand.status, 0, this.publishCommand.stderr);
  const { entryAnalysisRef } = readYaml(run.work, "discovery.yaml");
  assert.equal(entryAnalysisRef, "s4-check-entry-analysis");
  this.runSummary = readYaml(run.work, "run.yaml").coverage as Json;
  const { inspected } = this.runSummary;
  assert.ok(String(inspected).includes(`${entryAnalysisRef}#/reviewedFiles`), String(inspected));
});

Then("the run summary says that the discovery result records 1 question and 2 gaps, with history and linked notes",
  function (this: RunManifestWorld) {
    const run = this.producerRun;
    const commands = this.saveCommands ?? [];
    assert.ok(run && commands.length === 2, "Save the result first.");
    for (const command of commands) assert.equal(command.status, 0, command.stderr);
    const manifest = readYaml(run.work, "run.yaml");
    this.runSummary = manifest.coverage as Json;
    assert.equal(this.runSummary.recorded,
      `${String(manifest.discoveryRef)} records 1 question and 2 gaps, with history and linked notes.`);
  });

Then("it does not say that the baseline is not yet recovered", function (this: RunManifestWorld) {
  assert.doesNotMatch(Object.values(summary(this)).join("\n"), /not yet recovered/);
});

// The summary has three fields. progress has the state of each stage, so no text of the
// summary names a stage as pending.
Then("it does not call them unresolved", function (this: RunManifestWorld) {
  assert.deepEqual(Object.keys(summary(this)), ["inventoried", "inspected", "recorded"]);
  const text = Object.values(summary(this)).join("\n");
  assert.doesNotMatch(text, /unresolved/i);
  assert.doesNotMatch(text, /pending/i);
});
