import { invoke, isTauri } from "@tauri-apps/api/core";
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
  "not-found": "The selected document file was not found.",
  "not-file": "The selected document is not a regular file.",
  "limit-exceeded": "The document exceeds the supported size.",
  "invalid-utf8": "The document is not valid UTF-8 text.",
  "source-changed": "An owned document file or directory changed.",
  "io-error": "The document file operation could not complete.",
  unavailable: "The document file service is unavailable in this environment.",
  "invalid-response": "The native document response is invalid.",
};

function failed(code: DocumentNativeFailure["code"], started: number): DocumentNativeFailure {
  return { status: "failure", stage: "storage", code, message: failureMessages[code], durationMs: Math.max(0, performance.now() - started) };
}

/** Validates the dedicated native file read on both sides of IPC. */
export class DesktopDocumentAccess implements DocumentAccess {
  private readonly transport: DocumentTransport;
  private readonly available: () => boolean;

  constructor(transport: DocumentTransport = invoke, available: () => boolean = isTauri) {
    this.transport = transport;
    this.available = available;
  }

  async readDocumentFile(request: Parameters<DocumentFileOperations["readDocumentFile"]>[0]): Promise<ReturnType<DocumentFileOperations["readDocumentFile"]>> {
    const contract = documentContracts.readDocumentFile;
    const started = performance.now();
    const input = contract.request.safeParse(request);
    if (!input.success) return failed("invalid-request", started);
    if (!this.available()) return failed("unavailable", started);
    let response: unknown;
    try {
      response = await this.transport("document_file_read", { request: input.data });
    } catch {
      return failed("unavailable", started);
    }
    const output = contract.outcome.safeParse(response);
    if (!output.success) return failed("invalid-response", started);
    if (output.data.status === "failure") {
      return { ...output.data, message: failureMessages[output.data.code] };
    }
    return output.data;
  }
}
