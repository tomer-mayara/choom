import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { DuplicationReport } from "../../src/domain/generated/contracts.ts";
import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { interfaceSourceFixture } from "./interface-source-fixtures.ts";

export function duplicationUiFixture() {
  const baseline = interfaceSourceFixture();
  const item = fixtureItem(baseline.interfaces);
  baseline.interfaces.push({ ...structuredClone(item), id: "invoice-lookup", name: "Invoice lookup" });
  const report = parse(readFileSync("test/fixtures/interface-duplication/review.yaml", "utf8")) as DuplicationReport;
  report.baseline = { ...report.baseline, id: baseline.id, formatVersion: baseline.formatVersion };
  report.scan = { ...report.scan, status: "completed", diagnostics: [], mappingGaps: [],
    counts: { examined: 1, excluded: 0, unsupported: 0, helperOnly: 0, unmapped: 0 } };
  report.review.gaps = [];
  const finding = fixtureItem(report.findings);
  finding.endpoints = [
    { interfaceId: item.id, evidenceRefs: ["fixture-mapping"] },
    { interfaceId: "invoice-lookup", evidenceRefs: ["fixture-mapping"] },
  ];
  finding.observations = [{ ...fixtureItem(finding.observations), endpoints: [
    { interfaceId: item.id, entryId: "invoice-type", evidenceRefs: ["fixture-mapping"] },
    { interfaceId: "invoice-lookup", entryId: "create-invoice", evidenceRefs: ["fixture-mapping"] },
  ] }];
  finding.overlap = "Illustrative overlap for the selected entries.";
  return { baseline, report, finding };
}

export function duplicationUnknownOwnerFixture() {
  const fixture = duplicationUiFixture();
  fixtureItem(fixture.baseline.interfaces, 1).owner = proposed(null);
  return fixture;
}
