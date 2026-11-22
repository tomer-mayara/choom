import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then } from "@cucumber/cucumber";
import { parse } from "yaml";
import { collectedAfterEarlierAttempt, earlierQuestion, type ExtraFile, type FixtureBaseline, publishStageFour, stageFourPublication,
  type StageFourPublication, writeStageFourPacket } from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { collectStageFive, type StageFiveBaseline, stageFivePublication, type StageFivePublication, writeStageFivePacket }
  from "../../packages/producer/test/fixtures/stage-5-publication/fixture.ts";
import { type CommandResult, makeScratch, removeScratch, toolsRoot } from "../../packages/producer/test/support/commands.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";
import { capturedStageOneRun, reviewPacket, stageOne, writeReview } from "../../packages/producer/test/support/stage-1-run.ts";
import { analysisPacket, entryAnalysis, requiredGaps, runAttempt, stageOneRun as savedStageOneRun, stageTwo, stageTwoAttempt }
  from "../../packages/producer/test/support/stage-2-attempt.ts";
import { reviewStageThree, stageThree, stageThreeAttempt, type StageThreePacket, stageTwoRun }
  from "../../packages/producer/test/support/stage-3-attempt.ts";
import { readyToFinish, runFilesOutsideAttempt, type StageFinish, type StageFinishWorld } from "./producer-stage-finish.steps.ts";

// The subjects of questions and gaps, checked by the Stage 4/5 publisher. The Stage 4
// drafts use the Stage 4 publication fixture, and the Stage 5 drafts the Stage 5
// publication fixture. producer-recovery.steps.ts publishes a draft, checks that a
// refused draft changes no file of the run, and removes the run folder after the
// scenario. Stages 1 to 3 check the subjects of the records that they add when the
// operator finishes the stage: producer-stage-finish.steps.ts runs the finish action.
interface SubjectsWorld extends StageFinishWorld {
  stageFourRun?: StageFourPublication;
  stageFiveRun?: StageFivePublication;
  publishCommand?: CommandResult;
  // The ID of the question, gap or inspection priority that the scenario adds, and its subject.
  subjectIssue?: { id: string; subject: string };
  // The folder of the Stage 1, 2 or 3 run, which the scenario removes at the end.
  earlyStageScratch?: string;
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

// The finish action of Stage 1, 2 or 3, or the publish command of a Stage 4 or 5 draft.
function lastCommand(world: SubjectsWorld): CommandResult {
  const command = world.stageFinishResult ?? world.publishCommand;
  assert.ok(command, "Finish the stage or publish the draft first.");
  return command;
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

// A run after a fresh Stage 2 attempt: run.yaml keeps the entry analysis of the earlier
// attempt registered, and no selected entry analysis names it. The run and the draft
// keep the question of the earlier attempt about its candidate.
Given("a Stage 4 draft that keeps a question about an entry candidate of an earlier Stage 2 attempt", function (this: SubjectsWorld) {
  const { id, subjectRefs: [subject] } = earlierQuestion;
  assert.ok(subject, "The question of the earlier attempt names its candidate.");
  this.subjectIssue = { id, subject };
  this.stageFourRun = writeStageFourPacket(collectedAfterEarlierAttempt());
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

// Stages 1 to 3 run through their command line. Stage 1 captures the settings target
// with the rsync test double. Stage 2 runs on a saved Stage 1 run whose snapshot
// holds only app.ts, so Knip is skipped, and Stage 3 continues a Stage 2 run that
// finished through its commands. Each review is complete except for the record that
// the scenario changes.
const app = { path: "app.ts", text: "export const value = 1;\n" };
// The ID of the new gap of each stage. Stages 2 and 3 start a new ID with the attempt
// ID. The Stage 1 review has the gap s1-gap-001, and the Stage 3 review has the gap
// s3-check-gap-001 for the skipped symbol mentions.
const newGapIds = new Map([[1, "s1-gap-002"], [2, "s2-check-gap-001"], [3, "s3-check-gap-002"]]);

After({ tags: "@producer" }, function (this: SubjectsWorld) {
  if (this.earlyStageScratch) removeScratch(this.earlyStageScratch);
});

function newScratch(world: SubjectsWorld): string {
  world.earlyStageScratch = makeScratch();
  return world.earlyStageScratch;
}

function completed(stage: string, results: Record<string, CommandResult>): void {
  for (const [action, result] of Object.entries(results)) assert.equal(result.status, 0, `${stage} ${action}: ${result.stderr}`);
}

// A refused Stage 1 finish changes no file of the run.
function stageOneReview(scratch: string, gap: Record<string, unknown>): StageFinish {
  const { run, excerpt } = capturedStageOneRun(scratch);
  const packet = reviewPacket(excerpt);
  packet.review.gaps = [...packet.review.gaps as unknown[], gap];
  const review = writeReview(run, packet);
  return { stage: 1, finish: () => stageOne(run, "finish", review), published: () => folderState(run.work) };
}

function stageTwoReview(scratch: string, gap: Record<string, unknown>): StageFinish {
  const work = join(scratch, "run");
  savedStageOneRun(work, [app]);
  const attempt = stageTwoAttempt(work, "s2-check");
  completed("Stage 2", runAttempt(attempt, scratch));
  const review = analysisPacket(join(scratch, "review"), attempt.id,
    entryAnalysis(attempt, { gaps: [...requiredGaps(attempt), gap] }));
  completed("Stage 2", { "save-review": stageTwo(attempt, "save-review", [review]) });
  return { stage: 2, finish: () => stageTwo(attempt, "finish"), published: () => runFilesOutsideAttempt(work, attempt.id) };
}

function stageThreeReview(scratch: string, change: (packet: StageThreePacket) => void): StageFinish {
  const folder = join(scratch, "stage-3");
  mkdirSync(folder);
  const attempt = stageThreeAttempt(stageTwoRun(scratch), folder);
  completed("Stage 3", reviewStageThree(attempt, change));
  return { stage: 3, finish: () => stageThree(attempt, ["stage-3-finish"]),
    published: () => runFilesOutsideAttempt(attempt.work, attempt.id) };
}

Given("a Stage {int} review with a new gap whose subject is {string}", function (this: SubjectsWorld, stage: number,
  subject: string) {
  const id = newGapIds.get(stage);
  assert.ok(id, "Stages 1, 2 and 3 have a review that the operator finishes.");
  const gap = { id, kind: "missing-input", subjectRefs: [subject], reason: "The review names a file that it did not find.",
    evidenceRefs: ["inventory-001"] };
  this.subjectIssue = { id, subject };
  const scratch = newScratch(this);
  readyToFinish(this, stage === 1 ? stageOneReview(scratch, gap) : stage === 2 ? stageTwoReview(scratch, gap)
    : stageThreeReview(scratch, (packet) => { packet.analysis.gaps = [...packet.analysis.gaps as unknown[], gap]; }));
});

Given("a Stage 3 review whose inspection priority names {string}", function (this: SubjectsWorld, subject: string) {
  readyToFinish(this, stageThreeReview(newScratch(this), (packet) => {
    const [priority] = packet.analysis.inspectionPriorities as Record<string, unknown>[];
    assert.ok(priority, "The Stage 3 review has no inspection priority.");
    priority.subjectRefs = [subject];
    this.subjectIssue = { id: String(priority.id), subject };
  }));
});

Then("the operator is told which inspection priority names nothing", function (this: SubjectsWorld) {
  const message = lastCommand(this).stderr;
  const { id, subject } = addedIssue(this);
  assert.ok(message.startsWith(`The subject ${subject} of the inspection priority ${id} names nothing.`), message);
});
