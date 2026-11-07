import type { AnalysisControl } from "../../domain/architectural-layer.ts";
import type { AnalysisFailure, AnalysisFailureCode } from "../../domain/generated/contracts.ts";
import type { AnalyzerAccess } from "../../platform/analyzer.ts";
import type { CancelDepCruiserOutcome, DepCruiserNativeFailure, DepCruiserNativeFailureCode, DepCruiserNativeProgress, PrepareDepCruiserRequest } from "../../platform/generated/contracts.ts";
import type { DepCruiserExecution } from "./execution.ts";
import type { DepCruiserExecutionRequest, DepCruiserRunOutcome } from "./generated/contracts.ts";

const failureCodes: Record<DepCruiserNativeFailureCode, AnalysisFailureCode> = {
  "invalid-request": "invalid-request", "invalid-session": "unavailable", "invalid-job": "execution-failed",
  busy: "unavailable", "node-not-found": "unavailable", "unsupported-node": "unsupported",
  "analyzer-not-found": "unavailable", "unsupported-analyzer": "unsupported", "unsupported-config-path": "unsupported",
  "source-changed": "source-changed", "execution-failed": "execution-failed", "timed-out": "execution-failed",
  "output-limit": "limit-exceeded", "report-missing": "execution-failed", "report-invalid": "invalid-observations",
  "cleanup-failed": "execution-failed", unavailable: "unavailable", "invalid-response": "invalid-observations",
};

function nativeFailure(failure: DepCruiserNativeFailure): AnalysisFailure {
  return { status: "failure", stage: failure.stage, code: failureCodes[failure.code], message: failure.message };
}

function executionFailure(stage: "setup" | "analysis" | "cleanup"): AnalysisFailure {
  return { status: "failure", stage, code: "execution-failed", message: stage === "cleanup" ? "The native analysis job could not be cleaned up." : "The native analysis operation could not be completed." };
}

/** Owns one prepared native job; its caller retains the repository session. */
class ExecutionAttempt {
  private readonly access: AnalyzerAccess;
  private readonly control: AnalysisControl;
  private readonly nodeExecutable: PrepareDepCruiserRequest["nodeExecutable"];
  private job?: { jobId: string };
  private cancellation?: Promise<CancelDepCruiserOutcome | AnalysisFailure>;
  private readonly startedAt = performance.now();
  private elapsed = 0;

  constructor(access: AnalyzerAccess, control: AnalysisControl, nodeExecutable: PrepareDepCruiserRequest["nodeExecutable"]) {
    this.access = access;
    this.control = control;
    this.nodeExecutable = nodeExecutable;
  }

  async run(request: DepCruiserExecutionRequest): Promise<DepCruiserRunOutcome> {
    if (this.control.signal.aborted) return { status: "cancelled" };
    this.progress({ stage: "setup", elapsedMs: 0 });
    let prepared;
    try { prepared = await this.access.prepareDepCruiser({ ...request, ...(this.nodeExecutable === undefined ? {} : { nodeExecutable: this.nodeExecutable }) }); }
    catch { return this.control.signal.aborted ? { status: "cancelled" } : executionFailure("setup"); }
    if (prepared.status === "failure") return prepared.stage !== "cleanup" && this.control.signal.aborted ? { status: "cancelled" } : nativeFailure(prepared);
    this.job = prepared.value;
    this.control.signal.addEventListener("abort", this.cancel, { once: true });
    if (this.control.signal.aborted) this.cancel();
    let result: DepCruiserRunOutcome;
    try { result = this.control.signal.aborted ? { status: "cancelled" } : await this.execute(prepared.value); }
    catch { result = executionFailure("analysis"); }
    return this.finish(result, prepared.value);
  }

  private async execute(job: { jobId: string }): Promise<DepCruiserRunOutcome> {
    const native = await this.access.runDepCruiser(job, this.progress);
    if (native.status === "failure") return nativeFailure(native);
    if (native.status === "cancelled") return { status: "cancelled" };
    return { status: "completed", durationMs: native.durationMs, report: {
      json: native.reportJson, version: native.version, workingDirectory: native.workingDirectory,
      generatedAt: new Date(native.completedAtMs).toISOString(),
    } };
  }

  private readonly progress = (event: Pick<DepCruiserNativeProgress, "stage" | "elapsedMs">): void => {
    this.elapsed = Math.max(this.elapsed, event.elapsedMs, performance.now() - this.startedAt);
    try { this.control.onProgress({ stage: event.stage, elapsedMs: this.elapsed }); } catch { /* Progress is observational; native cleanup still owns completion. */ }
  };

  private readonly cancel = (): void => {
    const job = this.job;
    if (!job || this.cancellation) return;
    this.cancellation = Promise.resolve().then(() => this.access.cancelDepCruiser(job)).catch(() => executionFailure("cleanup"));
  };

  private async finish(result: DepCruiserRunOutcome, job: { jobId: string }): Promise<DepCruiserRunOutcome> {
    await this.cancellation;
    let released;
    try { released = await this.access.releaseDepCruiser(job); }
    catch { released = executionFailure("cleanup"); }
    finally { this.control.signal.removeEventListener("abort", this.cancel); }
    const cancelled = await this.cancellation;
    if (released.status === "failure") return { ...executionFailure("cleanup"), message: released.message };
    if (cancelled?.status === "failure") return { ...executionFailure("cleanup"), message: cancelled.message };
    if (result.status === "failure" && result.stage === "cleanup") return result;
    return this.control.signal.aborted ? { status: "cancelled" } : result;
  }
}

export class DesktopDepCruiserRunner implements DepCruiserExecution {
  private readonly access: AnalyzerAccess;
  private readonly nodeExecutable: PrepareDepCruiserRequest["nodeExecutable"];

  constructor(access: AnalyzerAccess, options: Pick<PrepareDepCruiserRequest, "nodeExecutable"> = {}) {
    this.access = access;
    this.nodeExecutable = options.nodeExecutable;
  }

  run(request: DepCruiserExecutionRequest, control: AnalysisControl): Promise<DepCruiserRunOutcome> {
    return new ExecutionAttempt(this.access, control, this.nodeExecutable).run(request);
  }
}
