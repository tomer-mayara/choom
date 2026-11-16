import type { Baseline } from "@choom/baseline-model/contracts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { BaselineDisplayLimitError, displayLimitMessage } from "../lib/baseline-display-limits.ts";
import { decodeBaselineYaml } from "../lib/baseline-yaml.ts";
import { decodeDiscoveryResultYaml } from "../lib/discovery-result-yaml.ts";
import { decodeDuplicationReportYaml } from "../lib/interface-duplication-yaml.ts";
import type { ReadDocumentTextOutcome } from "../platform/generated/contracts.ts";
import type { WorkflowFailure, WorkflowOperations, WorkflowOutcome, WorkflowStage, WorkflowState } from "./generated/workflow.ts";
import { ownCurrentView, ownDiscovery, ownDuplication, ownOutcome, publishedSnapshot, type PublishedViews } from "./load-publication.ts";
import type { LoadWorkflowSnapshot } from "./workspace-view.ts";

/** A selected file remains readable for Retry; selection does not copy or write it. */
export interface SelectedBaseline {
  read(signal: AbortSignal): Promise<ReadDocumentTextOutcome>;
}

export interface LoadWorkflowDependencies {
  selectBaseline(signal: AbortSignal): Promise<SelectedBaseline | null>;
  selectDuplicationReport?(signal: AbortSignal): Promise<SelectedBaseline | null>;
  selectDiscoveryResult?(signal: AbortSignal): Promise<SelectedBaseline | null>;
  layout(baseline: Baseline): Promise<ArchitectureLayout>;
}

/** A report that a load attaches to the open baseline. Each kind has its own attachment. */
type AttachmentKind = Exclude<WorkflowState["operation"], "baseline">;
const attachmentNames: Readonly<Record<AttachmentKind, string>> = { report: "duplication report", discovery: "discovery result" };

type WorkflowBindings = {
  [Name in keyof WorkflowOperations]: () => Promise<ReturnType<WorkflowOperations[Name]>>;
};

type Current = NonNullable<LoadWorkflowSnapshot["current"]>;

interface LoadOperation {
  kind: WorkflowState["operation"];
  baseline: LoadWorkflowSnapshot["current"];
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
  private snapshot = publishedSnapshot({ operation: "baseline", phase: "idle", stage: null, lastOutcome: null });
  private active?: LoadOperation;
  private previousSelection?: SelectedBaseline;
  private previousKind: WorkflowState["operation"] = "baseline";
  private reportSession = 0;
  private attempted = false;
  private disposed = false;

  private readonly dependencies: LoadWorkflowDependencies;
  constructor(dependencies: LoadWorkflowDependencies) { this.dependencies = dependencies; }

