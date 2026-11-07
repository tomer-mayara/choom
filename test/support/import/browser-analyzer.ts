import assert from "node:assert/strict";
import { analyzerContracts } from "../../../src/platform/analyzer-contract.ts";
import type { DepCruiserNativeFailure } from "../../../src/platform/generated/contracts.ts";
import { object, type ImportFixture } from "./fixtures.ts";
import type { BrowserImportControls } from "./browser-controls.ts";

function failure(code: DepCruiserNativeFailure["code"], message: string, stage: DepCruiserNativeFailure["stage"] = "analysis"): DepCruiserNativeFailure {
  return { status: "failure", stage, code, message, durationMs: 1 };
}

export class BrowserAnalyzerTransport {
  private readonly fixture: ImportFixture;
  private readonly controls: BrowserImportControls;
  private readonly jobs = new Map<string, { cancelled: boolean }>();
  private nextJob = 0;

  constructor(fixture: ImportFixture, controls: BrowserImportControls) { this.fixture = fixture; this.controls = controls; }

  async invoke(command: string, request: unknown): Promise<unknown> {
    switch (command) {
      case "depcruiser_prepare": return this.prepare(request);
      case "depcruiser_run": return this.run(request);
      case "depcruiser_cancel": return this.cancel(request);
      case "depcruiser_release": return this.release(request);
      default: throw new Error(`Unexpected analyzer command: ${command}`);
    }
  }

  private prepare(request: unknown): unknown {
    const contract = analyzerContracts.prepareDepCruiser;
    contract.request.parse(request);
    const prerequisite = this.fixture.facts.missingPrerequisite;
    if (typeof prerequisite === "string") {
      this.controls.observe("execution-condition-delivered", `depcruiser_prepare returned the missing prerequisite: ${prerequisite}`);
      const missing = prerequisite.includes("discoverable") || prerequisite.includes("repository-local");
      const node = prerequisite.includes("Node");
      const code = node ? missing ? "node-not-found" : "unsupported-node" : missing ? "analyzer-not-found" : "unsupported-analyzer";
      return contract.outcome.parse(failure(code, `${prerequisite} is required.`, "setup"));
    }
    const jobId = `analysis-${++this.nextJob}`;
    this.jobs.set(jobId, { cancelled: false });
    return contract.outcome.parse({ status: "success", value: { jobId } });
  }

  private async run(request: unknown): Promise<unknown> {
    const contract = analyzerContracts.runDepCruiser;
    const { jobId } = contract.request.parse(request);
    const job = this.jobs.get(jobId);
    assert.ok(job, "The application must run its prepared job");
    const execution = this.fixture.facts.execution;
    if (execution) {
      this.controls.observe("execution-condition-delivered", "depcruiser_run consumed the scenario's execution condition");
      return contract.outcome.parse(this.executionFailure(object(execution)));
    }
    const operation = this.fixture.facts.holdOperation;
    if (operation === "a repository analysis" || operation === "cancellation of a load") {
      await this.controls.hold("analysis", operation === "a repository analysis" ? "analysis-held" : undefined);
    }
    if (job.cancelled) return contract.outcome.parse({ status: "cancelled", durationMs: 1 });
    this.controls.observe("recorded-report-delivered", "depcruiser_run returned the recorded vendor JSON to the real report converter");
    return contract.outcome.parse({
      status: "completed", reportJson: JSON.stringify(this.fixture.report), version: "18.7.2",
      workingDirectory: ".", completedAtMs: Date.UTC(2026, 0, 1), durationMs: 1,
    });
  }

  private executionFailure(execution: Record<string, unknown>): DepCruiserNativeFailure {
    if (execution.timeout) return failure("timed-out", "The analysis timed out.");
    if (execution.exitCode) return failure("execution-failed", "Analysis did not complete.");
    if (execution.report === null) return failure("report-missing", "The analysis report is missing.");
    return failure("report-invalid", execution.reportText === "not-json" ? "The analysis report is invalid." : "The analysis report is incomplete.");
  }

  private async cancel(request: unknown): Promise<unknown> {
    const contract = analyzerContracts.cancelDepCruiser;
    const { jobId } = contract.request.parse(request);
    const job = this.jobs.get(jobId);
    assert.ok(job, "Cancellation must identify an owned analysis job");
    job.cancelled = true;
    this.controls.releaseIfHeld("analysis");
    if (this.fixture.facts.holdOperation === "cancellation of a load") {
      await this.controls.hold("cancellation cleanup", "cancellation-cleanup-held");
    }
    return contract.outcome.parse({ status: "success", stopped: true });
  }

  private release(request: unknown): unknown {
    const contract = analyzerContracts.releaseDepCruiser;
    const { jobId } = contract.request.parse(request);
    assert.ok(this.jobs.delete(jobId), "Release must identify an owned analysis job");
    return contract.outcome.parse({ status: "success", released: true });
  }
}
