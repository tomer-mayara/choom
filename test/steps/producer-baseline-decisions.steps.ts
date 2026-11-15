import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse, stringify } from "yaml";
import { type CommandResult, runCli } from "../../packages/producer/test/support/commands.ts";
import { completedRun, type CompletedRunFixture, type FixtureBaseline, type FixtureComponent }
  from "../../packages/producer/test/support/completed-run.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";

// The scenarios record decisions about the published baseline of a run that Stage 6
// completed, through the producer command line. A fictional model made the run's
// readiness review, so the run's LLM call record names that model. In the fixture,
// the component http is named Billing.
interface DecisionEntry { action: string; itemId: string; field: string; oldValue?: unknown; newValue?: unknown }
interface DecisionFile {
  formatVersion: number;
  id: string;
  baselineRef: string;
  baselineDigest: string;
  decider: { name: string; kind: string };
  decidedAt: string;
  entries: DecisionEntry[];
}
interface RecordedDecisions {
  path: string;
  sha256: string;
  decider: { name: string; kind: string };
  decidedAt: string;
  statements: { action: string; statement: string }[];
}

interface DecisionsWorld extends World {
  decisionsRun?: CompletedRunFixture;
  decisionFile?: string;
  decisionsBefore?: [string, string][];
  decideCommand?: CommandResult;
  // A text that the refusal must name, such as the model that cannot decide.
  refusalNames?: string;
}

const runModel = "Fictional Model 7";
const person = "Ada Example";
const decidedAt = "2026-11-15T10:30:00Z";
const recordPath = "decisions/decisions-001.yaml";
const billingPurpose = "Bill the saved orders.";
const correctedPurpose = "Bill each saved order once.";
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function nameBilling(baseline: FixtureBaseline): void {
  const http = baseline.components.find((component) => component.id === "http");
  assert.ok(http, "The fixture has an http component.");
  http.name = "Billing";
  http.purpose.value = billingPurpose;
}

function currentRun(world: DecisionsWorld): CompletedRunFixture {
  assert.ok(world.decisionsRun, "Prepare a saved baseline first.");
  return world.decisionsRun;
}

function publishedBytes(world: DecisionsWorld): Buffer {
  const run = currentRun(world);
  return readFileSync(join(run.work, run.baselinePath));
}

function billing(world: DecisionsWorld): FixtureComponent {
  const baseline = parse(publishedBytes(world).toString("utf8")) as FixtureBaseline;
  const component = baseline.components.find((item) => item.name === "Billing");
  assert.ok(component, "The published baseline has a Billing component.");
  return component;
}

async function savedBaseline(world: DecisionsWorld): Promise<FixtureBaseline> {
  world.decisionsRun = await completedRun(runModel, nameBilling);
  return parse(publishedBytes(world).toString("utf8")) as FixtureBaseline;
}

// Writes a YAML decision file for the published baseline in a folder outside the
// run. It starts with a YAML comment that names the baseline, as a copied entry does.
function writeDecisions(world: DecisionsWorld, entries: DecisionEntry[], name = person): void {
  const run = currentRun(world);
  const digest = sha256(publishedBytes(world));
  const file: DecisionFile = { formatVersion: 1, id: "decisions-001", baselineRef: run.baselineId,
    baselineDigest: digest, decider: { name, kind: "human" }, decidedAt, entries };
  const folder = join(run.root, "decision-input");
  mkdirSync(folder, { recursive: true });
  world.decisionFile = join(folder, "decisions.yaml");
  writeFileSync(world.decisionFile, `# Baseline ${run.baselineId}, SHA-256 ${digest}\n${stringify(file)}`);
}

function lastDecide(world: DecisionsWorld): CommandResult {
  assert.ok(world.decideCommand, "Record the decisions first.");
  return world.decideCommand;
}

// The command output, after a check that the command saved the decision file once,
// unchanged, as the only new file of the run.
function recorded(world: DecisionsWorld): { output: RecordedDecisions; saved: DecisionFile } {
  const command = lastDecide(world);
  assert.equal(command.status, 0, command.stderr);
  const output = JSON.parse(command.stdout) as RecordedDecisions;
  const work = currentRun(world).work;
  assert.equal(output.path, recordPath);
  const bytes = readFileSync(join(work, recordPath));
  assert.ok(world.decisionFile, "Write the decision file first.");
  assert.deepEqual(bytes, readFileSync(world.decisionFile));
  assert.equal(output.sha256, sha256(bytes));
  const isRecord = ([path]: [string, string]): boolean => path === "decisions" || path.startsWith("decisions/");
  const after = folderState(work);
  assert.deepEqual(after.filter((entry) => !isRecord(entry)), world.decisionsBefore);
  assert.deepEqual(after.filter(isRecord), [["decisions", "folder"], [recordPath, output.sha256]]);
  return { output, saved: parse(bytes.toString("utf8")) as DecisionFile };
}

