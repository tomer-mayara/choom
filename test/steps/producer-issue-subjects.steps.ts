import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { type ExtraFile, type FixtureBaseline, publishStageFour, stageFourPublication, type StageFourPublication }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { collectStageFive, type StageFiveBaseline, stageFivePublication, type StageFivePublication, writeStageFivePacket }
  from "../../packages/producer/test/fixtures/stage-5-publication/fixture.ts";
import { type CommandResult, toolsRoot } from "../../packages/producer/test/support/commands.ts";

// The subjects of questions and gaps, checked by the Stage 4/5 publisher. The Stage 4
// drafts use the Stage 4 publication fixture, and the Stage 5 drafts the Stage 5
// publication fixture. producer-recovery.steps.ts publishes a draft, checks that a
// refused draft changes no file of the run, and removes the run folder after the
// scenario.
interface SubjectsWorld extends World {
  stageFourRun?: StageFourPublication;
  stageFiveRun?: StageFivePublication;
  publishCommand?: CommandResult;
  // The ID of the question or gap that the scenario adds, and its subject.
  subjectIssue?: { id: string; subject: string };
}

type Records = Record<string, Record<string, unknown>>;
type IssueKind = "questions" | "gaps";

const evidenceRefs = ["launch-settings"];
const proposed = <Value>(value: Value) => ({ value, status: "proposed", evidenceRefs: [...evidenceRefs] });
// A snapshot file in the folder src, for the examples that name a file or a folder.
const ordersFile: ExtraFile = { path: "src/orders.ts", text: "export function listOrders() {}\n" };
// The subject of each example of a form of subject. The values are the IDs of the Stage 4 publication fixture.
const exampleSubjects: Record<string, string> = {
  "the ID of a component": "http",
  "the purpose statement of a component": "http.purpose",
  "a snapshot file": ordersFile.path,
  "the snapshot ID": "snapshot-check",
  "the ID of an earlier gap": "s3-check-unknown-plugin",
  "the ID of an entry candidate": "cli-candidate",
};

// Adds the question or gap to the discovery and to the entry analysis of the draft. The two lists must be the same.
function addIssue(records: Records, kind: IssueKind, issue: Record<string, unknown>): void {
  for (const name of ["discovery.proposed.yaml", "entry-analysis.yaml"]) {
    const record = records[name];
    assert.ok(record && Array.isArray(record[kind]), `The draft has no ${kind} in ${name}.`);
    record[kind] = [...record[kind], structuredClone(issue)];
  }
}

function newGap(id: string, subject: string): Record<string, unknown> {
  return { id, kind: "missing-input", subjectRefs: [subject], reason: "The review names a file that it did not find.",
    evidenceRefs };
}

function newQuestion(id: string, subject: string): Record<string, unknown> {
  return { id, subjectRefs: [subject], text: "Which code uses this?", evidenceRefs };
}

function lastCommand(world: SubjectsWorld): CommandResult {
  assert.ok(world.publishCommand, "Publish the draft first.");
  return world.publishCommand;
}

function addedIssue(world: SubjectsWorld): { id: string; subject: string } {
  assert.ok(world.subjectIssue, "Add a question or gap to the draft first.");
  return world.subjectIssue;
}

// The draft of a Stage 5 attempt is in the run of the published Stage 4 draft. The
// publish steps check the files of that run.
function useStageFiveDraft(world: SubjectsWorld, draft: StageFivePublication): void {
  world.stageFourRun = draft;
  world.stageFiveRun = draft;
}

Given("a Stage {int} draft with a new gap whose subject is {string}", function (this: SubjectsWorld, stage: number,
  subject: string) {
  assert.ok(stage === 4 || stage === 5, "The Stage 4/5 publisher publishes Stage 4 and Stage 5 drafts.");
  const id = `s${stage}-check-gap-001`;
  const add = (records: Records): void => addIssue(records, "gaps", newGap(id, subject));
  this.subjectIssue = { id, subject };
  if (stage === 4) this.stageFourRun = stageFourPublication(undefined, [], toolsRoot, add);
  else useStageFiveDraft(this, stageFivePublication([], { records: add }));
});

Then("the operator is told that the subject {string} of the gap names nothing", function (this: SubjectsWorld, subject: string) {
  const message = lastCommand(this).stderr;
  assert.ok(message.startsWith(`The subject ${subject} of the gap ${addedIssue(this).id} names nothing.`), message);
});

// The interface billing-api of the http component, and a question about it. The
// Stage 4 publication freezes the question: later stages keep it unchanged.
Given("a Stage 4 run with a question about the interface {string}", function (this: SubjectsWorld, interfaceId: string) {
  const addInterface = (baseline: FixtureBaseline): void => {
    baseline.interfaces.push({ id: interfaceId, name: "Billing API", owner: proposed("http"),
      publicAccess: proposed(["GET /orders"]), allowedConsumers: proposed(["cli"]), promises: proposed({
        behavior: "List the orders.", data: "Orders.", errors: "No errors are documented.", lifecycle: "Active." }) });
  };
  const id = "s4-check-question-001";
  this.subjectIssue = { id, subject: interfaceId };
  const run = stageFourPublication(addInterface, [], toolsRoot, (records) => addIssue(records, "questions",
    newQuestion(id, interfaceId)));
  this.stageFourRun = run;
  const published = publishStageFour(run, "finish");
  assert.equal(published.status, 0, published.stderr);
});

Given("a Stage 5 draft that removes the interface {string}", function (this: SubjectsWorld, interfaceId: string) {
  assert.ok(this.stageFourRun, "Publish the Stage 4 draft first.");
  const removeInterface = (baseline: StageFiveBaseline): void => {
    baseline.interfaces = (baseline.interfaces as { id: string }[]).filter((item) => item.id !== interfaceId);
  };
  useStageFiveDraft(this, writeStageFivePacket(collectStageFive(this.stageFourRun), { baseline: removeInterface }));
});

Then("the operator is told which question names the removed interface", function (this: SubjectsWorld) {
  const message = lastCommand(this).stderr;
  const { id, subject } = addedIssue(this);
  assert.ok(message.startsWith(`The subject ${subject} of the question ${id} names nothing.`), message);
});

Given(/^a Stage 4 draft with a new question whose subject is (.+)$/, function (this: SubjectsWorld, example: string) {
  const subject = /^the snapshot folder "(.+)"$/.exec(example)?.[1] ?? exampleSubjects[example];
  assert.ok(subject, `No subject for the example: ${example}`);
  const id = "s4-check-question-001";
  this.subjectIssue = { id, subject };
  this.stageFourRun = stageFourPublication(undefined, [ordersFile], toolsRoot,
    (records) => addIssue(records, "questions", newQuestion(id, subject)));
});

Then("the Stage 4 draft is published", function (this: SubjectsWorld) {
  const command = lastCommand(this);
  assert.equal(command.status, 0, command.stderr);
  assert.equal((JSON.parse(command.stdout) as { status?: unknown }).status, "stage4-published");
  assert.ok(this.stageFourRun, "Prepare a Stage 4 draft first.");
  const discovery = parse(readFileSync(join(this.stageFourRun.work, "discovery.yaml"), "utf8")) as
    { questions: { id: string; subjectRefs: string[] }[] };
  const { id, subject } = addedIssue(this);
  assert.deepEqual(discovery.questions.find((question) => question.id === id)?.subjectRefs, [subject]);
});
