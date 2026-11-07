import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { stringify } from "yaml";
import type { ArchitectureDocument } from "../../src/domain/generated/contracts.ts";
import { DocumentFiles } from "../../src/documents/document-files.ts";
import { decodeArchitectureYaml, encodeArchitectureYaml } from "../../src/lib/architecture-yaml.ts";
import type { DecodeArchitectureOutcome, EncodeArchitectureOutcome } from "../../src/lib/generated/contracts.ts";
import { architectureDocumentFixture } from "../support/document-fixtures.ts";
import { documentStorageFailure, MemoryDocumentAccess, pendingDocumentOperation } from "../support/document-storage-fixtures.ts";

interface DocumentsWorld extends World {
  document: ArchitectureDocument;
  access: MemoryDocumentAccess;
  files: DocumentFiles;
  text: string;
  originalText: string;
  encoded: EncodeArchitectureOutcome;
  decoded: DecodeArchitectureOutcome;
  preparation: ReturnType<DocumentFiles["prepareCandidate"]>;
  prepared: Awaited<ReturnType<DocumentFiles["prepareCandidate"]>>;
  opened: Awaited<ReturnType<DocumentFiles["openSavedFile"]>>;
  exportOperation: ReturnType<DocumentFiles["exportDocument"]>;
  exported: Awaited<ReturnType<DocumentFiles["exportDocument"]>>;
  control: AbortController;
  creationGate: ReturnType<typeof pendingDocumentOperation<void>>;
  destination: ReturnType<typeof pendingDocumentOperation<{ path: string; overwrite: boolean } | null>>;
  expectedStored: ArchitectureDocument;
  currentSnapshotId: string;
  retainedBefore: string[];
  restoreRelease: MemoryDocumentAccess["releaseDocumentSnapshot"];
  cleanup: Awaited<ReturnType<DocumentFiles["retryCleanup"]>>;
  releaseGate: ReturnType<typeof pendingDocumentOperation<void>>;
  releaseOperation: ReturnType<DocumentFiles["releaseSnapshot"]>;
}

function useDocument(world: DocumentsWorld, name = "Atlas"): void {
  world.document = architectureDocumentFixture(name);
  world.access = new MemoryDocumentAccess();
  world.files = new DocumentFiles(world.access);
}

function savedText(document: unknown): string {
  const result = encodeArchitectureYaml(document);
  assert.equal(result.status, "success", "The scenario's architecture must be valid.");
  if (result.status !== "success") assert.fail("The fixture must encode.");
  return result.text;
}

Given("an architecture document declares only {string}, {string}, and {string}", function (this: DocumentsWorld, root: string, workspace: string, core: string) {
  useDocument(this);
  assert.deepEqual(this.document.components.map(({ id }) => id).sort(), [root, workspace, core].sort());
});

Given("its workspace imports a package from both {string} and {string}", function (this: DocumentsWorld, first: string, second: string) {
  const evidence = this.document.relationships.flatMap((relationship) => relationship.evidence);
  assert.ok(evidence.some(({ sourceFile }) => sourceFile.startsWith(`${first}/`)));
  assert.ok(evidence.some(({ sourceFile }) => sourceFile.startsWith(`${second}/`)));
});

When("the document is saved as YAML and decoded again", function (this: DocumentsWorld) {
  this.encoded = encodeArchitectureYaml(this.document);
  assert.ok(this.encoded.status === "success");
  this.decoded = decodeArchitectureYaml(this.encoded.text);
});

Then("its declared components, deep file evidence, counts, and folder findings are preserved", function (this: DocumentsWorld) {
  assert.ok(this.decoded.status === "success");
  assert.deepEqual(this.decoded.document, this.document);
});

Given("an architecture document has its component and evidence collections in a different order", function (this: DocumentsWorld) {
  useDocument(this);
  this.originalText = savedText(this.document);
  this.document.components.reverse();
  for (const relationship of this.document.relationships) relationship.evidence.reverse();
  this.text = stringify(this.document);
});

When("the document is decoded and saved again", function (this: DocumentsWorld) {
  this.decoded = decodeArchitectureYaml(this.text);
  assert.ok(this.decoded.status === "success");
  this.encoded = encodeArchitectureYaml(this.decoded.document);
});

Then("its YAML has the same canonical collections as the original document", function (this: DocumentsWorld) {
  assert.ok(this.encoded.status === "success");
  assert.equal(this.encoded.text, this.originalText);
});

