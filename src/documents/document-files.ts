import type { ArchitectureDocument } from "../domain/generated/contracts.ts";
import { decodeArchitectureYaml, encodeArchitectureYaml } from "../lib/architecture-yaml.ts";
import type { DecodeArchitectureOutcome, DocumentCodecFailure } from "../lib/generated/contracts.ts";
import type { DocumentAccess } from "../platform/documents.ts";
import type {
  DocumentNativeFailure, ExportDocumentOutcome, ReleaseDocumentSnapshotOutcome, RetryDocumentCleanupOutcome,
} from "../platform/generated/contracts.ts";

type DocumentFailure = DocumentCodecFailure | DocumentNativeFailure;
interface CancelledDocumentOperation {
  status: "cancelled";
  stage: "storage" | "export";
  durationMs: number;
}
interface PreparedDocumentCandidate {
  status: "success";
  snapshotId: string;
  document: ArchitectureDocument;
  durationMs: number;
}
type PreparationOutcome = PreparedDocumentCandidate | DocumentFailure | CancelledDocumentOperation;
type ExportOutcome = ExportDocumentOutcome | DocumentCodecFailure | CancelledDocumentOperation;
type DestinationSelector = () => Promise<{ path: string; overwrite: boolean } | null>;

function timed<Outcome extends { durationMs: number }>(outcome: Outcome, started: number): Outcome {
  return { ...outcome, durationMs: Math.max(0, performance.now() - started) };
}

function cancelled(stage: CancelledDocumentOperation["stage"], started: number): CancelledDocumentOperation {
  return timed({ status: "cancelled", stage, durationMs: 0 }, started);
}

function operationFailure(stage: DocumentNativeFailure["stage"], started: number): DocumentNativeFailure {
  return timed({
    status: "failure", stage,
    code: stage === "cleanup" ? "cleanup-failed" : "unavailable",
    message: stage === "cleanup"
      ? "Document cleanup could not complete. Retry cleanup before writing again."
      : "The document file service is unavailable in this environment.",
    durationMs: 0,
  }, started);
}

/** Retain one instance for preparation, release, and cleanup in a workspace.
 * It retains failed releases until native storage confirms removal or rejects the ID. */
export class DocumentFiles {
  private readonly access: DocumentAccess;
  private readonly pendingReleases = new Set<string>();

  constructor(access: DocumentAccess) {
    this.access = access;
  }

  async prepareCandidate(document: unknown, signal?: AbortSignal): Promise<PreparationOutcome> {
    const started = performance.now();
    const blocked = this.failureWhileReleasing(started);
    if (blocked) return blocked;
    if (signal?.aborted) return cancelled("storage", started);
    const encoded = encodeArchitectureYaml(document);
    if (encoded.status === "failure") return timed(encoded, started);
    let snapshotId: string | undefined;
    try {
      const created = await this.access.createDocumentSnapshot({ text: encoded.text });
      if (created.status === "failure") return timed(created, started);
      snapshotId = created.snapshotId;
      if (signal?.aborted) return this.discard(snapshotId, cancelled("storage", started), started);
      const stored = await this.access.readDocumentSnapshot({ snapshotId });
      if (stored.status === "failure") return this.discard(snapshotId, stored, started);
      if (signal?.aborted) return this.discard(snapshotId, cancelled("storage", started), started);
      const decoded = decodeArchitectureYaml(stored.text);
      if (decoded.status === "failure") return this.discard(snapshotId, decoded, started);
      return timed<PreparedDocumentCandidate>({ status: "success", snapshotId, document: decoded.document, durationMs: 0 }, started);
    } catch {
      const failure = operationFailure("storage", started);
      return snapshotId === undefined ? failure : this.discard(snapshotId, failure, started);
    }
  }

  async openSavedFile(path: string): Promise<DecodeArchitectureOutcome | DocumentNativeFailure> {
    const started = performance.now();
    try {
      const stored = await this.access.readDocumentFile({ path });
      return timed(stored.status === "failure" ? stored : decodeArchitectureYaml(stored.text), started);
    } catch {
      return operationFailure("storage", started);
    }
  }

  async exportDocument(document: unknown, selectDestination: DestinationSelector): Promise<ExportOutcome> {
    const started = performance.now();
    const blocked = this.failureWhileReleasing(started);
    if (blocked) return blocked;
    const encoded = encodeArchitectureYaml(document);
    if (encoded.status === "failure") return timed(encoded, started);
    try {
      const destination = await selectDestination();
      const cleanupFailure = this.failureWhileReleasing(started);
      if (cleanupFailure) return cleanupFailure;
      if (destination === null) return cancelled("export", started);
      return timed(await this.access.exportDocument({ ...destination, text: encoded.text }), started);
    } catch {
      return operationFailure("export", started);
    }
  }

  async releaseSnapshot(snapshotId: string): Promise<ReleaseDocumentSnapshotOutcome> {
    const started = performance.now();
    this.pendingReleases.add(snapshotId);
    try {
      const released = await this.access.releaseDocumentSnapshot({ snapshotId });
      if (released.status === "success" || released.code === "invalid-request" || released.code === "invalid-snapshot") {
        this.pendingReleases.delete(snapshotId);
      }
      return timed(released, started);
    } catch {
      return operationFailure("cleanup", started);
    }
  }

  async retryCleanup(): Promise<RetryDocumentCleanupOutcome> {
    const started = performance.now();
    try {
      for (const snapshotId of this.pendingReleases) {
        const released = await this.releaseSnapshot(snapshotId);
        if (released.status === "failure") return timed(released, started);
      }
      const cleaned = await this.access.retryDocumentCleanup({});
      const pending = this.failureWhileReleasing(started);
      return timed(cleaned.status === "success" && pending ? pending : cleaned, started);
    } catch {
      return operationFailure("cleanup", started);
    }
  }

  private failureWhileReleasing(started: number): DocumentNativeFailure | undefined {
    return this.pendingReleases.size > 0 ? operationFailure("cleanup", started) : undefined;
  }

  private async discard(
    snapshotId: string, outcome: DocumentFailure | CancelledDocumentOperation, started: number,
  ): Promise<DocumentFailure | CancelledDocumentOperation> {
    const released = await this.releaseSnapshot(snapshotId);
    return timed(released.status === "failure" ? released : outcome, started);
  }
}
