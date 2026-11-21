import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { candidate, entryAnalysis, entryPlan, finishAttempt, type JsonRecord, runAttempt, stageOneRun, stageTwoAttempt,
  type StageTwoAttempt, savedJson } from "../../packages/producer/test/support/stage-2-attempt.ts";

interface ClaimsWorld extends World {
  scratch: string;
  attempt: StageTwoAttempt;
  candidates: JsonRecord[];
  selected: JsonRecord[];
}

After({ tags: "@s2-1" }, function (this: ClaimsWorld) { if (this.scratch) removeScratch(this.scratch); });

Given("a declared product command, a compiler root and a skipped production Knip run", function (this: ClaimsWorld) {
  this.scratch = makeScratch();
  const work = join(this.scratch, "run");
  const id = "s2-claims";
  stageOneRun(work, [
    { path: "app.ts", text: "console.log('collector');\n" }, { path: "root.ts", text: "export const value = 1;\n" },
    { path: "package.json", text: '{"name":"collector","bin":{"collect":"app.ts"},"knip":{}}\n' },
    { path: "tsconfig.json", text: '{"files":["root.ts"]}\n' },
  ]);
  this.attempt = stageTwoAttempt(work, id);
  this.candidates = [{ ...candidate(id), evidenceRefs: ["settings-001#/packages/0/data/bin/collect"] },
    { ...candidate(id), id: id + "-compiler-root", path: "root.ts", expression: "root.ts", origin: "inference",
      roles: ["unknown"], evidenceRefs: ["settings-001#/configs/0"] }];
  const plan = entryPlan(id, { candidates: this.candidates, runProduction: false,
    productionReason: "The production roots have not been established." });
  for (const result of Object.values(runAttempt(this.attempt, this.scratch, plan))) assert.equal(result.status, 0, result.stderr);
  const cookbook = readFileSync(join(this.attempt.folder, "cookbook.md"), "utf8");
  assert.match(cookbook, /Keep direct launch evidence/);
  assert.match(cookbook, /For each candidate add knipClaims/);
  const receipts = savedJson(this.attempt, "knip-runs.json").runs as JsonRecord[];
  assert.equal(receipts[1]?.status, "skipped");
});

When("Stage 2 selects the reviewed entry analysis", function (this: ClaimsWorld) {
  const { id, work } = this.attempt;
  const candidates = [{ ...this.candidates[0], knipClaims: [] }, { ...this.candidates[1],
    knipClaims: [{ mode: "production", receiptRef: id + "-knip-runs#/runs/1", outcome: "unknown" }] }];
  for (const result of Object.values(finishAttempt(this.attempt, this.scratch, entryAnalysis(this.attempt, { candidates }))))
    assert.equal(result.status, 0, result.stderr);
  const selected = parse(readFileSync(join(work, "discovery.yaml"), "utf8")).entryAnalysisRef;
  const run = parse(readFileSync(join(work, "run.yaml"), "utf8"));
  this.selected = parse(readFileSync(join(work, run.artifacts[selected].path), "utf8")).candidates;
});

Then("the command retains its launch evidence", function (this: ClaimsWorld) {
  assert.deepEqual(this.selected[0]?.evidenceRefs, ["settings-001#/packages/0/data/bin/collect"]);
});

Then("the compiler root's production use is unknown with the skipped-mode receipt", function (this: ClaimsWorld) {
  assert.deepEqual(this.selected[1]?.roles, ["unknown"]);
  assert.deepEqual(this.selected[1]?.knipClaims,
    [{ mode: "production", receiptRef: this.attempt.id + "-knip-runs#/runs/1", outcome: "unknown" }]);
});
