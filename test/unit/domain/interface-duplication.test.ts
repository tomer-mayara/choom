import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { expect, test } from "bun:test";
import { decodeDuplicationReportYaml } from "../../../src/lib/interface-duplication-yaml.ts";
import { duplicationFixture } from "../../support/duplication-fixtures.ts";
import type { DuplicationReport } from "../../../src/domain/generated/contracts.ts";
import { duplicationFindingKey, resolveDuplicationRecordedFact } from "../../../src/domain/interface-duplication.ts";
import { validateDuplicationBinding } from "../../../src/domain/duplication-binding.ts";
import { duplicationV3Fixture } from "../../support/interface-duplication-fixtures.ts";

test("version 3 resolves inherited interface and entry facts with their recorded provenance", () => {
  const { baseline } = duplicationV3Fixture();
  const item = fixtureItem(baseline.interfaces, 1);
  const documentation = item.documentation;
  const entry = documentation?.entries[0];
  if (!documentation || !entry?.signature || !entry.interaction) throw new Error("Missing documented fixture entry.");
  const cases = [
    ["summary", documentation.summary, documentation.summary.value],
    ["description", entry.description, entry.description.value],
    ["kind", entry.kind, entry.kind.value],
    ["signature", entry.signature, entry.signature.value],
    ["interaction.input", entry.interaction, entry.interaction.value.input],
    ["interaction.success", entry.interaction, entry.interaction.value.success],
    ["interaction.failures", entry.interaction, entry.interaction.value.failures],
    ["interaction.effects", entry.interaction, entry.interaction.value.effects],
  ] as const;
  for (const [field, statement, value] of cases) {
    const resolved = resolveDuplicationRecordedFact(baseline, {
      endpoint: { interfaceId: item.id, ...(field === "summary" ? {} : { entryId: entry.id }) },
      basis: "recorded-contract", topic: "success", field,
    });
    expect(resolved).toEqual({ ...statement, value });
    resolved?.evidenceRefs.push("new-reference");
    expect(statement.evidenceRefs).not.toContain("new-reference");
  }
});

test("version 3 binds distinct documented entries and still rejects a missing local entry", () => {
  const { baseline, report, finding, sha256 } = duplicationV3Fixture();
  finding.kind = "entry-pair";
  finding.endpoints = ["create-invoice", "invoice-type"].map((entryId) => ({
    interfaceId: "invoice-api", entryId, evidenceRefs: ["fixture-mapping"],
  }));
  fixtureItem(finding.observations).endpoints = structuredClone(finding.endpoints);
  finding.facts = [];
  expect(validateDuplicationBinding(report, baseline, sha256)).toEqual([]);
  fixtureItem(finding.endpoints).entryId = "absent-entry";
  expect(validateDuplicationBinding(report, baseline, sha256)).toContain("A finding names an unknown interface or entry.");
});

test("recorded comparison facts must resolve a statement on their endpoint", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  const finding = report.findings[0];
  if (!finding) throw new Error("Missing finding.");
  finding.facts = [{
    endpoint: { interfaceId: "interface-document-files" }, topic: "input", basis: "recorded-contract", field: "signature",
  }];
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("failure");
});

test("reviewed findings need one supported decision and consistent coverage", () => {
  const changes: Array<(report: DuplicationReport) => void> = [
    (report) => { report.review.inspected = 2; },
    (report) => { fixtureItem(report.findings).review = null; },
    (report) => { fixtureItem(report.findings).overlap = null; },
    (report) => { fixtureItem(report.findings).status = "justified-distinction"; fixtureItem(report.findings).differences = []; },
    (report) => { fixtureItem(report.findings).status = "insufficient-evidence"; },
    (report) => {
      const review = fixtureItem(report.findings).review;
      if (!review) throw new Error("Missing reviewed fixture.");
      review.manager = review.worker;
    },
    (report) => {
      fixtureItem(report.findings).status = "needs-review"; fixtureItem(report.findings).review = null;
      report.review.pending = 1; report.review.inspected = 0;
    },
  ];
  for (const change of changes) {
    const { baseline, report, sha256 } = duplicationFixture();
    change(report);
    expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("failure");
  }
});

