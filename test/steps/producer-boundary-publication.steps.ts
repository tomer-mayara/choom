import { join } from "node:path";
import { publishStageFive, type StageFivePublication } from "../../packages/producer/test/fixtures/stage-5-publication/fixture.ts";
import { fixtureValue, readProposal, rewriteProposal, stageFourBoundary, success, limit, proposalPath, readiness, saveSix, sourcePaths, stageFiveBoundary, writeReadiness }
  from "../../packages/producer/test/fixtures/boundary-publication/fixture.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import type { CommandResult } from "../../packages/producer/test/support/commands.ts";

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { publishStageFour, type StageFourPublication } from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";

interface PublicationWorld extends World { proposal: StageFourPublication }
const time = { timeout: 120_000 };

After({ tags: "@producer and @cr005" }, function (this: PublicationWorld) {
  if (this.proposal) rmSync(this.proposal.root, { recursive: true, force: true });
});

Given("a CLI imports the loader's implementation file and calls its exported load method", time, function (this: PublicationWorld) {
  this.proposal = stageFourBoundary("direct");
});
When("Stage 4 publishes the reviewed proposal", time, function (this: PublicationWorld) {
  for (const action of ["check", "finish", "verify"] as const) success(publishStageFour(this.proposal, action));
});
Then("it records the actual import path, the named operation, both owners and their evidence", function (this: PublicationWorld) {
  const { accesses, units, sourceNotes } = readProposal(this.proposal).boundaryReview;
  const site = accesses.find((access) => access.id === "collector-loader-call");
  assert.ok(site);
  assert.equal(site.writtenPath, "./config/loader");
  assert.equal(site.member, "GlobalConfigLoader.load");
  assert.deepEqual([site.callerUnitId, site.targetUnitId].map((id) => units.find((unit) => unit.id === id)?.ownerId),
    ["collector", "configuration"]);
  assert.ok(site.evidenceRefs.every((ref) => sourceNotes.some((note) => note.evidenceRef === ref)));
});

Given("a bound call to another component's helper with no public entry or known policy", time, function (this: PublicationWorld) {
  this.proposal = stageFourBoundary("unresolved");
});
When("Stage 4 publishes the review", time, function (this: PublicationWorld) {
  success(publishStageFour(this.proposal, "finish"));
});
Then("the result names the helper and both owners and marks permission undetermined", function (this: PublicationWorld) {
  const review = readProposal(this.proposal).boundaryReview;
  const site = review.accesses.find(({ id }) => id === "collector-helper-call");
  assert.ok(site);
  assert.equal(site.member, "prepare");
  assert.deepEqual([site.callerUnitId, site.targetUnitId].map((id) => review.units.find((unit) => unit.id === id)?.ownerId),
    ["collector", "history"]);
  const member = review.operations.find((op) => op.id === site.operationId);
  assert.equal(member?.interfaceId, undefined);
  assert.equal(member?.visibility, "unknown");
  assert.equal(review.checks.some((item) => item.accessIds.includes(site.id) && item.result !== "unknown"), false);
  assert.ok(review.accesses.some((access) => access.targetUnitId === null && access.reason));
});

Given("an active rule forbids History from reaching Loader", time, function (this: PublicationWorld) {
  this.proposal = stageFourBoundary("indirect");
});
Given("the saved graph contains History to Helper to Loader in one resolution context", function (this: PublicationWorld) {
  assert.ok(this.proposal.attempt);
});
When("the producer checks the rule", time, function (this: PublicationWorld) {
  success(publishStageFour(this.proposal, "check"));
  success(publishStageFour(this.proposal, "finish"));
});
Then("one forbidden result cites both edges in order and the effective rule", function (this: PublicationWorld) {
  const review = readProposal(this.proposal).boundaryReview;
  const [check] = review.checks;
  assert.equal(check?.result, "forbidden");
  assert.deepEqual(check.accessIds, ["history-helper-import", "helper-loader-import"]);
  assert.equal(review.rules.find(({ id }) => id === check.ruleId)?.authority, "repository");
});