Given(/^a saved architecture document contains (.+)$/, function (this: DocumentsWorld, content: string) {
  useDocument(this);
  const valid = savedText(this.document);
  switch (content) {
    case "schemaVersion 2": this.text = stringify({ ...this.document, schemaVersion: 2 }); break;
    case "duplicate mapping keys": this.text = `schemaVersion: 1\n${valid}`; break;
    case "a custom YAML tag": this.text = valid.replace("name: Atlas", "name: !custom Atlas"); break;
    case "two YAML documents": this.text = `---\n${valid}---\n${valid}`; break;
    case "an unknown semantic field": this.text = stringify({ ...this.document, viewport: { x: 0, y: 0 } }); break;
    case "an alias": this.text = "name: &name Atlas\ncopy: *name\n"; break;
    default: assert.fail(`Unknown document encoding: ${content}`);
  }
  this.originalText = this.text;
});

When("the document text is decoded", function (this: DocumentsWorld) {
  this.decoded = decodeArchitectureYaml(this.text);
});

Then("decoding fails with {string} without changing the supplied text", function (this: DocumentsWorld, code: string) {
  assert.ok(this.decoded.status === "failure");
  assert.equal(this.decoded.code, code);
  assert.equal(this.text, this.originalText);
});

Given("the architecture document {string} is ready to save", function (this: DocumentsWorld, name: string) {
  useDocument(this, name);
  this.expectedStored = architectureDocumentFixture(`${name} from storage`);
  this.access.readText = savedText(this.expectedStored);
});

Given("a newly stored candidate cannot be decoded", function (this: DocumentsWorld) {
  useDocument(this);
  this.access.readText = "schemaVersion: 2\n";
});

When("a stored candidate is prepared", async function (this: DocumentsWorld) {
  this.prepared = await this.files.prepareCandidate(this.document);
});

Then("the candidate contains the architecture read from storage", function (this: DocumentsWorld) {
  assert.ok(this.prepared.status === "success");
  assert.deepEqual(this.prepared.document, this.expectedStored);
  assert.ok(this.access.snapshots.has(this.prepared.snapshotId));
});

Then("preparation fails and removes its owned candidate", function (this: DocumentsWorld) {
  assert.ok(this.prepared.status === "failure");
  assert.equal(this.prepared.stage, "decoding");
  assert.equal(this.access.snapshots.size, 0);
});

Given("candidate storage for {string} has not completed", async function (this: DocumentsWorld, name: string) {
  useDocument(this, name);
  this.creationGate = pendingDocumentOperation<void>();
  this.access.createGate = this.creationGate.promise;
  this.control = new AbortController();
  this.preparation = this.files.prepareCandidate(this.document, this.control.signal);
  await this.access.created.promise;
});

Given("the candidate cannot be removed", function (this: DocumentsWorld) {
  this.access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
});

When("preparation is cancelled", async function (this: DocumentsWorld) {
  this.control.abort();
  this.creationGate.resolve();
  this.prepared = await this.preparation;
});

Then("preparation ends as cancelled after removing the candidate", function (this: DocumentsWorld) {
  assert.equal(this.prepared.status, "cancelled");
  assert.equal(this.access.snapshots.size, 0);
});

Then("preparation reports a cleanup failure", function (this: DocumentsWorld) {
  assert.ok(this.prepared.status === "failure");
  assert.equal(this.prepared.stage, "cleanup");
  assert.equal(this.prepared.code, "cleanup-failed");
});

Given("only a saved architecture file for {string} is available", function (this: DocumentsWorld, name: string) {
  useDocument(this, name);
  this.access.files.set("/saved.choom.yaml", savedText(this.document));
});

When("the saved architecture is opened through document operations", async function (this: DocumentsWorld) {
  this.opened = await this.files.openSavedFile("/saved.choom.yaml");
});

Then("the document is restored without accessing a repository or analyzer", function (this: DocumentsWorld) {
  assert.ok(this.opened.status === "success");
  assert.deepEqual(this.opened.document, this.document);
  assert.equal(this.access.snapshots.size, 0);
  assert.equal(this.access.exports.length, 0);
});

Given("a current document is stored and removal of a rejected candidate failed", async function (this: DocumentsWorld) {
  useDocument(this);
  const current = await this.files.prepareCandidate(this.document);
  assert.ok(current.status === "success");
  this.currentSnapshotId = current.snapshotId;
  this.access.readText = "schemaVersion: 2\n";
  this.restoreRelease = this.access.releaseDocumentSnapshot.bind(this.access);
  this.access.releaseDocumentSnapshot = async () => { throw new Error("Removal was not dispatched."); };
  this.prepared = await this.files.prepareCandidate(architectureDocumentFixture("Rejected"));
  assert.ok(this.prepared.status === "failure" && this.prepared.stage === "cleanup");
  assert.equal(this.access.pendingCleanup.size, 0);
  assert.equal(this.access.snapshots.size, 2);
  this.retainedBefore = [...this.access.snapshots.keys()];
});

When("cleanup is retried after removal becomes available", async function (this: DocumentsWorld) {
  this.access.releaseDocumentSnapshot = this.restoreRelease;
  this.access.readText = undefined;
  this.cleanup = await this.files.retryCleanup();
});

