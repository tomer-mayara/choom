import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { makeScratch, removeScratch, runCli, toolsRoot } from "../../packages/producer/test/support/commands.ts";
import { type JsonRecord } from "../../packages/producer/test/support/stage-2-attempt.ts";
import { finishStageThree, stageThreeAttempt, type StageThreeAttempt, stageTwoRun }
  from "../../packages/producer/test/support/stage-3-attempt.ts";

interface ClueWorld extends World {
  scratch: string;
  attempt: StageThreeAttempt;
  clue: JsonRecord;
  readback: JsonRecord;
}

After({ tags: "@s3-1 or @s3-2" }, function (this: ClueWorld) { if (this.scratch) removeScratch(this.scratch); });

function prepared(world: ClueWorld, source: string, clue: JsonRecord) {
  world.scratch = makeScratch();
  const work = stageTwoRun(world.scratch, [{ path: "app.ts", text: source }]);
  world.attempt = stageThreeAttempt(work, join(world.scratch, "stage-three"));
  world.clue = { ...clue, sourceRef: world.attempt.id + "-source-app.ts" };
}

Given(/^a saved excerpt that registers GET \/health inside a Fastify injection test$/, function (this: ClueWorld) {
  prepared(this, "test('health', async () => {\n  const app = fastify();\n  app.get('/health', async () => 'ok');\n" +
    "  await app.inject({ method: 'GET', url: '/health' });\n});\n",
    { kind: "registration", operation: "GET /health", context: "test" });
});

function publish(world: ClueWorld) {
  const attempt = world.attempt;
  const results = finishStageThree(attempt, packet => {
    const { excerpts } = JSON.parse(readFileSync(join(attempt.folder, "source-excerpts.json"), "utf8"));
    const { id, snapshotRef, path, sha256, lines } = excerpts[0];
    packet.analysis.reviewedFiles = [{ id, snapshotRef, path, sha256, lines }];
    const [priority] = packet.analysis.inspectionPriorities as JsonRecord[];
    assert.ok(priority);
    priority.action = world.clue.kind === "registration" ? "Verify GET /health registration and handler." : "Check import(pluginName).";
    priority.evidenceRefs = [id, ...(world.clue.matchRef ? [world.clue.matchRef] : [])];
    priority.clue = world.clue;
    packet.prompt = readFileSync(join(attempt.folder, "review-prompt.md"), "utf8");
  });
  for (const result of Object.values(results)) assert.equal(result.status, 0, result.stderr);
  const id = "s4-handoff";
  const read = runCli(["stage-4", "start"], { CHOOM_WORK: attempt.work, CHOOM_STAGE4_ID: id, CHOOM_TOOLS: toolsRoot });
  assert.equal(read.status, 0, read.stderr);
  const folder = join(attempt.work, "evidence", id);
  const handoff = JSON.parse(readFileSync(join(folder, "handoff.json"), "utf8"));
  const run = parse(readFileSync(join(folder, "run.before.yaml"), "utf8"));
  world.readback = parse(readFileSync(join(attempt.work, run.artifacts[handoff.entryAnalysisRef].path), "utf8"));
}

When("Stage 3 publishes its inspection priorities", function (this: ClueWorld) { publish(this); });

Then("the route candidate cites that test range for Stage 4 to check", function (this: ClueWorld) {
  const [priority] = this.readback.inspectionPriorities as JsonRecord[];
  assert.ok(priority);
  assert.deepEqual(priority.clue, this.clue);
  assert.deepEqual(priority.evidenceRefs, [this.clue.sourceRef]);
  const site = (this.readback.reviewedFiles as JsonRecord[]).find(record => record.id === this.clue.sourceRef);
  assert.equal(site?.path, "app.ts");
  assert.deepEqual(site?.lines, [1, 5]);
});

Given("a saved computed import whose target the available evidence cannot identify", function (this: ClueWorld) {
  prepared(this, "export async function load(pluginName: string) {\n  return import(pluginName);\n}\n",
    { kind: "unresolved-loader", context: "unknown", matchRef: "s3-check-file@loading-search.json#/matches/0",
      expression: "import(pluginName)", missingBinding: "No declaration sets the runtime plugin name." });
});

When("Stage 3 publishes the review", function (this: ClueWorld) { publish(this); });

Then("the priority names the loader, the unknown context and the missing binding", function (this: ClueWorld) {
  const [priority] = this.readback.inspectionPriorities as JsonRecord[];
  assert.ok(priority);
  assert.deepEqual(priority.clue, this.clue);
  assert.deepEqual(priority.evidenceRefs, [this.clue.sourceRef, this.clue.matchRef]);
  assert.deepEqual((this.readback.candidates as JsonRecord[]).map(candidate => candidate.path), ["app.ts"]);
});
