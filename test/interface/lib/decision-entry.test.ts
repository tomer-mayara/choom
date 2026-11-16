import { expect, test } from "bun:test";
import { parse } from "yaml";
import { validateDecisions } from "@choom/baseline-model/baseline-decisions";
import { baselineStatements } from "@choom/baseline-model/item-statements";
import { decisionEntryText } from "../../../src/lib/decision-entry.ts";
import { baselineExample, fixtureItem } from "../../support/baseline-fixtures.ts";
import { discoveryFixture } from "../../support/discovery-fixtures.ts";

// A copied decision-file entry: a YAML comment that names the baseline, then one
// entry of the GA-01a decision file. The decision contract and its baseline checks
// accept the entry in a decision file for the same baseline file.
function decisionFile(baseline: { id: string }, sha256: string, text: string) {
  return { formatVersion: 1, id: "decisions-001", baselineRef: baseline.id, baselineDigest: sha256,
    decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-16T09:00:00Z", entries: parse(text) as unknown };
}

test("the entry for the Billing purpose is YAML after a comment that names the baseline ID and digest", () => {
  const { baseline, sha256 } = discoveryFixture();
  expect(decisionEntryText({ id: baseline.id, sha256 }, "billing", "purpose"))
    .toBe(`# Baseline baseline-example, SHA-256 ${sha256}\n- action: accept\n  itemId: billing\n  field: purpose\n`);
});

test("the entry of each proposed statement of a baseline is a valid decision for that baseline file", () => {
  const { baseline, sha256 } = discoveryFixture();
  const proposed = baselineStatements(baseline).filter(({ statement }) => statement.status === "proposed");
  expect(proposed.length).toBeGreaterThan(5);
  for (const { itemId, field } of proposed) {
    const file = decisionFile(baseline, sha256, decisionEntryText({ id: baseline.id, sha256 }, itemId, field));
    expect(file.entries).toEqual([{ action: "accept", itemId, field }]);
    expect(validateDecisions(file, { baseline, sha256 })).toMatchObject({ status: "valid" });
  }
});

test("IDs that YAML could read as other values stay text", () => {
  const baseline = baselineExample();
  for (const [index, id] of ["null", "true", "123", "1e3"].entries()) {
    fixtureItem(baseline.components, index % 2).id = id;
    const sha256 = "a".repeat(64);
    fixtureItem(baseline.interfaces).owner.value = fixtureItem(baseline.components, 1).id;
    fixtureItem(baseline.interfaces).allowedConsumers.value = [fixtureItem(baseline.components).id];
    const file = decisionFile(baseline, sha256, decisionEntryText({ id: baseline.id, sha256 }, id, "purpose"));
    expect(file.entries).toEqual([{ action: "accept", itemId: id, field: "purpose" }]);
    expect(validateDecisions(file, { baseline, sha256 })).toMatchObject({ status: "valid" });
  }
});
