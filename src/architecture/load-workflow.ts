import type { Baseline } from "../domain/generated/contracts.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { BaselineDisplayLimitError, displayLimitMessage } from "../lib/baseline-display-limits.ts";
import { decodeBaselineYaml } from "../lib/baseline-yaml.ts";
import type { ReadDocumentTextOutcome } from "../platform/generated/contracts.ts";
import type { WorkflowFailure, WorkflowOperations, WorkflowOutcome, WorkflowStage, WorkflowState } from "./generated/workflow.ts";
import { ownCurrentView, ownOutcome, publishedSnapshot } from "./load-publication.ts";
import type { LoadWorkflowSnapshot } from "./workspace-view.ts";

/** A selected file remains readable for Retry; selection does not copy or write it. */
export interface SelectedBaseline {
  read(signal: AbortSignal): Promise<ReadDocumentTextOutcome>;
}

export interface LoadWorkflowDependencies {
  selectBaseline(signal: AbortSignal): Promise<SelectedBaseline | null>;
  layout(baseline: Baseline): Promise<ArchitectureLayout>;
}

type WorkflowBindings = {
  [Name in keyof WorkflowOperations]: () => Promise<ReturnType<WorkflowOperations[Name]>>;
};

interface LoadOperation {
  controller: AbortController;
  started: number;
  stage: WorkflowStage;
  committed: boolean;
  completion: Promise<WorkflowOutcome>;
  complete(outcome: WorkflowOutcome): void;
  outcome?: WorkflowOutcome;
}

class LoadStopped extends Error {
  readonly outcome: WorkflowOutcome;
  constructor(outcome: WorkflowOutcome) { super(outcome.status); this.outcome = outcome; }
}

function elapsed(started: number): number { return Math.max(0, performance.now() - started); }

function failed(stage: WorkflowStage, code: string, message: string, started: number): WorkflowFailure {
  return { status: "failure", stage, code, message: message.slice(0, 2048), durationMs: elapsed(started) };
}

/** A cancelled read or layout can settle later; its rejection handler stays attached. */
function cancellable<Value>(work: Promise<Value>, operation: LoadOperation): Promise<Value> {
  return new Promise((resolve, reject) => {
    const signal = operation.controller.signal;
    const cancel = () => reject(new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) }));
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    void work.then(
      (value) => { signal.removeEventListener("abort", cancel); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", cancel); reject(error); },
    );
  });
}

/** Owns one load slot and atomically publishes a baseline with its prepared layout. */
export class LoadWorkflow implements WorkflowBindings {
  private readonly listeners = new Set<() => void>();
  private snapshot = publishedSnapshot({ phase: "idle", stage: null, lastOutcome: null });
  private active?: LoadOperation;
  private previousSelection?: SelectedBaseline;
  private attempted = false;
  private disposed = false;

  private readonly dependencies: LoadWorkflowDependencies;
  constructor(dependencies: LoadWorkflowDependencies) { this.dependencies = dependencies; }

  readonly getSnapshot = (): LoadWorkflowSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly openBaseline = (): Promise<WorkflowOutcome> => this.start();
  readonly retry = (): Promise<WorkflowOutcome> => {
    if (!this.attempted) return Promise.resolve(ownOutcome(failed("selection", "no-previous-load", "There is no previous load to retry.", performance.now())));
    return this.start(this.previousSelection);
  };
  readonly cancel = (): Promise<WorkflowOutcome | null> => {
    const operation = this.active;
    if (!operation) return Promise.resolve(this.snapshot.state.lastOutcome);
    if (operation.committed) return Promise.resolve(operation.outcome ?? this.snapshot.state.lastOutcome);
    if (!operation.controller.signal.aborted) {
      operation.controller.abort();
      this.publish({ ...this.snapshot.state, phase: "cancelling" });
    }
    return operation.completion;
  };
  readonly dispose = async (): Promise<void> => {
    this.disposed = true;
    await this.cancel();
  };

  private start(selection?: SelectedBaseline): Promise<WorkflowOutcome> {
    if (this.disposed) return Promise.resolve(ownOutcome(failed("selection", "disposed", "This workspace has been closed.", performance.now())));
    if (this.active) return Promise.resolve(ownOutcome({ status: "busy", durationMs: 0 }));
    this.attempted = true;
    this.previousSelection = selection;
    let complete: (outcome: WorkflowOutcome) => void = () => {};
    const completion = new Promise<WorkflowOutcome>((resolve) => { complete = resolve; });
    const operation: LoadOperation = {
      controller: new AbortController(), started: performance.now(), stage: "selection", committed: false, completion, complete,
    };
    this.active = operation;
    this.publish({ phase: "loading", stage: "selection", lastOutcome: null });
    void this.run(operation, selection).then((outcome) => this.finish(operation, outcome));
    return completion;
  }

  private async run(operation: LoadOperation, selection?: SelectedBaseline): Promise<WorkflowOutcome> {
    try {
      this.check(operation);
      // A native picker cannot be closed by an AbortSignal. Keep the slot until it returns.
      const selected = selection ?? await this.dependencies.selectBaseline(operation.controller.signal);
      this.check(operation);
      if (!selected) throw new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) });
      this.previousSelection = selected;
      this.stage(operation, "reading");
      const read = await cancellable(selected.read(operation.controller.signal), operation);
      this.check(operation);
      if (read.status === "failure") throw new LoadStopped(failed("reading", read.code, read.message, operation.started));
      this.stage(operation, "validation");
      const decoded = decodeBaselineYaml(read.text);
      if (decoded.status === "failure") throw new LoadStopped(failed("validation", decoded.code, decoded.message, operation.started));
      this.stage(operation, "layout");
      const layout = await cancellable(this.dependencies.layout(decoded.baseline), operation);
      this.check(operation);
      const current = ownCurrentView(decoded.baseline, layout);
      this.check(operation);
      operation.committed = true;
      operation.outcome = ownOutcome({ status: "success", durationMs: elapsed(operation.started) });
      this.publish({ ...this.snapshot.state, lastOutcome: operation.outcome }, current);
      return operation.outcome;
    } catch (error) {
      return error instanceof LoadStopped ? error.outcome
        : operation.controller.signal.aborted ? { status: "cancelled", durationMs: elapsed(operation.started) }
          : error instanceof BaselineDisplayLimitError ? failed(operation.stage, "display-limit", displayLimitMessage, operation.started)
            : failed(operation.stage, "operation-failed", `The baseline ${operation.stage} operation could not complete.`, operation.started);
    }
  }

  private check(operation: LoadOperation): void {
    if (this.active !== operation || operation.controller.signal.aborted) {
      throw new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) });
    }
  }

  private stage(operation: LoadOperation, stage: WorkflowStage): void {
    this.check(operation);
    operation.stage = stage;
    this.publish({ ...this.snapshot.state, phase: "loading", stage });
    this.check(operation);
  }

  private finish(operation: LoadOperation, outcome: WorkflowOutcome): void {
    const owned = ownOutcome(outcome);
    if (this.active === operation) {
      this.active = undefined;
      this.publish({ phase: "idle", stage: null, lastOutcome: owned });
    }
    operation.complete(owned);
  }

  private publish(state: WorkflowState, current = this.snapshot.current): void {
    this.snapshot = publishedSnapshot(state, current);
    for (const listener of [...this.listeners]) {
      try { listener(); } catch {
        // A view observer cannot interrupt the load or take ownership of its result.
      }
    }
  }
}
