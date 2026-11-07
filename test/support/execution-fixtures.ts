import type { AnalyzerAccess } from "../../src/platform/analyzer.ts";
import type { CancelDepCruiserOutcome, DepCruiserExecutionOutcome, DepCruiserNativeFailureCode, DepCruiserNativeProgress, PrepareDepCruiserOutcome, PrepareDepCruiserRequest, ReleaseDepCruiserOutcome } from "../../src/platform/generated/contracts.ts";
import { converterFixture } from "./converter-fixtures.ts";

export function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Deferred promise is not initialized."); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

export function nativeFailure(code: DepCruiserNativeFailureCode) {
  return { status: "failure" as const, code, stage: code === "cleanup-failed" ? "cleanup" as const : "setup" as const,
    message: `Native analysis could not proceed: ${code}.`, durationMs: 3 };
}

/** Models the native operation contract, not operating system process behavior. */
export class NativeAnalyzerDouble implements AnalyzerAccess {
  readonly preparations: PrepareDepCruiserRequest[] = [];
  readonly prepared = deferred<void>();
  readonly started = deferred<void>();
  readonly cancelStarted = deferred<void>();
  prepareGate?: ReturnType<typeof deferred<PrepareDepCruiserOutcome>>;
  runGate?: ReturnType<typeof deferred<DepCruiserExecutionOutcome>>;
  cancelGate?: ReturnType<typeof deferred<void>>;
  releaseGate?: ReturnType<typeof deferred<void>>;
  cancelResult: CancelDepCruiserOutcome = { status: "success", stopped: true };
  releaseResult: ReleaseDepCruiserOutcome = { status: "success", released: true };
  result: DepCruiserExecutionOutcome;
  clean = false;
  released = false;
  cancelCalls = 0;
  runCalls = 0;

  constructor(json = converterFixture().input.completed.json) {
    this.result = { status: "completed", reportJson: json, version: "18.7.2", workingDirectory: ".", completedAtMs: Date.parse("2026-11-06T12:00:00Z"), durationMs: 4 };
  }

  async prepareDepCruiser(request: PrepareDepCruiserRequest) {
    this.preparations.push(structuredClone(request));
    this.prepared.resolve();
    return this.prepareGate?.promise ?? { status: "success" as const, value: { jobId: "analysis-1" } };
  }

  async runDepCruiser({ jobId }: { jobId: string }, onProgress: (progress: DepCruiserNativeProgress) => void = () => {}) {
    this.runCalls += 1;
    onProgress({ jobId, stage: "setup", elapsedMs: 0 });
    onProgress({ jobId, stage: "analysis", elapsedMs: 2 });
    this.started.resolve();
    const result = await (this.runGate?.promise ?? Promise.resolve(this.result));
    this.clean = !(result.status === "failure" && result.stage === "cleanup");
    return result;
  }

  async cancelDepCruiser() {
    this.cancelCalls += 1;
    this.cancelStarted.resolve();
    await this.cancelGate?.promise;
    this.clean = this.cancelResult.status === "success";
    this.runGate?.resolve(this.cancelResult.status === "failure" ? this.cancelResult : { status: "cancelled", durationMs: 3 });
    return this.cancelResult;
  }

  async releaseDepCruiser() {
    await this.releaseGate?.promise;
    this.released = this.releaseResult.status === "success";
    if (this.released) this.clean = true;
    return this.releaseResult;
  }
}
