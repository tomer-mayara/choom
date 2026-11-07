import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { documentContracts } from "../../../src/platform/documents-contract.ts";
import type { DocumentNativeFailure } from "../../../src/platform/generated/contracts.ts";
import type { ImportFixture } from "./fixtures.ts";
import type { BrowserImportControls } from "./browser-controls.ts";

function failure(code: DocumentNativeFailure["code"], stage: DocumentNativeFailure["stage"] = "storage"): DocumentNativeFailure {
  return { status: "failure", stage, code, message: `The document operation failed: ${code}.`, durationMs: 1 };
}

export class BrowserDocumentTransport {
  private readonly fixture: ImportFixture;
  private readonly controls: BrowserImportControls;
  private readonly snapshots = new Map<string, string>();
  private readonly identity = randomUUID();
  private nextSnapshot = 0;
  private cleanupBlocked = false;

  constructor(fixture: ImportFixture, controls: BrowserImportControls) { this.fixture = fixture; this.controls = controls; }

  async invoke(command: string, request: unknown): Promise<unknown> {
    switch (command) {
      case "document_snapshot_create": return this.create(request);
      case "document_snapshot_read": return this.readSnapshot(request);
      case "document_snapshot_release": return this.release(request);
      case "document_file_read": return this.readFile(request);
      case "document_export": return this.export(request);
      case "document_cleanup": return this.cleanup(request);
      default: throw new Error(`Unexpected document command: ${command}`);
    }
  }

  private async create(request: unknown): Promise<unknown> {
    const contract = documentContracts.createDocumentSnapshot;
    const { text } = contract.request.parse(request);
    if (this.cleanupBlocked) return contract.outcome.parse(failure("cleanup-failed", "cleanup"));
    if (this.fixture.facts.storageFailure === "save its repository analysis") {
      this.controls.observe("save its repository analysis-failure-delivered", "document_snapshot_create received the encoded analysis and returned a storage failure");
      return contract.outcome.parse(failure("io-error"));
    }
    assert.ok(this.snapshots.size < 2, "Only a current snapshot and candidate snapshot may be retained");
    const snapshotId = `document-${this.identity}-${++this.nextSnapshot}`;
    const path = join(this.fixture.directory, `${snapshotId}.yaml`);
    await writeFile(path, text, { flag: "wx" });
    this.snapshots.set(snapshotId, path);
    return contract.outcome.parse({ status: "success", snapshotId, durationMs: 1 });
  }

  private async readSnapshot(request: unknown): Promise<unknown> {
    const contract = documentContracts.readDocumentSnapshot;
    const { snapshotId } = contract.request.parse(request);
    const path = this.snapshots.get(snapshotId);
    assert.ok(path, "The candidate read must identify an owned snapshot");
    return contract.outcome.parse({ status: "success", text: await readFile(path, "utf8"), durationMs: 1 });
  }

  private async release(request: unknown): Promise<unknown> {
    const contract = documentContracts.releaseDocumentSnapshot;
    const { snapshotId } = contract.request.parse(request);
    const path = this.snapshots.get(snapshotId);
    assert.ok(path, "The application must release an owned snapshot");
    await rm(path);
    this.snapshots.delete(snapshotId);
    return contract.outcome.parse({ status: "success", released: true, durationMs: 1 });
  }

  private async readFile(request: unknown): Promise<unknown> {
    const contract = documentContracts.readDocumentFile;
    const { path } = contract.request.parse(request);
    this.controls.observe("saved-document-delivered", "document_file_read received the actual selected saved-file path");
    if (this.fixture.facts.holdOperation === "a saved diagram load") await this.controls.hold("saved load", "saved-load-held");
    if (this.fixture.facts.storageFailure === "read its saved document") {
      this.controls.observe("read its saved document-failure-delivered", "document_file_read received the selected path and returned a reading failure");
      return contract.outcome.parse(failure("io-error"));
    }
    return contract.outcome.parse({ status: "success", text: await readFile(path, "utf8"), durationMs: 1 });
  }

  private async export(request: unknown): Promise<unknown> {
    const contract = documentContracts.exportDocument;
    const { path, text, overwrite } = contract.request.parse(request);
    if (this.cleanupBlocked) return contract.outcome.parse(failure("cleanup-failed", "cleanup"));
    if (this.fixture.facts.storageFailure === "export-cleanup") {
      this.cleanupBlocked = true;
      this.controls.observe("export-cleanup-failed", "document_export returned cleanup-failed and retained its cleanup obligation");
      return contract.outcome.parse(failure("cleanup-failed", "cleanup"));
    }
    if (!overwrite && await stat(path).then(() => true, () => false)) return contract.outcome.parse(failure("destination-exists", "export"));
    if (this.fixture.facts.storageFailure === "export-before-replace") {
      this.controls.observe("export-write-failed", "document_export received the captured diagram and failed before touching the destination");
      return contract.outcome.parse(failure("io-error", "export"));
    }
    const candidate = `${path}.${randomUUID()}.tmp`;
    await writeFile(candidate, text, { flag: "wx" });
    await rename(candidate, path);
    return contract.outcome.parse({ status: "success", exported: true, durationMs: 1 });
  }

  private cleanup(request: unknown): unknown {
    const contract = documentContracts.retryDocumentCleanup;
    contract.request.parse(request);
    if (this.cleanupBlocked) {
      this.cleanupBlocked = false;
      delete this.fixture.facts.storageFailure;
      this.controls.observe("export-cleanup-recovered", "document_cleanup acknowledged the export cleanup obligation");
    }
    return contract.outcome.parse({ status: "success", cleaned: true, durationMs: 1 });
  }
}