interface FinalWorld extends PublicationWorld { proposal: StageFivePublication; readiness: string; result: CommandResult }

function readHandoffSummary(proposal: StageFivePublication) {
  const record = JSON.parse(readFileSync(join(proposal.work, "evidence/s6-boundaries/handoff.json"), "utf8")) as {
    boundarySummary: { source: { projectKey: string }; component: string | null; operation: string | null; caller: string | null; evidenceRefs: string[] };
  };
  return record.boundarySummary;
}

Given("the final symbol map assigns the target to Storage", time, function (this: FinalWorld) {
  this.proposal = stageFiveBoundary("direct", true);
});
When("Stage 5 publishes the reconciled crossing", time, function (this: FinalWorld) {
  for (const action of ["check", "finish", "verify"] as const) success(publishStageFive(this.proposal, action));
});
Then("both owners refer to the selected mapping and the target owner is Storage", function (this: FinalWorld) {
  const review = readProposal(this.proposal).boundaryReview;
  assert.equal(review.identity.mappingRef, "s5-check-file@code-mapping.json");
  const site = fixtureValue(review.accesses.find((site) => site.id === "collector-helper-call"));
  const target = review.units.find((unit) => unit.id === site.targetUnitId);
  assert.equal(target?.symbol, "prepare");
  assert.equal(target.ownerId, "storage");
  assert.equal(review.units.find((unit) => unit.id === site.callerUnitId)?.ownerId, "collector");
});

Given("a test call to commit and an emitted call proven to be its copy", time, function (this: FinalWorld) {
  this.proposal = stageFiveBoundary("direct");
});
When(/^Stage 5 publishes (?:the|their) review$/, time, function (this: FinalWorld) {
  success(publishStageFive(this.proposal, "finish"));
});
Then("one test site retains the two locations", function (this: FinalWorld) {
  const review = readProposal(this.proposal).boundaryReview;
  const sites = review.accesses.filter((site) => site.kind === "call" && site.member === "commit");
  assert.deepEqual(sites.map((site) => site.callerRole), ["test"]);
  const copy = sites[0]?.emittedCopies?.[0];
  assert.ok(copy);
  assert.deepEqual([copy.sourceRef, copy.emittedRef].map((ref) => review.sourceNotes.find((n) => n.evidenceRef === ref)?.location.path),
    [sourcePaths.test, sourcePaths.emitted]);
});

Given("a complete production caller search for one port and a partial search for another", time, function (this: FinalWorld) {
  this.proposal = stageFiveBoundary("none");
});
Then("the first port has a verified zero", function (this: FinalWorld) {
  const review = readProposal(this.proposal).boundaryReview;
  assert.equal(review.callerSearches.find((s) => s.operationId === "checkpoint")?.coverage.status, "complete");
  assert.equal(review.accesses.filter((site) => site.callerRole === "production" && site.operationId === "checkpoint").length, 0);
});
Then("the second port has incomplete coverage", function (this: FinalWorld) {
  const search = readProposal(this.proposal).boundaryReview.callerSearches.find((s) => s.operationId === "port");
  assert.equal(search?.coverage.status, "partial");
  assert.ok(search.coverage.limitations.includes(limit));
});

Given("the Stage 5 digests and selected references match but readiness omits the required v6 check", time, function (this: FinalWorld) {
  this.proposal = stageFiveBoundary("direct");
  this.readiness = readiness(this.proposal, false);
});
When("stage-6 start checks the readiness packet", time, function (this: FinalWorld) {
  this.result = saveSix(this.proposal, ["start", this.readiness]);
});
Then("preparation stops and names the missing boundary-review check", time, function (this: FinalWorld) {
  assert.equal(this.result.status, 1);
  assert.match(this.result.stderr, /boundary-review/);
  const corrected = writeReadiness(this.proposal, true);
  success(saveSix(this.proposal, ["start", corrected]));
});

