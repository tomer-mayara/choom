import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse, stringify } from "yaml";
import { makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { emptyReference } from "../../packages/producer/test/support/reference-baseline.ts";
import { capturedStageOneRun, newStageOneRun, reviewPacket, type ReviewPacket, settingsTarget, stageOne, type StageOneRun,
  writeReview } from "../../packages/producer/test/support/stage-1-run.ts";
import { stageTwo, stageTwoAttempt } from "../../packages/producer/test/support/stage-2-attempt.ts";

interface RoleWorld extends World {
  scratch: string;
  run: StageOneRun;
  packet: ReviewPacket;
  useRef: string;
}

After({ tags: "@s1-1" }, function (this: RoleWorld) {
  if (this.scratch) removeScratch(this.scratch);
});

Given("a test runner uses a helper and its production use has not been checked", function (this: RoleWorld) {
  this.scratch = makeScratch();
  const { run, excerpt } = capturedStageOneRun(this.scratch, { ...settingsTarget,
    "test/helper.test.ts": "import { test } from 'node:test';\nimport { value } from '../app';\ntest('reads value', () => value);\n" });
  this.run = run;
  const read = stageOne(run, "excerpt", "test/helper.test.ts", "1", "3", "Check which test uses app.ts.");
  assert.equal(read.status, 0, read.stderr);
  const site = JSON.parse(read.stdout) as typeof excerpt;
  this.useRef = site.id;
  this.packet = reviewPacket(excerpt);
  (this.packet.review.reviewedFiles as unknown[]).push({ id: site.id, snapshotRef: site.snapshotRef, path: site.path,
    sha256: site.sha256, lines: site.lines });
  (this.packet.scope.suppliedArtifactRefs as string[]).push(site.artifactRef);
  this.packet.review.roles = [{ selector: "app.ts", roles: ["source"], basis: "observed", evidenceRefs: ["inventory-001"],
    useReview: { unitScope: "unknown", basis: "partial-review", uses: [{ role: "test", evidenceRefs: [site.id] }],
      evidenceRefs: [site.id], limits: ["Production use was not checked."] } }];
});

When("stage-1 finish accepts the role review", function (this: RoleWorld) {
  const finish = stageOne(this.run, "finish", writeReview(this.run, this.packet));
  assert.equal(finish.status, 0, finish.stderr);
});

Then("the saved review cites the test use and leaves the helper's overall role unknown", function (this: RoleWorld) {
  const cookbook = readFileSync(join(this.run.work, "evidence/cookbook.md"), "utf8");
  assert.match(cookbook, /A single test registration establishes a test use/);
  assert.match(cookbook, /Include evidence used for each observed use and declaration/);
  const attempt = stageTwoAttempt(this.run.work, "s2-roles");
  const start = stageTwo(attempt, "start");
  assert.equal(start.status, 0, start.stderr);
  const handoff = JSON.parse(readFileSync(join(attempt.folder, "handoff.json"), "utf8"));
  assert.equal(handoff.roleReviewRef, "review-001");
  const run = parse(readFileSync(join(attempt.folder, "run.before.yaml"), "utf8"));
  const saved = parse(readFileSync(join(this.run.work, run.artifacts[handoff.roleReviewRef].path), "utf8"));
  assert.deepEqual(saved.roles[0].useReview, { unitScope: "unknown", basis: "partial-review",
    uses: [{ role: "test", evidenceRefs: [this.useRef] }], evidenceRefs: [this.useRef], limits: ["Production use was not checked."] });
});

interface ProjectWorld extends World {
  scratch: string;
  run: StageOneRun;
  original: Buffer;
}

After({ tags: "@s1-2" }, function (this: ProjectWorld) {
  if (this.scratch) removeScratch(this.scratch);
});

Given("a saved v6 reference for project TraceRelic", function (this: ProjectWorld) {
  this.scratch = makeScratch();
  this.original = Buffer.from("# frozen input with CRLF\r\n" + stringify(emptyReference("TraceRelic")).replaceAll("\n", "\r\n"));
  const reference = join(this.scratch, "prior.yaml");
  writeFileSync(reference, this.original);
  this.run = newStageOneRun(this.scratch);
  this.run.env.CHOOM_REFERENCE_BASELINE = reference;
});

When("I start a new run with that reference", function (this: ProjectWorld) {
  const result = stageOne(this.run, "start");
  assert.equal(result.status, 0, result.stderr);
});

Then("the run keeps the same project key and records the reference file's exact digest", function (this: ProjectWorld) {
  const inputs = JSON.parse(readFileSync(join(this.run.work, "evidence/stage1-inputs.json"), "utf8"));
  assert.equal(inputs.projectKey, "TraceRelic");
  assert.deepEqual(inputs.referenceBaseline, { artifactRef: "reference-baseline-001",
    sha256: createHash("sha256").update(this.original).digest("hex") });
  assert.deepEqual(readFileSync(join(this.run.work, "evidence/reference-baseline.yaml")), this.original);
});
