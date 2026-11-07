import type { ArchitecturalLayer } from "../domain/architectural-layer.ts";
import type { AnalysisOutcome, ArchitectureDocument } from "../domain/generated/contracts.ts";
import type { DocumentFiles } from "../documents/document-files.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import { decodeArchitectureYaml } from "../lib/architecture-yaml.ts";
import type { DocumentCodecFailure } from "../lib/generated/contracts.ts";
import type { DocumentNativeFailure, RepositoryOperations } from "../platform/generated/contracts.ts";
import type { DiscoveryOperations } from "./generated/contracts.ts";
import type {
  WorkflowFailure, WorkflowOperation, WorkflowOperations, WorkflowOutcome, WorkflowStage, WorkflowState,
} from "./generated/workflow.ts";

export type SelectedDocument =
  | { kind: "desktop"; path: string }
  | { kind: "browser"; readText(signal: AbortSignal): Promise<string> };

export interface LoadWorkflowDependencies {
  selectRepository(signal: AbortSignal): Promise<string | null>;
  selectDocument(signal: AbortSignal): Promise<SelectedDocument | null>;
  discover(request: Parameters<DiscoveryOperations["discover"]>[0]): Promise<ReturnType<DiscoveryOperations["discover"]>>;
  createLayer(): ArchitecturalLayer;
  closeRepository(request: Parameters<RepositoryOperations["closeRepository"]>[0]): Promise<ReturnType<RepositoryOperations["closeRepository"]>>;
  documents: Pick<DocumentFiles, "prepareCandidate" | "openSavedFile" | "releaseSnapshot" | "retryCleanup">;
  layout(document: ArchitectureDocument): Promise<ArchitectureLayout>;
}

export interface LoadWorkflowSnapshot {
  state: WorkflowState;
  current: { document: ArchitectureDocument; layout: ArchitectureLayout } | null;
}

type WorkflowBindings = {
  [Name in Exclude<keyof WorkflowOperations, "documentCleanupFailed">]: () => Promise<ReturnType<WorkflowOperations[Name]>>;
} & Pick<WorkflowOperations, "documentCleanupFailed">;
type LoadSelection = { operation: "repository"; rootPath: string } | { operation: "document"; selected: SelectedDocument };

interface LoadOperation {
  operation: WorkflowOperation | null;
  controller: AbortController;
  started: number;
  stage: WorkflowStage;
  committed: boolean;
  completion: Promise<WorkflowOutcome>;
  complete(outcome: WorkflowOutcome): void;
  repositorySession?: string;
  repositoryCloseAttempted?: boolean;
  candidateSnapshot?: string;
  outcome?: WorkflowOutcome;
  cleanupFailure?: WorkflowFailure;
}

class LoadStopped extends Error {
  readonly outcome: WorkflowOutcome;

  constructor(outcome: WorkflowOutcome) {
    super(outcome.status);
    this.outcome = outcome;
  }
}

function elapsed(started: number): number {
  return Math.max(0, performance.now() - started);
}

function failed(stage: WorkflowStage, code: string, message: string, started: number): WorkflowFailure {
  return { status: "failure", stage, code, message: message.slice(0, 2048), durationMs: elapsed(started) };
}

function cleanupFailure(started: number, restart = false): WorkflowFailure {
  return failed("cleanup", "cleanup-failed", restart
    ? "Cleanup could not be confirmed. Restart Choom before loading another diagram."
    : "Cleanup could not complete. Retry cleanup before loading another diagram.", started);
}

/** Pure work can finish late after cancellation; all handlers remain attached. */
function cancellable<Value>(work: Promise<Value>, operation: LoadOperation): Promise<Value> {
  return new Promise((resolve, reject) => {
    const signal = operation.controller.signal;
    const cancel = () => reject(new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) }));
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** Owns the single load slot, current snapshot, and retryable cleanup resources. */
export class LoadWorkflow implements WorkflowBindings {
  private readonly dependencies: LoadWorkflowDependencies;
  private readonly listeners = new Set<() => void>();
  private readonly repositories = new Map<string, "safe" | "unsafe">();
  private snapshot: LoadWorkflowSnapshot = {
    state: { phase: "idle", operation: null, stage: null, lastOutcome: null, cleanupRecovery: "none" },
    current: null,
  };
  private active?: LoadOperation;
  private currentSnapshot?: string;
  private previousSelection?: LoadSelection;
  private previousOperation?: WorkflowOperation;
  private documentCleanupPending = false;
  private documentCleanupRevision = 0;
  private disposed = false;
  private disposal?: Promise<void>;