Given("approved Stage 5 v6 bytes with a loader, a test fixture and a coverage limit", time, function (this: FinalWorld) {
  this.proposal = stageFiveBoundary("direct");
  this.readiness = readiness(this.proposal);
});
When("the manager runs stage-6 finish and verify and opens the fixed file", time, function (this: FinalWorld) {
  success(saveSix(this.proposal, ["start", this.readiness]));
  for (const action of ["finish", "verify"]) success(saveSix(this.proposal, [action]));
});
Then("its bytes equal the proposal and the reader returns the recorded roles, access and limit", function (this: FinalWorld) {
  const bytes = readFileSync(join(this.proposal.work, proposalPath));
  assert.deepEqual(bytes, readFileSync(join(this.proposal.reviewFive, "baseline.proposed.yaml")));
  const release = new URL("../fixtures/baseline-viewer/published-boundary-after.yaml", import.meta.url);
  assert.deepEqual(bytes, readFileSync(release));
  const summary = readHandoffSummary(this.proposal);
  assert.equal(summary.source.projectKey, "TraceRelic");
  assert.equal(summary.component, "Configuration");
  assert.equal(summary.operation, "GlobalConfigLoader.load()");
  assert.equal(summary.caller, "Local collector");
  assert.ok(summary.evidenceRefs.length);
  const opened = decodeBaselineYaml(bytes.toString("utf8"));
  assert.equal(opened.status, "success");
  if (opened.status !== "success" || opened.baseline.formatVersion !== 6) throw new Error("Open the verified v6 proposal.");
  const review = opened.baseline.boundaryReview;
  assert.ok(review.componentScopes.some((s) => s.roles.includes("test")));
  assert.ok(review.accesses.some((site) => site.member === "GlobalConfigLoader.load"));
  assert.ok(review.limitations.includes(limit));
});

Given("a reviewed loader with an unknown operation role and a production call to a second component", time, function (this: FinalWorld) {
  this.proposal = stageFiveBoundary("direct");
  rewriteProposal(this.proposal.reviewFive, ({ boundaryReview }) => {
    const loader = fixtureValue(boundaryReview.operations.find((op) => op.id === "loader"));
    loader.roles = ["unknown"];
    loader.reason = "The declaration was reviewed but its production role is unresolved.";
  });
  this.readiness = readiness(this.proposal);
});
Given("a reviewed production import with no recorded production call", time, function (this: FinalWorld) {
  this.proposal = stageFiveBoundary("direct");
  rewriteProposal(this.proposal.reviewFive, ({ boundaryReview }) => {
    boundaryReview.accesses = boundaryReview.accesses.filter((site) => site.kind !== "call" || site.callerRole !== "production");
  });
  this.readiness = readiness(this.proposal);
});
When("the manager prepares the Stage 6 handoff", time, function (this: FinalWorld) {
  success(saveSix(this.proposal, ["start", this.readiness]));
});
Then("the handoff names the second operation and cites its caller and target", function (this: FinalWorld) {
  const summary = readHandoffSummary(this.proposal);
  const expected = fixtureValue(readProposal(this.proposal).boundaryReview.accesses.find((site) => site.id === "collector-helper-call"));
  assert.equal(summary.operation, "prepare()");
  assert.equal(summary.component, "Local Codex history");
  assert.equal(summary.caller, "Local collector");
  assert.deepEqual(summary.evidenceRefs, expected.evidenceRefs);
});
Then("the handoff names a declared production operation with its own evidence and an empty caller", function (this: FinalWorld) {
  const summary = readHandoffSummary(this.proposal);
  const expected = fixtureValue(readProposal(this.proposal).boundaryReview.operations.find((op) => op.id === "collector"));
  assert.equal(summary.operation, expected.name);
  assert.equal(summary.component, "Local collector");
  assert.equal(summary.caller, null);
  assert.deepEqual(summary.evidenceRefs, expected.evidenceRefs);
});
