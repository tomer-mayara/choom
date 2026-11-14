import { expect, test } from "bun:test";
import { interfaceArcs } from "../../../src/lib/interface-arcs.ts";
import { fixtureItem, proposed } from "../../support/baseline-fixtures.ts";
import { sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";
import { sourceConnectionBaseline } from "../../support/source-connection-fixtures.ts";

test("repeated source sites yield one connection without changing null permission or the records", () => {
  const baseline = sourceConnectionBaseline("repeated sites");
  const before = structuredClone(baseline);
  expect(interfaceArcs(baseline)).toEqual([{
    id: '["invoice-api","checkout","billing"]', interfaceId: "invoice-api", consumerId: "checkout", ownerId: "billing",
  }]);
  expect(fixtureItem(baseline.sourceUsage.assessments).uses).toHaveLength(2);
  expect(fixtureItem(baseline.interfaces).allowedConsumers.value).toBeNull();
  expect(baseline).toEqual(before);
});

test.each(["application", "tooling"] as const)("%s value references connect the directly mapped consumer", (context) => {
  const baseline = sourceUsageBaseline();
  fixtureItem(fixtureItem(baseline.sourceUsage.assessments).uses).context = context;
  expect(interfaceArcs(baseline).map(({ consumerId, ownerId }) => [consumerId, ownerId])).toEqual([["checkout", "billing"]]);
});

test.each([
  { kind: "type", context: "application" }, { kind: "type", context: "tooling" },
  { kind: "value", context: "test" }, { kind: "value", context: "unknown" },
] as const)("$kind / $context stays in the record without a canvas connection", ({ kind, context }) => {
  const baseline = sourceUsageBaseline();
  Object.assign(fixtureItem(fixtureItem(baseline.sourceUsage.assessments).uses), { kind, context });
  expect(interfaceArcs(baseline)).toEqual([]);
  expect(fixtureItem(baseline.sourceUsage.assessments).uses).toHaveLength(1);
});

test("an unmapped caller does not suppress a different known caller", () => {
  expect(interfaceArcs(sourceConnectionBaseline("unmapped caller"))).toHaveLength(1);
});

test("unknown providers suppress only their own source connections", () => {
  const baseline = sourceUsageBaseline();
  const item = fixtureItem(baseline.interfaces);
  const assessment = fixtureItem(baseline.sourceUsage.assessments);
  baseline.interfaces.push({ ...structuredClone(item), id: "unknown-provider", owner: proposed(null) });
  baseline.sourceUsage.assessments.push({ ...structuredClone(assessment), interfaceId: "unknown-provider" });
  expect(interfaceArcs(baseline).map(({ interfaceId }) => interfaceId)).toEqual(["invoice-api"]);
});

test("source mode never falls back to or unions permissions", () => {
  expect(interfaceArcs(sourceConnectionBaseline("no source data"))).toEqual([]);
  expect(interfaceArcs(sourceConnectionBaseline("different permission")).map(({ consumerId }) => consumerId)).toEqual(["checkout"]);
});

test("separate interfaces, opposite directions, consumers and self-use keep their identities", () => {
  const baseline = sourceConnectionBaseline("self use");
  const item = fixtureItem(baseline.interfaces);
  const assessment = fixtureItem(baseline.sourceUsage.assessments);
  baseline.interfaces.push({ ...structuredClone(item), id: "checkout-status", owner: proposed("checkout") });
  baseline.sourceUsage.assessments.push({ ...structuredClone(assessment), interfaceId: "checkout-status",
    uses: [{ ...structuredClone(fixtureItem(assessment.uses)), consumerId: "billing" }] });
  baseline.interfaces.push({ ...structuredClone(item), id: "second-api" });
  baseline.sourceUsage.assessments.push({ ...structuredClone(assessment), interfaceId: "second-api" });
  expect(interfaceArcs(baseline).map(({ id }) => JSON.parse(id))).toEqual([
    ["invoice-api", "checkout", "billing"], ["invoice-api", "billing", "billing"],
    ["checkout-status", "billing", "checkout"],
    ["second-api", "checkout", "billing"], ["second-api", "billing", "billing"],
  ]);
});

test.each(["legacy 1", "legacy 2"])("%s retains its permission connection", (version) => {
  expect(interfaceArcs(sourceConnectionBaseline(version)).map(({ id }) => id)).toEqual(['["invoice-api","checkout","billing"]']);
});
