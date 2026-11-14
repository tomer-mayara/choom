import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Baseline, DuplicationReport } from "../../src/domain/generated/contracts.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { decodeDuplicationReportYaml } from "../../src/lib/interface-duplication-yaml.ts";

interface ReportWorld {
  duplicationBaseline?: Baseline;
  duplicationDigest?: string;
  duplicationText?: string;
  duplicationOutcome?: ReturnType<typeof decodeDuplicationReportYaml>;
}

Given("a duplication report and its matching saved baseline", function (this: ReportWorld) {
  const bytes = readFileSync("test/fixtures/baseline-viewer/full.yaml");
  const decoded = decodeBaselineYaml(bytes.toString("utf8"));
  assert.equal(decoded.status, "success");
  if (decoded.status !== "success") throw new Error("The baseline fixture must be valid.");
  this.duplicationBaseline = decoded.baseline;
  this.duplicationDigest = createHash("sha256").update(bytes).digest("hex");
  this.duplicationText = readFileSync("test/fixtures/interface-duplication/review.yaml", "utf8");
});

Given("the baseline bytes have a different digest", function (this: ReportWorld) {
  this.duplicationDigest = "0".repeat(64);
});

Given("the report contains many short diagnostic values within its limits", function (this: ReportWorld) {
  assert.ok(this.duplicationText);
  const report = JSON.parse(this.duplicationText) as DuplicationReport;
  report.scan.diagnostics = Array.from({ length: 130_000 }, () => "x");
  this.duplicationText = JSON.stringify(report);
});

Given("the report names an interface outside that baseline", function (this: ReportWorld) {
  assert.ok(this.duplicationText);
  this.duplicationText = this.duplicationText.replaceAll("interface-document-files", "unknown-interface");
});

When("the report reader decodes the duplication assessment", function (this: ReportWorld) {
  assert.ok(this.duplicationBaseline && this.duplicationDigest && this.duplicationText);
  this.duplicationOutcome = decodeDuplicationReportYaml(this.duplicationText, this.duplicationBaseline, this.duplicationDigest);
});

Then("the saved findings and coverage are available", function (this: ReportWorld) {
  assert.ok(this.duplicationOutcome);
  assert.equal(this.duplicationOutcome.status, "success");
  assert.partialDeepStrictEqual(this.duplicationOutcome, {
    report: { id: "illustrative-duplication-review", review: { inspected: 1, pending: 0 } },
  });
});

Then("the duplication report is refused with {string}", function (this: ReportWorld, code: string) {
  assert.ok(this.duplicationOutcome);
  assert.partialDeepStrictEqual(this.duplicationOutcome, { status: "failure", code });
});
