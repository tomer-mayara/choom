import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import type { DuplicationReport } from "../../src/domain/generated/contracts.ts";
import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { interfaceSourceFixture } from "./interface-source-fixtures.ts";
import { sourceUsageBaseline } from "./source-usage-fixtures.ts";

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

/** Synthetic version 3 fixture; it is not a published analysis. */
export function duplicationV3Fixture() {
  const fixture = duplicationUiFixture();
  const baseline = { ...fixture.baseline, formatVersion: 3 as const, sourceUsage: sourceUsageBaseline().sourceUsage };
  const create = fixtureItem(fixtureItem(baseline.interfaces, 1).documentation?.entries ?? []);
  create.signature = { ...proposed("createInvoice(order: Order): Promise<Invoice>"), evidenceRefs: ["reviewed-invoice-source"] };
  fixture.finding.facts = [
    { endpoint: { interfaceId: "invoice-api" }, topic: "success", basis: "recorded-contract", field: "summary" },
    { endpoint: { interfaceId: "invoice-api", entryId: "invoice-type" }, topic: "success", basis: "recorded-contract", field: "kind" },
    { endpoint: { interfaceId: "invoice-lookup", entryId: "create-invoice" }, topic: "input", basis: "recorded-contract", field: "signature" },
    { endpoint: { interfaceId: "invoice-lookup", entryId: "create-invoice" }, topic: "input", basis: "recorded-contract", field: "interaction.input" },
  ];
  const baselineText = JSON.stringify(baseline);
  const sha256 = createHash("sha256").update(baselineText).digest("hex");
  const report = { ...fixture.report, baseline: { id: baseline.id, formatVersion: 3 as const, sha256 } };
  return { baseline, baselineText, report, finding: fixture.finding, sha256 };
}
