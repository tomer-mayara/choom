import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse, stringify } from "yaml";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";
import { publishedFixture, type StageSixFixture, stageSix, stageSixFixture }
  from "../../packages/producer/test/support/stage-6-run.ts";

// The scenarios run Stage 6 on the Stage 6 producer fixture through the producer
// command line: start and finish save the fixed baseline and discovery result, and
// verify checks a completed run. The run manifest names the fixed records.
interface CompletedManifest { baselineRef: string; discoveryRef: string; artifacts: Record<string, { path: string; sha256: string }> }
interface DigestWorld extends World {
  digestRun?: StageSixFixture;
  digestSaveCommands?: CommandResult[];
  digestFilesBefore?: [string, string][];
  digestVerify?: CommandResult;
}

const attempt = "s6-digest";
const otherDigest = "0123456789abcdef".repeat(4);
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function currentRun(world: DigestWorld): StageSixFixture {
  assert.ok(world.digestRun, "Prepare a run first.");
  return world.digestRun;
}

// The paths of the fixed baseline and discovery result, from the registry of the completed run manifest.
function fixedRecords(run: StageSixFixture): { baseline: string; discovery: string; baselineRef: string } {
  const manifest = parse(readFileSync(join(run.work, "run.yaml"), "utf8")) as CompletedManifest;
  const path = (ref: string): string => {
    const artifact = manifest.artifacts[ref];
    assert.ok(artifact, `The run manifest registers ${ref}.`);
    return join(run.work, artifact.path);
  };
  return { baseline: path(manifest.baselineRef), discovery: path(manifest.discoveryRef), baselineRef: manifest.baselineRef };
}

function savedDiscovery(run: StageSixFixture): Record<string, unknown> {
  return parse(readFileSync(fixedRecords(run).discovery, "utf8")) as Record<string, unknown>;
}

After({ tags: "@producer" }, function (this: DigestWorld) {
  if (this.digestRun) rmSync(this.digestRun.root, { recursive: true, force: true });
});

Given("a reviewed Stage 5 run that is ready for Stage 6", async function (this: DigestWorld) {
  this.digestRun = await stageSixFixture();
});

When("the operator saves the fixed records through the command line", { timeout: 60_000 }, function (this: DigestWorld) {
  const run = currentRun(this);
  this.digestSaveCommands = [stageSix(run.work, attempt, ["start", run.review]), stageSix(run.work, attempt, ["finish"])];
});

Then("the saved discovery result has format version 2 and names the saved baseline", function (this: DigestWorld) {
  for (const command of this.digestSaveCommands ?? []) assert.equal(command.status, 0, command.stderr);
  const run = currentRun(this);
  const discovery = savedDiscovery(run);
  assert.equal(discovery.formatVersion, 2);
  assert.equal(discovery.baselineRef, fixedRecords(run).baselineRef);
});

Then("its baseline digest is the SHA-256 of the saved baseline file", function (this: DigestWorld) {
  const run = currentRun(this);
  const digest = savedDiscovery(run).baselineDigest;
  assert.match(String(digest), /^[0-9a-f]{64}$/);
  assert.equal(digest, sha256(readFileSync(fixedRecords(run).baseline)));
});

Given("a run that Stage 6 completed through the command line", { timeout: 60_000 }, async function (this: DigestWorld) {
  this.digestRun = await publishedFixture(attempt);
});

Given("the discovery result of the run names another baseline digest", function (this: DigestWorld) {
  const { discovery } = fixedRecords(currentRun(this));
  writeFileSync(discovery, stringify({ ...(parse(readFileSync(discovery, "utf8")) as object), baselineDigest: otherDigest }));
});

Given("the saved baseline file of the run changed after Stage 6", function (this: DigestWorld) {
  appendFileSync(fixedRecords(currentRun(this)).baseline, "# Saved again after Stage 6.\n");
});

When("the operator verifies the Stage 6 result", { timeout: 60_000 }, function (this: DigestWorld) {
  const run = currentRun(this);
  this.digestFilesBefore = folderState(run.work);
  this.digestVerify = stageSix(run.work, attempt, ["verify"]);
});

Then("the verification is refused and no file of the run changes", function (this: DigestWorld) {
  const verify = this.digestVerify;
  assert.ok(verify, "Verify the run first.");
  assert.equal(verify.status, 1, verify.stdout);
  assert.equal(verify.stdout, "");
  assert.deepEqual(folderState(currentRun(this).work), this.digestFilesBefore);
});

Then("the operator is told that the baseline digest of the discovery result does not match the saved baseline",
  function (this: DigestWorld) {
    const run = currentRun(this);
    const message = this.digestVerify?.stderr ?? "";
    const { baseline } = fixedRecords(run);
    assert.match(message, /baseline digest/);
    assert.ok(message.includes(String(savedDiscovery(run).baselineDigest)), message);
    assert.ok(message.includes(sha256(readFileSync(baseline))), message);
  });
