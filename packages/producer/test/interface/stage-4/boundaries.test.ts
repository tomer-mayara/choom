import { expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type { BaselineRuleObject, BaselineV6 } from "@choom/baseline-model/contracts";
import { fixtureValue, rewriteProposal, stageFourBoundary } from "../../fixtures/boundary-publication/fixture.ts";
import { publishStageFour } from "../../fixtures/stage-4-publication/fixture.ts";

test.each<[string, (baseline: BaselineV6) => void, RegExp]>([
  ["written specifier", ({ boundaryReview }) => { fixtureValue(boundaryReview.accesses[0]).writtenPath = "./public"; }, /written path/i],
  ["resolved call", ({ boundaryReview }) => {
    const site = fixtureValue(boundaryReview.accesses.find((item) => item.id === "collector-loader-call"));
    delete site.operationId;
    site.member = "GlobalConfigLoader.clear";
  }, /bound call|member/i],
  ["inspected declaration", ({ boundaryReview }) => {
    fixtureValue(boundaryReview.operations.find((op) => op.id === "port")).member = "madeUp";
    for (const site of boundaryReview.accesses.filter((site) => site.operationId === "port")) site.member = "madeUp";
  }, /declaration|bound/i],
  ["selected inventory", ({ boundaryReview }) => { boundaryReview.identity.inventoryDigest = "0".repeat(64); }, /inventory/i],
])("checks a Stage 4 packet against its %s", (_name, change, expected) => {
  const fixture = stageFourBoundary("direct");
  try {
    rewriteProposal(fixture.review, change);
    const result = publishStageFour(fixture, "check");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(expected);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 60_000);

test.each<[string, (baseline: BaselineV6) => void, RegExp]>([
  ["rule settings", ({ boundaryReview: r }) => { fixtureValue(r.rules[0]).settings.name = "not-in-this-rule"; }, /rule|settings/i],
  ["effective source", ({ boundaryReview: r }) => { fixtureValue(r.checks[0]).sourceUnitId = "collector";
    fixtureValue(r.checks[0]).accessIds = ["collector-helper-import", "helper-loader-import"]; }, /applicable|source selector/i],
  ["missing dependency", ({ boundaryReview: r }) => {
    fixtureValue(r.checks[0]).result = "absent"; fixtureValue(r.checks[0]).accessIds = [];
  }, /reaches|reachable|absence/i],
])("rechecks the saved graph and %s before Stage 4 publishes a verdict", (_name, change, expected) => {
  const fixture = stageFourBoundary("indirect");
  try {
    rewriteProposal(fixture.review, change);
    const result = publishStageFour(fixture, "check");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(expected);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 60_000);

test("a second real import cannot supply another call's written route", () => {
  const fixture = stageFourBoundary("direct");
  try {
    rewriteProposal(fixture.review, ({ boundaryReview: review }) => {
      fixtureValue(review.accesses.find((site) => site.id === "collector-loader-call")).writtenPath = "./history/helper";
    });
    const invalid = publishStageFour(fixture, "check");
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("written path");
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 60_000);

test.each(["import", "call"] as const)("complete caller search must retain each bound %s from the source", (kind) => {
  const fixture = stageFourBoundary("direct");
  try {
    rewriteProposal(fixture.review, ({ boundaryReview: review }) => {
      review.accesses = review.accesses.filter((site) => site.id !== "collector-loader-" + kind);
      review.callerSearches.push({ operationId: "loader", role: "production", evidenceRefs: fixtureValue(review.operations.find((op) => op.id === "loader")).evidenceRefs,
        coverage: { status: "complete", roots: ["src/collector.ts"], examinedUnitIds: ["collector", "loader"], accessKinds: [kind],
          missingRoots: [], unresolvedAccessIds: [], limitations: [] } });
    });
    const invalid = publishStageFour(fixture, "check");
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toMatch(/omitted a bound/i);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 60_000);

test.each(["import", "call"] as const)("an unreported %s still defeats an explicit rule's absence", (direct) => {
  const fixture = stageFourBoundary("direct", { direct });
  try {
    rewriteProposal(fixture.review, ({ boundaryReview: review }) => {
      review.accesses = review.accesses.filter((site) => site.id !== "collector-loader-" + direct);
    });
    const invalid = publishStageFour(fixture, "check");
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toMatch(/absen.*bound|bound.*absen/i);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 60_000);

test.each<BaselineRuleObject>([{ doNotFollow: { path: "^src/history/helper" } }, { tsConfig: { fileName: "missing.json" } }])(
  "checks effective resolution and traversal options before reporting a finding", (options) => {
    const fixture = stageFourBoundary("indirect", { options });
    try {
      const invalid = publishStageFour(fixture, "check");
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toMatch(/settings|unknown|traversal|config/i);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }, 60_000);
