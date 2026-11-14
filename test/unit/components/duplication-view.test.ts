import { expect, test } from "bun:test";
import { duplicationCounts, findingsForRecord } from "../../../src/components/duplication-view.ts";
import { fixtureItem, proposed } from "../../support/baseline-fixtures.ts";
import { duplicationUiFixture } from "../../support/interface-duplication-fixtures.ts";

test.each(["needs-review", "potential-redundancy", "insufficient-evidence"] as const)("%s contributes one count to each direct owner", (status) => {
  const { baseline, report, finding } = duplicationUiFixture();
  fixtureItem(baseline.interfaces, 1).owner = proposed("checkout");
  baseline.components.push({ ...structuredClone(fixtureItem(baseline.components)), id: "parent", name: "Parent" });
  for (const component of baseline.components.slice(0, 2)) component.parent = proposed("parent");
  finding.status = status;
  const counts = duplicationCounts(baseline, report);
  expect([...counts.components]).toEqual([["billing", 1], ["checkout", 1]]);
  expect([...counts.interfaces]).toEqual([["invoice-api", 1], ["invoice-lookup", 1]]);
  expect(counts.components.has("parent")).toBe(false);
});

test("a same-interface entry finding counts once and is available from its interface", () => {
  const { baseline, report, finding } = duplicationUiFixture();
  finding.endpoints = [
    { interfaceId: "invoice-api", entryId: "create-invoice", evidenceRefs: ["a"] },
    { interfaceId: "invoice-api", entryId: "invoice-type", evidenceRefs: ["b"] },
  ];
  expect([...duplicationCounts(baseline, report).interfaces]).toEqual([["invoice-api", 1]]);
  expect([...duplicationCounts(baseline, report).components]).toEqual([["billing", 1]]);
  expect(findingsForRecord(baseline, report.findings, { interfaceId: "invoice-api" })).toEqual([finding]);
  expect(findingsForRecord(baseline, report.findings, {})).toEqual([finding]);
});

test("record filters retain report order and exclude unrelated findings", () => {
  const { baseline, report, finding } = duplicationUiFixture();
  const other = { ...structuredClone(finding), id: "other", endpoints: [{ interfaceId: "invoice-lookup", evidenceRefs: ["a"] }] };
  report.findings = [other, finding];
  expect(findingsForRecord(baseline, report.findings, { interfaceId: "invoice-api" })).toEqual([finding]);
  expect(findingsForRecord(baseline, report.findings, { componentId: "billing" })).toEqual([other, finding]);
  expect(findingsForRecord(baseline, report.findings, { componentId: "checkout" })).toEqual([]);
});
