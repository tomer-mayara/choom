import { expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type { BaselineV6 } from "@choom/baseline-model/contracts";
import { fixtureValue, rewriteProposal, stageFiveBoundary } from "../../fixtures/boundary-publication/fixture.ts";
import { publishStageFive } from "../../fixtures/stage-5-publication/fixture.ts";

test.each<[string, (baseline: BaselineV6) => void, RegExp]>([
  ["mapped caller symbol", ({ boundaryReview: r }) => {
    fixtureValue(r.accesses.find((site) => site.id === "helper-loader-call")).callerUnitId = "helper-rest";
  }, /caller.*(part|symbol)|mapped caller/i],
  ["exact emitted location", ({ boundaryReview: r }) => {
    const pair = fixtureValue(fixtureValue(r.accesses.find((site) => site.id === "test-port-call")).emittedCopies?.[0]);
    pair.emittedRef = fixtureValue(r.sourceNotes.find((note) => note.location.path.endsWith("collector.ts"))).evidenceRef;
  }, /emitted|source map/i],
  ["scoped caller inventory", ({ boundaryReview: r }) => {
    fixtureValue(r.callerSearches.find((search) => search.operationId === "checkpoint")).coverage.examinedUnitIds = ["port"];
  }, /caller search|examined/i],
])("checks %s while publishing the final map", (_label, change, message) => {
  const fixture = stageFiveBoundary("none", true);
  try {
    rewriteProposal(fixture.reviewFive, change);
    const outcome = publishStageFive(fixture, "check");
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toMatch(message);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 60_000);

test("a claimed inventory root covers the complete mapped JS and TS inventory in that root", () => {
  const fixture = stageFiveBoundary("none");
  try {
    rewriteProposal(fixture.reviewFive, ({ boundaryReview: review }) => {
      const record = fixtureValue(review.checks[0]);
      record.coverage.inventoryRoots = ["src"];
    });
    const invalid = publishStageFive(fixture, "check");
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("inventory");
    rewriteProposal(fixture.reviewFive, ({ boundaryReview: review }) => {
      const record = fixtureValue(review.checks[0]);
      record.coverage.inventoryRoots = ["src/history/read.ts"];
    });
    const valid = publishStageFive(fixture, "check");
    expect([valid.status, valid.stderr]).toEqual([0, ""]);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 60_000);