  constructor(dependencies: LoadWorkflowDependencies) {
    this.dependencies = dependencies;
  }

  readonly getSnapshot = (): LoadWorkflowSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly loadRepository = (): Promise<WorkflowOutcome> => this.start("repository");
  readonly openDocument = (): Promise<WorkflowOutcome> => this.start("document");

  readonly documentCleanupFailed = (): void => {
    this.documentCleanupPending = true;
    this.documentCleanupRevision += 1;
    this.blockCleanup();
  };

  readonly retry = (): Promise<WorkflowOutcome> => {
    if (this.busy()) return Promise.resolve({ status: "busy", durationMs: 0 });
    if (!this.previousOperation) return Promise.resolve(failed("selection", "no-previous-load", "There is no previous load to retry.", performance.now()));
    return this.start(this.previousOperation, this.previousSelection);
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

  readonly retryCleanup = (): Promise<WorkflowOutcome> => {
    if (this.active) return Promise.resolve({ status: "busy", durationMs: 0 });
    if (this.snapshot.state.cleanupRecovery === "restart") {
      return Promise.resolve(this.snapshot.state.cleanupFailure ?? cleanupFailure(performance.now(), true));
    }
    if (this.snapshot.state.cleanupRecovery === "none") return Promise.resolve({ status: "success", durationMs: 0 });
    const operation = this.reserve(null);
    operation.committed = true;
    this.publish({ ...this.snapshot.state, phase: "cleanup", operation: null, stage: "cleanup" });
    void this.cleanPending(operation).then((outcome) => this.finish(operation, outcome, false));
    return operation.completion;
  };

  readonly dispose = (): Promise<void> => {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.releaseWorkspace();
    return this.disposal;
  };

  private start(kind: WorkflowOperation, selection?: LoadSelection): Promise<WorkflowOutcome> {
    if (this.disposed) return Promise.resolve(failed("selection", "disposed", "This workspace has been closed.", performance.now()));
    if (this.busy()) return Promise.resolve({ status: "busy", durationMs: 0 });
    this.previousOperation = kind;
    this.previousSelection = selection;
    const operation = this.reserve(kind);
    this.publish({ phase: "loading", operation: kind, stage: "selection", lastOutcome: null, cleanupRecovery: "none" });
    void this.run(operation, selection).then((outcome) => this.finish(operation, outcome));
    return operation.completion;
  }

  private reserve(kind: WorkflowOperation | null): LoadOperation {
    let complete: (outcome: WorkflowOutcome) => void = () => {};
    const completion = new Promise<WorkflowOutcome>((resolve) => { complete = resolve; });
    const operation: LoadOperation = {
      operation: kind, controller: new AbortController(), started: performance.now(), stage: "selection",
      committed: false, completion, complete,
    };
    this.active = operation;
    return operation;
  }

  private busy(): boolean {
    return this.active !== undefined || this.snapshot.state.cleanupRecovery !== "none";
  }

  private async run(operation: LoadOperation, selection?: LoadSelection): Promise<WorkflowOutcome> {
    let outcome: WorkflowOutcome;
    try {
      this.check(operation);
      const selected = selection ?? await this.select(operation);
      this.check(operation);
      if (!selected) throw new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) });
      this.previousSelection = selected;
      const document = selected.operation === "repository"
        ? await this.repositoryDocument(operation, selected.rootPath)
        : await this.savedDocument(operation, selected.selected);
      this.stage(operation, "layout");
      const layout = await cancellable(this.dependencies.layout(document), operation);
      this.check(operation);
      const superseded = this.currentSnapshot;
      this.currentSnapshot = operation.candidateSnapshot;
      operation.candidateSnapshot = undefined;
      operation.committed = true;
      outcome = { status: "success", durationMs: elapsed(operation.started) };
      operation.outcome = outcome;
      this.publish({ ...this.snapshot.state, phase: "cleanup", stage: "cleanup", lastOutcome: outcome }, { document, layout });
      if (superseded) await this.releaseSnapshot(superseded, operation);
    } catch (error) {
      outcome = error instanceof LoadStopped ? error.outcome
        : operation.controller.signal.aborted ? { status: "cancelled", durationMs: elapsed(operation.started) }
          : failed(operation.stage, "operation-failed", `The ${operation.stage} operation could not complete.`, operation.started);
    }
    if (!operation.committed) {
      if (operation.candidateSnapshot) await this.releaseSnapshot(operation.candidateSnapshot, operation);
      if (operation.repositorySession && !operation.repositoryCloseAttempted && this.repositories.get(operation.repositorySession) === "safe") {
        await this.closeRepository(operation.repositorySession, operation);
      }
      outcome = operation.cleanupFailure ?? outcome;
    }
    return outcome;
  }

  private async select(operation: LoadOperation): Promise<LoadSelection | null> {
    if (operation.operation === "repository") {
      const rootPath = await this.dependencies.selectRepository(operation.controller.signal);
      return rootPath === null ? null : { operation: "repository", rootPath };
    }
    const selected = await this.dependencies.selectDocument(operation.controller.signal);
    return selected === null ? null : { operation: "document", selected };
  }

  private async repositoryDocument(operation: LoadOperation, rootPath: string): Promise<ArchitectureDocument> {
    this.stage(operation, "discovery");
    const discovered = await this.dependencies.discover({ rootPath });
    if (discovered.status === "failure") {
      if (discovered.code === "cleanup-failed") {
        throw new LoadStopped(this.blockCleanup(operation, true));
      }
      this.check(operation);
      throw new LoadStopped(failed(discovered.stage, discovered.code, discovered.message, operation.started));
    }
    const { repositorySession, components, analysis } = discovered.repository;
    operation.repositorySession = repositorySession;
    this.repositories.set(repositorySession, "safe");
    this.stage(operation, "setup");
    const layer = this.dependencies.createLayer();
    this.stage(operation, "analysis");
    let analyzing = true;
    let analyzed: AnalysisOutcome;
    try {
      analyzed = await layer.analyze({ repositorySession, components, analysis }, {
        signal: operation.controller.signal,
        onProgress: (progress) => {
          if (analyzing && this.active === operation && !operation.controller.signal.aborted && !operation.committed) {
            operation.stage = progress.stage;
            this.publish({ ...this.snapshot.state, stage: progress.stage });
          }
        },
      });
    } catch {
      this.repositories.set(repositorySession, "unsafe");
      throw new LoadStopped(this.blockCleanup(operation, true));
    } finally {
      analyzing = false;
    }
    if (analyzed.status === "failure" && analyzed.stage === "cleanup") {
      this.repositories.set(repositorySession, "unsafe");
      throw new LoadStopped(this.blockCleanup(operation, true));
    }
    this.check(operation);
    if (analyzed.status === "cancelled") throw new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) });
    if (analyzed.status === "failure") throw new LoadStopped(failed(analyzed.stage, analyzed.code, analyzed.message, operation.started));
    const closeFailure = await this.closeRepository(repositorySession, operation);
    if (closeFailure) throw new LoadStopped(closeFailure);
    this.stage(operation, "storage");
    const candidate = await this.dependencies.documents.prepareCandidate(analyzed.document, operation.controller.signal);
    if (candidate.status === "success") operation.candidateSnapshot = candidate.snapshotId;
    if (candidate.status === "failure" && candidate.stage === "cleanup") {
      this.documentCleanupPending = true;
      throw new LoadStopped(this.blockCleanup(operation));
    }
    this.check(operation);
    if (candidate.status === "cancelled") throw new LoadStopped({ status: "cancelled", durationMs: elapsed(operation.started) });
    if (candidate.status === "failure") throw new LoadStopped(this.documentFailure(candidate, operation, "storage"));
    return candidate.document;
  }

  private async savedDocument(operation: LoadOperation, selected: SelectedDocument): Promise<ArchitectureDocument> {
    this.stage(operation, "reading");
    const decoded = selected.kind === "desktop"
      ? await this.dependencies.documents.openSavedFile(selected.path)
      : decodeArchitectureYaml(await cancellable(selected.readText(operation.controller.signal), operation));
    this.check(operation);
    if (decoded.status === "failure") throw new LoadStopped(this.documentFailure(decoded, operation, "reading"));
    this.stage(operation, "validation");
    return decoded.document;
  }

  private documentFailure(failure: DocumentCodecFailure | DocumentNativeFailure, operation: LoadOperation, stage: "storage" | "reading"): WorkflowFailure {
    return failed(failure.stage === "decoding" ? "validation" : stage, failure.code, failure.message, operation.started);
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

  private blockCleanup(operation?: LoadOperation, restart = false): WorkflowFailure {
    const blocked = this.snapshot.state.cleanupRecovery === "restart";
    const started = operation?.started ?? performance.now();
    const failure = blocked ? this.snapshot.state.cleanupFailure ?? cleanupFailure(started, true) : cleanupFailure(started, restart);
    if (operation) operation.cleanupFailure = failure;
    this.publish({ ...this.snapshot.state,
      ...(this.active ? {} : { phase: "cleanup", stage: "cleanup" }),
      cleanupRecovery: blocked || restart ? "restart" : "retry", cleanupFailure: failure });
    return failure;
  }

  private async releaseSnapshot(snapshotId: string, operation: LoadOperation): Promise<void> {
    this.cleanupStage(operation);
    try {
      const released = await this.dependencies.documents.releaseSnapshot(snapshotId);
      if (released.status === "success") return;
    } catch {
      // The document service retains failed releases, including transport failures.
    }
    this.documentCleanupPending = true;
    this.blockCleanup(operation);
  }

  private async closeRepository(repositorySession: string, operation: LoadOperation): Promise<WorkflowFailure | undefined> {
    operation.repositoryCloseAttempted = true;
    this.cleanupStage(operation);
    try {
      const closed = await this.dependencies.closeRepository({ repositorySession });
      if (closed.status === "success" || closed.code === "invalid-session") {
        this.repositories.delete(repositorySession);
        return;
      }
    } catch {
      // An uncertain close retains the known owner for an explicit retry.
    }
    return this.blockCleanup(operation);
  }

  private cleanupStage(operation: LoadOperation): void {
    if (this.active !== operation) return;
    const phase = operation.controller.signal.aborted ? "cancelling" : operation.committed ? "cleanup" : "loading";
    this.publish({ ...this.snapshot.state, phase, stage: "cleanup" });
  }

  private async cleanPending(operation: LoadOperation): Promise<WorkflowOutcome> {
    for (const [session, safety] of this.repositories) {
      if (safety === "unsafe") return this.blockCleanup(operation, true);
      const failure = await this.closeRepository(session, operation);
      if (failure) return failure;
    }
    if (this.documentCleanupPending) {
      const revision = this.documentCleanupRevision;
      try {
        const cleaned = await this.dependencies.documents.retryCleanup();
        if (cleaned.status === "failure" || revision !== this.documentCleanupRevision) return this.blockCleanup(operation);
      } catch {
        return this.blockCleanup(operation);
      }
      this.documentCleanupPending = false;
    }
    const { cleanupFailure: _, ...state } = this.snapshot.state;
    this.publish({ ...state, cleanupRecovery: "none" });
    return { status: "success", durationMs: elapsed(operation.started) };
  }

  private finish(operation: LoadOperation, outcome: WorkflowOutcome, replaceOutcome = true): void {
    if (this.active === operation) {
      this.active = undefined;
      const blocked = this.snapshot.state.cleanupRecovery !== "none";
      this.publish({ ...this.snapshot.state, phase: blocked ? "cleanup" : "idle", operation: null,
        stage: blocked ? "cleanup" : null, lastOutcome: replaceOutcome ? outcome : this.snapshot.state.lastOutcome });
    }
    operation.complete(outcome);
  }

  private async releaseWorkspace(): Promise<void> {
    const pending = this.active;
    if (pending) {
      await this.cancel();
      await pending.completion;
    }
    const operation = this.reserve(null);
    operation.committed = true;
    if (this.currentSnapshot) {
      const snapshot = this.currentSnapshot;
      this.currentSnapshot = undefined;
      await this.releaseSnapshot(snapshot, operation);
    }
    for (const [session, safety] of this.repositories) {
      if (safety === "safe") await this.closeRepository(session, operation);
    }
    this.finish(operation, { status: "success", durationMs: elapsed(operation.started) }, false);
  }

  private publish(state: WorkflowState, current = this.snapshot.current): void {
    this.snapshot = { state, current };
    for (const listener of this.listeners) {
      try { listener(); } catch {
        // A view observer cannot take ownership away from resource cleanup.
      }
    }
  }
}