Then("the rejected candidate is removed and the current document remains available", async function (this: DocumentsWorld) {
  assert.equal(this.cleanup.status, "success");
  assert.deepEqual([...this.access.snapshots.keys()], [this.currentSnapshotId]);
  const stored = await this.access.readDocumentSnapshot({ snapshotId: this.currentSnapshotId });
  assert.ok(stored.status === "success");
  const decoded = decodeArchitectureYaml(stored.text);
  assert.ok(decoded.status === "success");
  assert.deepEqual(decoded.document, this.document);
});

When("another candidate and an export are requested", async function (this: DocumentsWorld) {
  this.prepared = await this.files.prepareCandidate(architectureDocumentFixture("Next"));
  this.exported = await this.files.exportDocument(architectureDocumentFixture("Next"), async () => ({
    path: "/blocked.choom.yaml", overwrite: false,
  }));
});

Then("both requests report cleanup failure without writing new files", function (this: DocumentsWorld) {
  assert.ok(this.prepared.status === "failure" && this.prepared.stage === "cleanup");
  assert.ok(this.exported.status === "failure" && this.exported.stage === "cleanup");
  assert.deepEqual([...this.access.snapshots.keys()], this.retainedBefore);
  assert.equal(this.access.exports.length, 0);
  assert.equal(this.access.files.size, 0);
});

Given("an export of architecture {string} is awaiting a destination", function (this: DocumentsWorld, name: string) {
  useDocument(this, name);
  this.destination = pendingDocumentOperation<{ path: string; overwrite: boolean } | null>();
  this.exportOperation = this.files.exportDocument(this.document, () => this.destination.promise);
});

Given("the caller's architecture changes to {string}", function (this: DocumentsWorld, name: string) {
  this.document.name = name;
});

Given("{string} is current while the previous document is being removed", async function (this: DocumentsWorld, name: string) {
  useDocument(this, name);
  const previous = await this.files.prepareCandidate(architectureDocumentFixture("Previous"));
  const current = await this.files.prepareCandidate(this.document);
  assert.ok(previous.status === "success" && current.status === "success");
  this.currentSnapshotId = current.snapshotId;
  this.releaseGate = pendingDocumentOperation<void>();
  this.access.releaseGate = this.releaseGate.promise;
  this.releaseOperation = this.files.releaseSnapshot(previous.snapshotId);
  await this.access.releaseStarted.promise;
});

When("the current architecture is exported as removal finishes", async function (this: DocumentsWorld) {
  this.exportOperation = this.files.exportDocument(this.document, async () => ({ path: "/exported.choom.yaml", overwrite: false }));
  this.releaseGate.resolve();
  assert.equal((await this.releaseOperation).status, "success");
  this.exported = await this.exportOperation;
});

Then("the previous document is removed and the current document remains available", async function (this: DocumentsWorld) {
  assert.deepEqual([...this.access.snapshots.keys()], [this.currentSnapshotId]);
  const current = await this.access.readDocumentSnapshot({ snapshotId: this.currentSnapshotId });
  assert.ok(current.status === "success");
  const decoded = decodeArchitectureYaml(current.text);
  assert.ok(decoded.status === "success");
  assert.deepEqual(decoded.document, this.document);
});

When("the export destination is chosen", async function (this: DocumentsWorld) {
  this.destination.resolve({ path: "/exported.choom.yaml", overwrite: false });
  this.exported = await this.exportOperation;
});

Then("the exported YAML still describes {string}", function (this: DocumentsWorld, name: string) {
  assert.equal(this.exported.status, "success");
  const decoded = decodeArchitectureYaml(this.access.files.get("/exported.choom.yaml") ?? "");
  assert.ok(decoded.status === "success");
  assert.equal(decoded.document.name, name);
});

When("its export destination is declined", async function (this: DocumentsWorld) {
  this.exported = await this.files.exportDocument(this.document, async () => null);
});

Then("the export ends as cancelled without writing a file", function (this: DocumentsWorld) {
  assert.equal(this.exported.status, "cancelled");
  assert.equal(this.access.exports.length, 0);
});

Given("its export destination cannot be replaced", function (this: DocumentsWorld) {
  this.access.files.set("/exported.choom.yaml", "previous bytes");
  this.access.exportFailure = documentStorageFailure("io-error", "export");
});

When("the document is exported", async function (this: DocumentsWorld) {
  this.exported = await this.files.exportDocument(this.document, async () => ({ path: "/exported.choom.yaml", overwrite: true }));
});

Then("export fails while the caller still has {string}", function (this: DocumentsWorld, name: string) {
  assert.equal(this.exported.status, "failure");
  assert.equal(this.document.name, name);
  assert.equal(this.access.files.get("/exported.choom.yaml"), "previous bytes");
});
