import { expect, test } from "bun:test";
import { nextBaselineVersion } from "../../src/baseline-decisions.ts";
import { boundaryFixture } from "../../../../test/support/boundary-baseline.ts";

test.each([
  ["config-api", "allowedConsumers", false, "needs-refresh"],
  ["configuration", "membership", false, "needs-refresh"],
  ["config-api", "owner", false, "needs-refresh"],
  ["configuration", "purpose", false, "current"],
  ["configuration", "purpose", true, "needs-refresh"],
] as const)("accepting %s.%s with an explicit boundary dependency %s leaves the review %s", (itemId, field, cited, status) => {
  const baseline = boundaryFixture();
  if (cited) baseline.boundaryReview.statementRefs = [itemId + "." + field];
  const sha256 = "a".repeat(64);
  const next = nextBaselineVersion({ baseline, sha256 }, { formatVersion: 1, id: "decision", decider: { name: "Ada", kind: "human" },
    baselineRef: baseline.id, baselineDigest: sha256, decidedAt: "2026-11-19T12:00:00Z", entries: [{ action: "accept", itemId, field }] });
  if (next.status !== "valid" || next.baseline.formatVersion !== 6) throw new Error(JSON.stringify(next));
  expect(next.baseline.boundaryReview.status).toBe(status);
  expect(baseline.boundaryReview.status).toBe("current");
});
