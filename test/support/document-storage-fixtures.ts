import type { DocumentAccess } from "../../src/platform/documents.ts";
import type {
  CreateDocumentSnapshotRequest, DocumentNativeFailure, DocumentSnapshotRequest, ExportDocumentRequest,
  ReadDocumentFileRequest,
} from "../../src/platform/generated/contracts.ts";

export function pendingDocumentOperation<T>() {
  let resolve: (value: T) => void = () => { throw new Error("The operation has not started."); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

export function documentStorageFailure(code: DocumentNativeFailure["code"], stage: DocumentNativeFailure["stage"] = "storage"): DocumentNativeFailure {
  return { status: "failure", stage, code, message: "The document operation could not complete.", durationMs: 0 };
}

/** Exercises workspace ownership through the native interface, without filesystem claims. */
export class MemoryDocumentAccess implements DocumentAccess {
  readonly snapshots = new Map<string, string>();
  readonly files = new Map<string, string>();
  readonly exports: ExportDocumentRequest[] = [];
  readonly pendingCleanup = new Set<string>();
  readonly created = pendingDocumentOperation<void>();
  readonly readStarted = pendingDocumentOperation<void>();
  readonly releaseStarted = pendingDocumentOperation<void>();
  createGate?: Promise<void>;
  readGate?: Promise<void>;
  releaseGate?: Promise<void>;
  createFailure?: DocumentNativeFailure;
  readFailure?: DocumentNativeFailure;
  releaseFailure?: DocumentNativeFailure;
  exportFailure?: DocumentNativeFailure;
  readText?: string;
  private nextSnapshot = 1;

  async createDocumentSnapshot({ text }: CreateDocumentSnapshotRequest) {
    if (this.createFailure) return this.createFailure;
    const snapshotId = `document-00000000-0000-4000-8000-000000000000-${this.nextSnapshot++}`;
    this.snapshots.set(snapshotId, text);
    this.created.resolve();
    await this.createGate;
    return { status: "success" as const, snapshotId, durationMs: 0 };
  }

  async readDocumentSnapshot({ snapshotId }: DocumentSnapshotRequest) {
    this.readStarted.resolve();
    await this.readGate;
    if (this.readFailure) return this.readFailure;
    const text = this.readText ?? this.snapshots.get(snapshotId);
    return text === undefined ? documentStorageFailure("invalid-snapshot") : { status: "success" as const, text, durationMs: 0 };
  }

  async releaseDocumentSnapshot({ snapshotId }: DocumentSnapshotRequest) {
    this.releaseStarted.resolve();
    await this.releaseGate;
    if (this.releaseFailure) {
      this.pendingCleanup.add(snapshotId);
      return this.releaseFailure;
    }
    this.snapshots.delete(snapshotId);
    return { status: "success" as const, released: true as const, durationMs: 0 };
  }

  async readDocumentFile({ path }: ReadDocumentFileRequest) {
    const text = this.files.get(path);
    return text === undefined ? documentStorageFailure("not-found") : { status: "success" as const, text, durationMs: 0 };
  }

  async exportDocument(request: ExportDocumentRequest) {
    this.exports.push({ ...request });
    if (this.exportFailure) return this.exportFailure;
    if (!request.overwrite && this.files.has(request.path)) return documentStorageFailure("destination-exists", "export");
    this.files.set(request.path, request.text);
    return { status: "success" as const, exported: true as const, durationMs: 0 };
  }

  async retryDocumentCleanup() {
    if (this.releaseFailure) return this.releaseFailure;
    for (const snapshotId of this.pendingCleanup) this.snapshots.delete(snapshotId);
    this.pendingCleanup.clear();
    return { status: "success" as const, cleaned: true as const, durationMs: 0 };
  }
}
