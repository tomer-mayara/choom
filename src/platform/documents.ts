import { invoke, isTauri } from "@tauri-apps/api/core";
import type { z } from "zod";
import type { DocumentFileOperations, DocumentNativeFailure } from "./generated/contracts.ts";
import { documentContracts } from "./documents-contract.ts";

export type DocumentAccess = {
  [Name in keyof DocumentFileOperations]: (
    ...args: Parameters<DocumentFileOperations[Name]>
  ) => Promise<ReturnType<DocumentFileOperations[Name]>>;
};

type DocumentTransport = (command: string, args: { request: unknown }) => Promise<unknown>;
const failureMessages: Record<DocumentNativeFailure["code"], string> = {
  "invalid-request": "The document request is invalid.",
  "invalid-snapshot": "The document snapshot is not available.",
  "snapshot-limit": "Release a document snapshot before creating another.",
  "not-found": "The selected document file was not found.",
  "not-file": "The selected document is not a regular file.",
  "limit-exceeded": "The document exceeds the supported size.",
  "invalid-utf8": "The document is not valid UTF-8 text.",
  "destination-exists": "The destination already exists. Approve replacement before exporting.",
  "source-changed": "An owned document file or directory changed.",
  "cleanup-failed": "Document cleanup could not complete. Retry cleanup before writing again.",
  "io-error": "The document file operation could not complete.",
  unavailable: "The document file service is unavailable in this environment.",
  "invalid-response": "The native document response is invalid.",
};

function failed(code: DocumentNativeFailure["code"], stage: DocumentNativeFailure["stage"], started: number): DocumentNativeFailure {
  return { status: "failure", stage, code, message: failureMessages[code], durationMs: Math.max(0, performance.now() - started) };
}

/** Validates the dedicated native document operations on both sides of IPC. */
export class DesktopDocumentAccess implements DocumentAccess {
  private readonly transport: DocumentTransport;
  private readonly available: () => boolean;

  constructor(transport: DocumentTransport = invoke, available: () => boolean = isTauri) {
    this.transport = transport;
    this.available = available;
  }

  createDocumentSnapshot(request: Parameters<DocumentFileOperations["createDocumentSnapshot"]>[0]) {
    return this.call("document_snapshot_create", request, documentContracts.createDocumentSnapshot, "storage");
  }

  readDocumentSnapshot(request: Parameters<DocumentFileOperations["readDocumentSnapshot"]>[0]) {
    return this.call("document_snapshot_read", request, documentContracts.readDocumentSnapshot, "storage");
  }

  releaseDocumentSnapshot(request: Parameters<DocumentFileOperations["releaseDocumentSnapshot"]>[0]) {
    return this.call("document_snapshot_release", request, documentContracts.releaseDocumentSnapshot, "cleanup");
  }

  readDocumentFile(request: Parameters<DocumentFileOperations["readDocumentFile"]>[0]) {
    return this.call("document_file_read", request, documentContracts.readDocumentFile, "storage");
  }

  exportDocument(request: Parameters<DocumentFileOperations["exportDocument"]>[0]) {
    return this.call("document_export", request, documentContracts.exportDocument, "export");
  }

  retryDocumentCleanup(request: Parameters<DocumentFileOperations["retryDocumentCleanup"]>[0]) {
    return this.call("document_cleanup", request, documentContracts.retryDocumentCleanup, "cleanup");
  }

  private async call<Request, Outcome extends DocumentNativeFailure | { status: "success" }>(
    command: string, request: Request, contract: { request: z.ZodType<Request>; outcome: z.ZodType<Outcome> },
    stage: DocumentNativeFailure["stage"],
  ): Promise<Outcome | DocumentNativeFailure> {
    const started = performance.now();
    const input = contract.request.safeParse(request);
    if (!input.success) return failed("invalid-request", stage, started);
    if (!this.available()) return failed("unavailable", stage, started);
    let response: unknown;
    try {
      response = await this.transport(command, { request: input.data });
    } catch {
      return failed("unavailable", stage, started);
    }
    const output = contract.outcome.safeParse(response);
    if (!output.success) return failed("invalid-response", stage, started);
    if (output.data.status === "failure") {
      return { ...output.data, message: failureMessages[output.data.code] };
    }
    return output.data;
  }
}

export const desktopDocumentAccess: DocumentAccess = new DesktopDocumentAccess();
