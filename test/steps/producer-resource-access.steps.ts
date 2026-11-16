import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type ExtraFile, inspectStageFour, type StageFourAttempt, stageFourAttempt }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { rangeIn } from "../../packages/producer/test/support/source-ranges.ts";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";

// The scenario prepares a run after Stage 3, runs Stage 4 start through the command
// line and collects the Stage 4 source evidence, which applies the pinned resource
// access rules of the tool checkout. The service gets a Knex client as a typed
// parameter and writes a row to a table with it. The toolchain and graph phases of
// the fixture need no Docker.
interface Candidate {
  ruleId?: unknown; operation?: unknown; resourceKind?: unknown; confidence?: unknown; path?: unknown; range?: unknown;
  expression?: unknown; name?: unknown; identity?: unknown;
}
interface CandidatesRecord { status?: unknown; candidates?: Candidate[] }

interface ResourceAccessWorld extends World {
  resourceAttempt?: StageFourAttempt;
  resourceCommand?: CommandResult;
}

const servicePath = "src/invoices.ts";
const service: ExtraFile = { path: servicePath, text: "import type { Knex } from 'knex';\n\nexport class InvoiceService {\n" +
  "  constructor(private readonly db: Knex) {}\n\n  async create(invoice: { id: string; total: number }) {\n" +
  "    await this.db('invoices').insert(invoice);\n  }\n}\n" };
const write = "this.db('invoices').insert(invoice)";

// The only candidate of the record that collect saved.
function onlyCandidate(world: ResourceAccessWorld): Candidate {
  const command = world.resourceCommand;
  assert.ok(command && world.resourceAttempt, "Collect the resource access sites first.");
  assert.equal(command.status, 0, command.stderr);
  const record = JSON.parse(readFileSync(join(world.resourceAttempt.attempt, "resource-access-candidates.json"), "utf8")) as
    CandidatesRecord;
  assert.equal(record.status, "completed");
  assert.equal(record.candidates?.length, 1);
  return record.candidates[0] as Candidate;
}

After({ tags: "@producer" }, function (this: ResourceAccessWorld) {
  if (this.resourceAttempt) rmSync(this.resourceAttempt.root, { recursive: true, force: true });
});

Given("a saved snapshot in which a service writes to the invoices table through a database client", { timeout: 120_000 },
  function (this: ResourceAccessWorld) {
    this.resourceAttempt = stageFourAttempt([service]);
  });

When("the operator collects resource access sites", { timeout: 120_000 }, function (this: ResourceAccessWorld) {
  assert.ok(this.resourceAttempt, "Prepare a saved snapshot first.");
  this.resourceCommand = inspectStageFour(this.resourceAttempt, ["collect"]);
});

Then("the access site names the write operation, the table name and the source range", function (this: ResourceAccessWorld) {
  const { ruleId, operation, resourceKind, confidence, path, range, expression, name } = onlyCandidate(this);
  // A range starts at the first character and ends after the last character, in 1-based lines and columns.
  assert.deepEqual({ ruleId, operation, resourceKind, confidence, path, range, expression, name }, {
    ruleId: "knex-insert", operation: "write", resourceKind: "database-table", confidence: "receiver-type", path: servicePath,
    range: rangeIn(service.text as string, write), expression: write, name: "invoices",
  });
});

Then("the table identity is marked as inferred, not proven", function (this: ResourceAccessWorld) {
  assert.equal(onlyCandidate(this).identity, "inferred-from-name");
});
