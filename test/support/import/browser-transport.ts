import assert from "node:assert/strict";
import { BrowserAnalyzerTransport } from "./browser-analyzer.ts";
import { BrowserImportControls } from "./browser-controls.ts";
import { BrowserDocumentTransport } from "./browser-documents.ts";
import { BrowserRepositoryTransport } from "./browser-repository.ts";
import { object, type ImportFixture } from "./fixtures.ts";

/** Browser simulation of the public native commands; installed acceptance uses real Rust. */
export class BrowserImportTransport {
  readonly controls: BrowserImportControls;
  private readonly repository: BrowserRepositoryTransport;
  private readonly analyzer: BrowserAnalyzerTransport;
  private readonly documents: BrowserDocumentTransport;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly invalidCalls: string[] = [];
  private closed = false;
  private failedExports = 0;

  constructor(fixture: ImportFixture) {
    this.controls = new BrowserImportControls(fixture);
    this.repository = new BrowserRepositoryTransport(fixture, this.controls);
    this.analyzer = new BrowserAnalyzerTransport(fixture, this.controls);
    this.documents = new BrowserDocumentTransport(fixture, this.controls);
  }

  async invoke(command: string, args: unknown): Promise<unknown> {
    if (this.closed) throw new Error("The scenario transport is closed");
    const request = object(args).request;
    const operation = command.startsWith("repository_") ? this.repository.invoke(command, request)
      : command.startsWith("depcruiser_") ? this.analyzer.invoke(command, request)
        : command.startsWith("document_") ? this.documents.invoke(command, request)
          : Promise.reject(new Error(`Unexpected native command: ${command}`));
    this.pending.add(operation);
    try {
      const result = await operation;
      const outcome = object(result);
      if (command === "document_export" && outcome.status === "failure" && outcome.code !== "destination-exists") this.failedExports += 1;
      return result;
    }
    catch (error) { this.invalidCalls.push(`${command}: ${String(error)}`); throw error; }
    finally { this.pending.delete(operation); }
  }

  isIdle(): boolean { return this.pending.size === 0; }
  exportFailureCount(): number { return this.failedExports; }

  assertValidCalls(): void { assert.deepEqual(this.invalidCalls, [], "The application must use valid public native requests and outcomes"); }

  async close(): Promise<void> {
    this.closed = true;
    this.controls.releaseAll();
    await Promise.allSettled(this.pending);
  }
}