  readonly getSnapshot = (): LoadWorkflowSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly openBaseline = (): Promise<WorkflowOutcome> => this.start("baseline");
  readonly openDuplicationReport = (): Promise<WorkflowOutcome> => this.start("report");
  readonly removeDuplicationReport = async (): Promise<WorkflowOutcome> => this.remove("report", { duplication: null });
  readonly openDiscoveryResult = (): Promise<WorkflowOutcome> => this.start("discovery");
  readonly removeDiscoveryResult = async (): Promise<WorkflowOutcome> => this.remove("discovery", { discovery: null });
  readonly retry = (): Promise<WorkflowOutcome> => {
    if (!this.attempted) return Promise.resolve(ownOutcome(failed("selection", "no-previous-load", "There is no previous load to retry.", performance.now())));
    return this.start(this.previousKind, this.previousSelection);
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

  /** Removes one attachment only. A pending load of that kind cannot attach later, and Retry forgets its file. */
  private remove(kind: AttachmentKind, removed: Partial<PublishedViews>): WorkflowOutcome {
    if (this.active?.kind === kind && !this.active.committed) void this.cancel();
    if (this.previousKind === kind) { this.previousSelection = undefined; this.attempted = false; }
    this.publish({ ...this.snapshot.state, lastOutcome: null }, removed);
    return ownOutcome({ status: "success", durationMs: 0 });
  }

  private start(kind: WorkflowState["operation"], selection?: SelectedBaseline): Promise<WorkflowOutcome> {
    if (this.disposed) return Promise.resolve(ownOutcome(failed("selection", "disposed", "This workspace has been closed.", performance.now())));
    if (this.active) return Promise.resolve(ownOutcome({ status: "busy", durationMs: 0 }));
    this.attempted = true;
    this.previousSelection = selection;
    this.previousKind = kind;
    let complete: (outcome: WorkflowOutcome) => void = () => {};
    const completion = new Promise<WorkflowOutcome>((resolve) => { complete = resolve; });
    const operation: LoadOperation = {
      kind, baseline: this.snapshot.current,
      controller: new AbortController(), started: performance.now(), stage: "selection", committed: false, completion, complete,
    };
    this.active = operation;
    this.publish({ operation: kind, phase: "loading", stage: "selection", lastOutcome: null });
    void this.run(operation, selection).then((outcome) => this.finish(operation, outcome));
    return completion;
  }

  private async run(operation: LoadOperation, selection?: SelectedBaseline): Promise<WorkflowOutcome> {
    try {
      this.check(operation);
      // The built-in example has no file digest, so it cannot have an attachment.
      if (operation.kind !== "baseline" && !operation.baseline) {
        throw new LoadStopped(failed("selection", "no-baseline",
          `Open a saved baseline before opening a ${attachmentNames[operation.kind]}.`, operation.started));
      }
      // A native picker cannot be closed by an AbortSignal. Keep the slot until it returns.
      const select = { baseline: this.dependencies.selectBaseline, report: this.dependencies.selectDuplicationReport,
        discovery: this.dependencies.selectDiscoveryResult }[operation.kind];
      if (!select) throw new LoadStopped(failed("selection", "unavailable",
        operation.kind === "discovery" ? "Discovery result file selection is unavailable." : "Report file selection is unavailable.", operation.started));
      const selected = selection ?? await select(operation.controller.signal);
      this.check(operation);
      if (!selected) throw new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) });
      this.previousSelection = selected;
      this.stage(operation, "reading");
      const read = await cancellable(selected.read(operation.controller.signal), operation);
      this.check(operation);
      if (read.status === "failure") throw new LoadStopped(failed("reading", read.code, read.message, operation.started));
      this.stage(operation, "validation");
      return operation.kind === "baseline"
        ? await this.loadBaseline(operation, read.text, read.sha256)
        : this.loadAttachment(operation, read.text);
    } catch (error) {
      return error instanceof LoadStopped ? error.outcome
        : operation.controller.signal.aborted ? { status: "cancelled", durationMs: elapsed(operation.started) }
          : error instanceof BaselineDisplayLimitError ? failed(operation.stage, "display-limit", displayLimitMessage, operation.started)
            : failed(operation.stage, "operation-failed", `The ${operation.kind} ${operation.stage} operation could not complete.`, operation.started);
    }
  }

  private async loadBaseline(operation: LoadOperation, text: string, sha256: string): Promise<WorkflowOutcome> {
    const decoded = decodeBaselineYaml(text);
    if (decoded.status === "failure") throw new LoadStopped(failed("validation", decoded.code, decoded.message, operation.started));
    this.stage(operation, "layout");
    const layout = await cancellable(this.dependencies.layout(decoded.baseline), operation);
    this.check(operation);
    const current = ownCurrentView(decoded.baseline, layout, sha256);
    this.check(operation);
    const outcome = this.commit(operation);
    // A new baseline view starts without attachments, also when the IDs repeat.
    this.publish({ ...this.snapshot.state, lastOutcome: outcome }, { current, duplication: null, discovery: null });
    return outcome;
  }

  /** Checks the file completely against the baseline that the load started with, then attaches it in one step. */
  private loadAttachment(operation: LoadOperation, text: string): WorkflowOutcome {
    const current = operation.baseline;
    if (!current || current !== this.snapshot.current) throw new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) });
    const attachment = operation.kind === "report" ? this.reportAttachment(operation, text, current)
      : this.discoveryAttachment(operation, text, current);
    this.check(operation);
    const outcome = this.commit(operation);
    this.publish({ ...this.snapshot.state, lastOutcome: outcome }, attachment);
    return outcome;
  }

  private reportAttachment(operation: LoadOperation, text: string, { baseline, sha256 }: Current): Partial<PublishedViews> {
    const decoded = decodeDuplicationReportYaml(text, baseline, sha256);
    if (decoded.status === "failure") throw new LoadStopped(failed("validation", decoded.code, decoded.message, operation.started));
    return { duplication: ownDuplication(decoded.report, ++this.reportSession) };
  }

  private discoveryAttachment(operation: LoadOperation, text: string, { baseline, sha256 }: Current): Partial<PublishedViews> {
    const decoded = decodeDiscoveryResultYaml(text, baseline, sha256);
    if (decoded.status === "failure") throw new LoadStopped(failed("validation", decoded.code, decoded.message, operation.started));
    return { discovery: ownDiscovery(decoded.result) };
  }

  private commit(operation: LoadOperation): WorkflowOutcome {
    operation.committed = true;
    operation.outcome = ownOutcome({ status: "success", durationMs: elapsed(operation.started) });
    return operation.outcome;
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
      this.publish({ operation: operation.kind, phase: "idle", stage: null, lastOutcome: owned });
    }
    operation.complete(owned);
  }

  /** Publishes a state; each view that `changed` does not name stays as it is. */
  private publish(state: WorkflowState, changed: Partial<PublishedViews> = {}): void {
    const { current, duplication, discovery } = this.snapshot;
    this.snapshot = publishedSnapshot(state, { current, duplication, discovery, ...changed });
    for (const listener of [...this.listeners]) {
      try { listener(); } catch {
        // A view observer cannot interrupt the load or take ownership of its result.
      }
    }
  }
}