test("a failed or empty scan never claims successful zero coverage", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  report.scan.status = "completed";
  report.scan.counts.examined = 0;
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("failure");
  report.scan.status = "failed";
  report.scan.diagnostics = [];
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("failure");
});

test("source references stay in the recorded snapshot and use safe inclusive ranges", () => {
  const changes = [
    { path: "../source.ts" }, { path: "/source.ts" }, { path: "C:/source.ts" }, { path: "src\\source.ts" },
    { lines: [4, 3] }, { snapshotId: "another-snapshot" },
  ];
  for (const change of changes) {
    const { baseline, report, sha256 } = duplicationFixture();
    fixtureItem(report.findings).sources = [{
      snapshotId: report.snapshot.id, path: "src/source.ts", sha256: "a".repeat(64), lines: [1, 2],
      evidenceRef: "source-evidence", ...change,
    }];
    expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("failure");
  }
});

test("source review does not invent a structural score", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  fixtureItem(fixtureItem(report.findings).observations).score = 1;
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("failure");
});

test("unknown and inapplicable source facts cannot be presented as known values", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  const finding = report.findings[0];
  if (!finding) throw new Error("Missing finding.");
  for (const state of ["known", "unknown", "not-applicable"] as const) {
    finding.facts = [{
      endpoint: { interfaceId: "interface-document-files" }, topic: "input", basis: "source-review",
      state, value: null, reason: null, evidenceRefs: [],
    }];
    expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("failure");
  }
});

test("pair identity groups entries but preserves the owner of local entry IDs", () => {
  const { report } = duplicationFixture();
  const finding = fixtureItem(report.findings);
  const key = duplicationFindingKey(report.baseline, report.snapshot, finding);
  const reversed = { ...finding, endpoints: [...finding.endpoints].reverse() };
  expect(duplicationFindingKey(report.baseline, report.snapshot, reversed)).toBe(key);
  const entryObserved = { ...finding, endpoints: finding.endpoints.map((endpoint) => ({ ...endpoint, entryId: "entry" })) };
  expect(duplicationFindingKey(report.baseline, report.snapshot, entryObserved)).toBe(key);
  const localPair = (interfaceId: string) => ({
    ...finding, kind: "entry-pair" as const,
    endpoints: ["entry-one", "entry-two"].map((entryId) => ({ interfaceId, entryId, evidenceRefs: ["mapping"] })),
  });
  const a = duplicationFindingKey(report.baseline, report.snapshot, localPair("interface-a"));
  const b = duplicationFindingKey(report.baseline, report.snapshot, localPair("interface-b"));
  expect(a).not.toBe(b);
  expect(duplicationFindingKey(report.baseline, { ...report.snapshot, inventorySha256: "b".repeat(64) }, finding)).not.toBe(key);
});

test("recorded facts preserve their original statement status and evidence", () => {
  const { baseline } = duplicationFixture();
  const item = fixtureItem(baseline.interfaces.filter((record) => record.id === "interface-document-files"));
  const resolved = resolveDuplicationRecordedFact(baseline, {
    endpoint: { interfaceId: item.id }, basis: "recorded-contract", topic: "lifecycle", field: "promises.lifecycle",
  });
  expect(resolved).toEqual({
    value: item.promises.value?.lifecycle ?? null, status: item.promises.status, evidenceRefs: item.promises.evidenceRefs,
  });
  resolved?.evidenceRefs.push("new-reference");
  expect(item.promises.evidenceRefs).not.toContain("new-reference");
});

test("unresolved overlap stays unknown and completed review can record an evidence gap", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  fixtureItem(report.findings).status = "insufficient-evidence";
  fixtureItem(report.findings).overlap = null;
  fixtureItem(report.findings).gaps = ["The access policy intent is not recorded."];
  fixtureItem(report.findings).facts = [{
    endpoint: { interfaceId: "interface-document-files" }, basis: "source-review", topic: "input",
    state: "unknown", value: null, reason: "The accepted inputs are undocumented.", evidenceRefs: [],
  }];
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("success");
  fixtureItem(report.findings).status = "needs-review";
  fixtureItem(report.findings).review = null;
  report.review = { ...report.review, status: "pending", pending: 1, inspected: 0 };
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("success");
});
