import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { decodeDuplicationReportYaml } from "../../../src/lib/interface-duplication-yaml.ts";
import { duplicationFixture } from "../../support/duplication-fixtures.ts";

test("text and references use UTF-8 byte limits, including their exact boundaries", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  const finding = fixtureItem(report.findings);
  finding.overlap = "é".repeat(8_192);
  report.runRef = "é".repeat(2_048);
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("success");
  finding.overlap += "x";
  const overText = decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256);
  expect(overText.status).toBe("failure");
  if (overText.status === "failure") expect(overText.code).toBe("limit-exceeded");
  finding.overlap = "supported overlap";
  report.runRef += "x";
  const overReference = decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256);
  expect(overReference.status).toBe("failure");
  if (overReference.status === "failure") expect(overReference.code).toBe("limit-exceeded");
});

test("all repeated string values count toward the four-MiB metadata budget", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  const limit = 4 * 1024 * 1024;
  const encoder = new TextEncoder();
  let used = 0;
  JSON.stringify(report, (_key, value: unknown) => {
    if (typeof value === "string") used += encoder.encode(value).byteLength;
    return value;
  });
  let remaining = limit - used;
  while (remaining > 0) {
    const size = Math.min(remaining, 16_384);
    report.scan.diagnostics.push("x".repeat(size));
    remaining -= size;
  }
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("success");
  report.scan.diagnostics.push("x");
  const outcome = decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256);
  expect(outcome.status).toBe("failure");
  if (outcome.status === "failure") expect(outcome.code).toBe("limit-exceeded");
}, 10_000);

test("metadata accounting accepts wide arrays within the parser and byte budgets", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  report.scan.diagnostics = Array.from({ length: 130_000 }, () => "x");
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("success");
}, 10_000);

test("a finding can contain exactly one hundred source references", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  const finding = fixtureItem(report.findings);
  finding.sources = Array.from({ length: 100 }, (_, index) => ({
    snapshotId: report.snapshot.id, path: "source.ts", sha256: "a".repeat(64), lines: [1, 2], evidenceRef: `source-${index}`,
  }));
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("success");
  finding.sources.push({ ...fixtureItem(finding.sources), evidenceRef: "source-100" });
  const outcome = decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256);
  expect(outcome.status).toBe("failure");
  if (outcome.status === "failure") expect(outcome.code).toBe("limit-exceeded");
});

test("a finding bounds complex observations and comparison facts at one hundred each", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  const finding = fixtureItem(report.findings);
  const observation = structuredClone(fixtureItem(finding.observations));
  finding.observations = Array.from({ length: 100 }, () => structuredClone(observation));
  finding.facts = Array.from({ length: 100 }, () => ({
    endpoint: { interfaceId: "interface-document-files" }, basis: "source-review" as const,
    topic: "input" as const, state: "known" as const, value: "a file", reason: null, evidenceRefs: ["fact-evidence"],
  }));
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256).status).toBe("success");
  finding.observations.push(observation);
  const overObservations = decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256);
  expect(overObservations.status).toBe("failure");
  if (overObservations.status === "failure") expect(overObservations.code).toBe("limit-exceeded");
  finding.observations.pop();
  finding.facts.push(structuredClone(fixtureItem(finding.facts)));
  const overFacts = decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256);
  expect(overFacts.status).toBe("failure");
  if (overFacts.status === "failure") expect(overFacts.code).toBe("limit-exceeded");
});

test("one thousand distinct findings fit and the next is rejected", () => {
  const { baseline, report } = duplicationFixture();
  const template = fixtureItem(baseline.interfaces);
  baseline.interfaces = Array.from({ length: 46 }, (_, index) => ({ ...structuredClone(template), id: `interface-${index}` }));
  const finding = fixtureItem(report.findings);
  report.findings = [];
  for (let a = 0; a < 46 && report.findings.length < 1_001; a++) {
    for (let b = a + 1; b < 46 && report.findings.length < 1_001; b++) {
      const endpoints = [a, b].map((id) => ({ interfaceId: `interface-${id}`, evidenceRefs: ["mapping-evidence"] }));
      report.findings.push({
        ...structuredClone(finding), id: `finding-${a}-${b}`, endpoints,
        observations: [{ ...fixtureItem(finding.observations), endpoints }],
      });
    }
  }
  const extra = fixtureItem(report.findings.splice(-1));
  report.review.inspected = 1_000;
  report.baseline.sha256 = createHash("sha256").update(JSON.stringify(baseline)).digest("hex");
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, report.baseline.sha256).status).toBe("success");
  report.findings.push(extra);
  report.review.inspected = 1_001;
  const outcome = decodeDuplicationReportYaml(JSON.stringify(report), baseline, report.baseline.sha256);
  expect(outcome.status).toBe("failure");
  if (outcome.status === "failure") expect(outcome.code).toBe("limit-exceeded");
}, 10_000);
