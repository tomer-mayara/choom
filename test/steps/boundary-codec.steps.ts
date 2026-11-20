import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { baselineCodec } from "../../src/lib/baseline-yaml.ts";
import { boundaryBytes, boundaryFixture } from "../support/boundary-baseline.ts";

interface BoundaryCodecWorld extends World {
  text: string;
  outcome: ReturnType<typeof baselineCodec.decode>;
}

Given("v6 bytes with a project key, both owners, a bound loader call and its source note", function (this: BoundaryCodecWorld) {
  this.text = boundaryBytes();
});

When("the shared baseline codec opens the file", function (this: BoundaryCodecWorld) {
  this.outcome = baselineCodec.decode(this.text);
});

Then("the decoded crossing retains its access path, member, scope and location", function (this: BoundaryCodecWorld) {
  assert.equal(this.outcome.status, "success", JSON.stringify(this.outcome));
  const { baseline } = this.outcome;
  assert.equal(baseline.formatVersion, 6);
  const review = baseline.boundaryReview;
  const access = review.accesses.find(({ id }) => id === "collector-call");
  assert.ok(access);
  assert.equal(review.identity.projectKey, "TraceRelic");
  assert.deepEqual([access.writtenPath, access.member, access.callerRole, access.targetRole],
    ["./config/loader", "GlobalConfigLoader.load", "production", "production"]);
  assert.deepEqual([access.callerUnitId, access.targetUnitId].map(id => review.units.find(unit => unit.id === id)?.ownerId),
    ["collector", "configuration"]);
  const note = baseline.sourceUsage?.assessments.flatMap(item => item.sourceNotes).find(note => note.evidenceRef === access.callerRef);
  assert.equal(note?.location?.path, "src/cli.ts");
  assert.deepEqual(note?.location?.lines, [2, 2]);
});

Given("an otherwise valid v6 file with a reference to a missing caller note", function (this: BoundaryCodecWorld) {
  const baseline = boundaryFixture();
  const access = baseline.boundaryReview.accesses[0];
  assert.ok(access);
  access.callerRef = "missing-caller-note";
  access.evidenceRefs = [access.callerRef];
  this.text = JSON.stringify(baseline);
});

When("the codec validates it", function (this: BoundaryCodecWorld) {
  this.outcome = baselineCodec.decode(this.text);
});

Then("the error identifies the crossing and the invalid field", function (this: BoundaryCodecWorld) {
  assert.equal(this.outcome.status, "failure");
  assert.equal(this.outcome.code, "invalid-document");
  assert.match(this.outcome.message, /boundaryReview\.accesses\.0\.callerRef/);
});
