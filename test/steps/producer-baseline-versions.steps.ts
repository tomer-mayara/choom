import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import type { baselineSchema } from "@choom/baseline-model";
import type { Baseline } from "@choom/baseline-model/contracts";
import { baselineStatements, type StatementState } from "@choom/baseline-model/item-statements";
import { type CommandResult, runCli } from "../../packages/producer/test/support/commands.ts";
import { completedRun, type CompletedRunFixture, decisionFileYaml } from "../../packages/producer/test/support/completed-run.ts";
import { folderState } from "../../packages/producer/test/support/producer-record.ts";
import { readYamlData } from "../../src/lib/architecture-yaml/parse.ts";
import { checkBaselineDisplayLimits } from "../../src/lib/baseline-display-limits.ts";

// The scenarios make the next version of the published baseline of a run that
// Stage 6 completed, through the producer command line: baseline decide records a
// decision file, and baseline next makes the version from the saved record. A
// fictional model made the readiness review of the run. The viewer validation step
// "a caller validates it for viewing" checks the new version with the shared
// baseline rules.
interface FileLink { id: string; path: string; sha256: string }
interface MadeVersion { status: string; id: string; path: string; sha256: string; decisions: FileLink }

interface VersionsWorld extends World {
  versionsRun?: CompletedRunFixture;
  decisionRecordPath?: string;
  runBefore?: [string, string][];
  nextCommand?: CommandResult;
  // The fields of the viewer validation steps.
  baselineInput?: unknown;
  originalBaseline?: unknown;
  baselineValidation?: ReturnType<typeof baselineSchema.safeParse>;
}

const runModel = "Fictional Model 7";
const decisionsId = "decisions-001";
const correctedPurpose = "Serve the saved orders over HTTP.";
// The decided statements: two accepted ones and one corrected one.
const decided = ["cli.purpose", "mcp.groupingReason", "http.purpose"];
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

function currentRun(world: VersionsWorld): CompletedRunFixture {
  assert.ok(world.versionsRun, "Prepare a saved baseline first.");
  return world.versionsRun;
}

// The statements of a baseline by their names, such as http.purpose.
function statementsByName(baseline: Baseline): Map<string, StatementState> {
  return new Map(baselineStatements(baseline).map(({ itemId, field, statement }) => [`${itemId}.${field}`, statement]));
}

function expectDecidedStatements(baseline: Baseline): void {
  const statements = statementsByName(baseline);
  for (const name of decided) {
    const statement = statements.get(name);
    assert.deepEqual([statement?.status, statement?.acceptanceRef], ["accepted", decisionsId], name);
  }
}

// A person decides about the published baseline, and baseline decide records the
// decision file in the run folder.
async function recordDecisions(world: VersionsWorld): Promise<void> {
  world.versionsRun = await completedRun(runModel);
  const run = world.versionsRun;
  const file = join(run.root, "decisions.yaml");
  writeFileSync(file, decisionFileYaml(run, [
    { action: "accept", itemId: "cli", field: "purpose" }, { action: "accept", itemId: "mcp", field: "groupingReason" },
    { action: "correct", itemId: "http", field: "purpose", oldValue: "Provide http", newValue: correctedPurpose },
  ], { id: decisionsId }));
  const decide = runCli(["baseline", "decide", "--run", run.work, file]);
  assert.equal(decide.status, 0, decide.stderr);
  world.decisionRecordPath = (JSON.parse(decide.stdout) as { path: string }).path;
}

function makeNextVersion(world: VersionsWorld): void {
  const run = currentRun(world);
  world.runBefore = folderState(run.work);
  world.nextCommand = runCli(["baseline", "next", "--run", run.work, "--decisions", decisionsId]);
}

// The command output of a made version, and the saved version.
function madeVersion(world: VersionsWorld): { output: MadeVersion; text: string; version: Baseline } {
  const command = world.nextCommand;
  assert.ok(command, "Make the next baseline version first.");
  assert.equal(command.status, 0, command.stderr);
  const output = JSON.parse(command.stdout) as MadeVersion;
  const text = readFileSync(join(currentRun(world).work, output.path), "utf8");
  return { output, text, version: parse(text) as Baseline };
}

After({ tags: "@producer" }, function (this: VersionsWorld) {
  if (this.versionsRun) rmSync(this.versionsRun.root, { recursive: true, force: true });
});

Given("a saved baseline and a recorded decision that accepts two statements and corrects one", { timeout: 60_000 },
  async function (this: VersionsWorld) {
    await recordDecisions(this);
  });

When("the operator makes the next baseline version", { timeout: 60_000 }, function (this: VersionsWorld) {
  makeNextVersion(this);
});

Then("the new version names the earlier version as its parent", function (this: VersionsWorld) {
  const { output, version } = madeVersion(this);
  const parent = currentRun(this).baselineId;
  assert.deepEqual({ id: version.id, parentId: version.parentId }, { id: output.id, parentId: parent });
  assert.notEqual(version.id, parent);
});

Then("the decided statements are accepted and refer to the decision record", function (this: VersionsWorld) {
  const { output, version } = madeVersion(this);
  expectDecidedStatements(version);
  for (const [name, statement] of statementsByName(version)) {
    if (!decided.includes(name)) assert.equal(statement.status, "proposed", name);
  }
  // The operator sees which saved decision record made the version, with its SHA-256.
  const path = this.decisionRecordPath ?? "";
  assert.deepEqual(output.decisions, { id: decisionsId, path, sha256: sha256(readFileSync(join(currentRun(this).work, path))) });
});

Then("the corrected statement has the new value", function (this: VersionsWorld) {
  assert.equal(statementsByName(madeVersion(this).version).get("http.purpose")?.value, correctedPurpose);
});

Then("the earlier version and its discovery result do not change", function (this: VersionsWorld) {
  const run = currentRun(this);
  const folder = `baselines/${madeVersion(this).output.id}`;
  const isNewVersion = ([path]: [string, string]): boolean => path === folder || path.startsWith(`${folder}/`);
  assert.deepEqual(folderState(run.work).filter((entry) => !isNewVersion(entry)), this.runBefore);
  // The registry of run.yaml still gives the digests of the saved baseline and discovery result.
  const manifest = parse(readFileSync(join(run.work, "run.yaml"), "utf8")) as {
    discoveryRef: string; artifacts: Record<string, { path: string; sha256: string }>;
  };
  for (const ref of [run.baselineId, manifest.discoveryRef]) {
    const registered = manifest.artifacts[ref];
    assert.ok(registered, `run.yaml registers ${ref}.`);
    assert.equal(sha256(readFileSync(join(run.work, registered.path))), registered.sha256, ref);
  }
});

// The viewer reads the saved file with its bounded YAML reader before it validates it.
Given("a baseline version made from recorded decisions", { timeout: 60_000 }, async function (this: VersionsWorld) {
  await recordDecisions(this);
  makeNextVersion(this);
  this.baselineInput = readYamlData(madeVersion(this).text);
});

Then("the decided statements are accepted with their reference", function (this: VersionsWorld) {
  const validation = this.baselineValidation;
  assert.ok(validation?.success, JSON.stringify(validation?.error?.issues));
  assert.deepEqual(validation.data, this.originalBaseline, "The validation keeps every saved value.");
  assert.doesNotThrow(() => checkBaselineDisplayLimits(validation.data));
  expectDecidedStatements(validation.data);
});