After({ tags: "@producer" }, function (this: DecisionsWorld) {
  if (this.decisionsRun) rmSync(this.decisionsRun.root, { recursive: true, force: true });
});

Given("a saved baseline with proposed statements", { timeout: 60_000 }, async function (this: DecisionsWorld) {
  const baseline = await savedBaseline(this);
  assert.ok(baseline.components.every((component) => component.purpose.status === "proposed"));
});

Given("a saved baseline in which the Billing purpose is proposed", { timeout: 60_000 }, async function (this: DecisionsWorld) {
  await savedBaseline(this);
  const { purpose } = billing(this);
  assert.deepEqual([purpose.value, purpose.status], [billingPurpose, "proposed"]);
});

Given("a decision file in which a named person accepts two of the statements", function (this: DecisionsWorld) {
  writeDecisions(this, [{ action: "accept", itemId: "cli", field: "purpose" },
    { action: "accept", itemId: "mcp", field: "groupingReason" }]);
});

Given("a decision file that corrects the Billing purpose", function (this: DecisionsWorld) {
  writeDecisions(this, [{ action: "correct", itemId: billing(this).id, field: "purpose", oldValue: billingPurpose,
    newValue: correctedPurpose }]);
});

Given("a decision file whose decider is a model named in the run's LLM records", { timeout: 60_000 },
  async function (this: DecisionsWorld) {
    await savedBaseline(this);
    // The check ignores letter case and white space at the start and end of the names.
    writeDecisions(this, [{ action: "accept", itemId: "cli", field: "purpose" }], `  ${runModel.toUpperCase()} `);
    this.refusalNames = runModel;
  });

Given("a decision file whose correction names a value that the baseline does not have", { timeout: 60_000 },
  async function (this: DecisionsWorld) {
    await savedBaseline(this);
    writeDecisions(this, [{ action: "correct", itemId: billing(this).id, field: "purpose", oldValue: "Bill the orders twice.",
      newValue: correctedPurpose }]);
  });

When("the decisions are recorded", { timeout: 60_000 }, function (this: DecisionsWorld) {
  const run = currentRun(this);
  assert.ok(this.decisionFile, "Write the decision file first.");
  this.decisionsBefore = folderState(run.work);
  this.decideCommand = runCli(["baseline", "decide", "--run", run.work, this.decisionFile]);
});

Then("the record names the person, the time and the two statements", function (this: DecisionsWorld) {
  const { output, saved } = recorded(this);
  assert.deepEqual({ decider: output.decider, decidedAt: output.decidedAt, statements: output.statements }, {
    decider: { name: person, kind: "human" }, decidedAt,
    statements: [{ action: "accept", statement: "cli.purpose" }, { action: "accept", statement: "mcp.groupingReason" }],
  });
  assert.deepEqual({ decider: saved.decider, decidedAt: saved.decidedAt, entries: saved.entries }, {
    decider: { name: person, kind: "human" }, decidedAt,
    entries: [{ action: "accept", itemId: "cli", field: "purpose" }, { action: "accept", itemId: "mcp", field: "groupingReason" }],
  });
});

Then("the record keeps the old value, the new value and the person", function (this: DecisionsWorld) {
  const { output, saved } = recorded(this);
  const component = billing(this);
  assert.deepEqual(output.statements, [{ action: "correct", statement: `${component.id}.purpose` }]);
  assert.deepEqual({ decider: saved.decider, entries: saved.entries }, {
    decider: { name: person, kind: "human" },
    entries: [{ action: "correct", itemId: component.id, field: "purpose", oldValue: billingPurpose, newValue: correctedPurpose }],
  });
  // Recording a correction does not change the published baseline.
  assert.equal(component.purpose.value, billingPurpose);
});

Then("the decisions are refused", function (this: DecisionsWorld) {
  const command = lastDecide(this);
  assert.equal(command.status, 1, command.stdout);
  assert.match(command.stderr, /^The decisions are refused:\n/);
  if (this.refusalNames !== undefined) assert.ok(command.stderr.includes(this.refusalNames), command.stderr);
  assert.deepEqual(folderState(currentRun(this).work), this.decisionsBefore);
});

Then("the operator is told which statement is different", function (this: DecisionsWorld) {
  const message = lastDecide(this).stderr;
  const expected = [`${billing(this).id}.purpose`, JSON.stringify(billingPurpose), JSON.stringify("Bill the orders twice.")];
  for (const text of expected) assert.ok(message.includes(text), `${text} is not in: ${message}`);
});
