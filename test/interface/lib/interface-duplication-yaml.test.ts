import { expect, expectTypeOf, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { decodeBaselineYaml } from "../../../src/lib/baseline-yaml.ts";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import type { DuplicationReportCodec } from "../../../src/lib/generated/contracts.ts";
import { decodeDuplicationReportYaml, duplicationReportCodec } from "../../../src/lib/interface-duplication-yaml.ts";
import { duplicationFixture } from "../../support/duplication-fixtures.ts";
import { duplicationV3Fixture } from "../../support/interface-duplication-fixtures.ts";

test("generated and runtime report contracts accept a version 3 baseline binding", () => {
  const { baseline, report, sha256 } = duplicationV3Fixture();
  const schemas = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }));
  const validate = schemas.compile({ $ref: "DuplicationReport.json" });
  expect(validate(report)).toBe(true);
  expect(duplicationReportCodec.decode(JSON.stringify(report), baseline, sha256)).toMatchObject({ status: "success", report });
});

test("version 3 reports still require supported versions, exact bytes and resolvable facts", () => {
  const { baseline, report, sha256 } = duplicationV3Fixture();
  for (const changed of [
    { ...report, baseline: { ...report.baseline, formatVersion: 4 } },
    { ...report, findings: report.findings.map((finding) => ({ ...finding, facts: [{
      endpoint: { interfaceId: "invoice-api", entryId: "invoice-type" },
      topic: "input", basis: "recorded-contract", field: "interaction.input",
    }] })) },
  ]) {
    expect(duplicationReportCodec.decode(JSON.stringify(changed), baseline, sha256))
      .toMatchObject({ status: "failure", code: "invalid-document" });
  }
  for (const binding of [{ ...report.baseline, formatVersion: 2 }, { ...report.baseline, sha256: "0".repeat(64) }]) {
    expect(duplicationReportCodec.decode(JSON.stringify({ ...report, baseline: binding }), baseline, sha256))
      .toMatchObject({ status: "failure", code: "baseline-mismatch" });
  }
});

test("a matching saved report exposes findings without a source checkout", () => {
  const bytes = readFileSync("test/fixtures/baseline-viewer/full.yaml");
  const baseline = decodeBaselineYaml(bytes.toString("utf8"));
  expect(baseline.status).toBe("success");
  if (baseline.status !== "success") throw new Error("Invalid baseline fixture.");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const report = readFileSync("test/fixtures/interface-duplication/review.yaml", "utf8");
  expect(decodeDuplicationReportYaml(report, baseline.baseline, digest)).toMatchObject({
    status: "success", report: { id: "illustrative-duplication-review", review: { inspected: 1 } },
  });
});

test("the report decoder conforms to the generated TypeSpec outcome", () => {
  expectTypeOf(duplicationReportCodec).toExtend<DuplicationReportCodec>();
  const schemas = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }));
  const validate = schemas.compile({ $ref: "DecodeDuplicationReportOutcome.json" });
  const { baseline, report, sha256 } = duplicationFixture();
  const outcome = duplicationReportCodec.decode(JSON.stringify(report), baseline, sha256);
  expect(outcome.status).toBe("success");
  expect(validate(outcome)).toBe(true);
  const invalid = duplicationReportCodec.decode("invalid: yaml", baseline, sha256);
  expect(invalid.status).toBe("failure");
  expect(validate(invalid)).toBe(true);
});

test("the report boundary rejects unknown fields, versions and invalid structural scores", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  expect(decodeDuplicationReportYaml(JSON.stringify({ ...report, formatVersion: 2 }), baseline, sha256))
    .toMatchObject({ status: "failure", code: "unsupported-version" });
  expect(decodeDuplicationReportYaml(JSON.stringify({ ...report, extra: true }), baseline, sha256))
    .toMatchObject({ status: "failure", code: "invalid-document" });
  const observation = report.findings[0]?.observations[0];
  if (!observation) throw new Error("Missing fixture observation.");
  observation.score = 1.01;
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256))
    .toMatchObject({ status: "failure", code: "invalid-document" });
});

test("report decoding keeps strict YAML protections", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  for (const text of ["id: !tag report", "id: &ref report\nother: *ref", `${JSON.stringify(report)}\n---\n{}`]) {
    expect(decodeDuplicationReportYaml(text, baseline, sha256)).toMatchObject({ status: "failure", code: "invalid-encoding" });
  }
});

test("binding checks exact baseline identity, version and bytes", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  const encoded = JSON.stringify(report);
  for (const changed of ["0".repeat(64), "not-a-digest"]) {
    expect(decodeDuplicationReportYaml(encoded, baseline, changed)).toMatchObject({ status: "failure", code: "baseline-mismatch" });
  }
  for (const binding of [{ ...report.baseline, id: "another-baseline" }, { ...report.baseline, formatVersion: 2 }]) {
    expect(decodeDuplicationReportYaml(JSON.stringify({ ...report, baseline: binding }), baseline, sha256))
      .toMatchObject({ status: "failure", code: "baseline-mismatch" });
  }
});

test("binding rejects foreign endpoints, entry references in version 1 and unrelated observations", () => {
  for (const problem of ["foreign-interface", "version-1-entry", "unrelated-observation"] as const) {
    const { baseline, report, sha256 } = duplicationFixture();
    const finding = report.findings[0];
    const endpoint = finding?.endpoints[0];
    const observation = finding?.observations[0]?.endpoints[0];
    if (!endpoint || !observation) throw new Error("Missing fixture endpoints.");
    if (problem === "foreign-interface") endpoint.interfaceId = "unknown";
    if (problem === "version-1-entry") endpoint.entryId = "entry";
    if (problem === "unrelated-observation") observation.interfaceId = "interface-domain-model";
    expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256))
      .toMatchObject({ status: "failure", code: "invalid-document" });
  }
});

test("one grouped finding cannot be repeated under a different ID or reversed endpoints", () => {
  const { baseline, report, sha256 } = duplicationFixture();
  const first = report.findings[0];
  if (!first) throw new Error("Missing finding.");
  report.findings.push({ ...structuredClone(first), id: "another-id", endpoints: [...first.endpoints].reverse() });
  report.review.inspected = 2;
  expect(decodeDuplicationReportYaml(JSON.stringify(report), baseline, sha256))
    .toMatchObject({ status: "failure", code: "invalid-document" });
});
