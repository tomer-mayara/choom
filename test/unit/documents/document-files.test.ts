import { expect, test } from "bun:test";
import { DocumentFiles } from "../../../src/documents/document-files.ts";
import { decodeArchitectureYaml, encodeArchitectureYaml } from "../../../src/lib/architecture-yaml.ts";
import { DesktopDocumentAccess } from "../../../src/platform/documents.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";
import { documentStorageFailure, MemoryDocumentAccess, pendingDocumentOperation } from "../../support/document-storage-fixtures.ts";

test("a ready candidate contains the decoded stored bytes and transfers its snapshot", async () => {
  const access = new MemoryDocumentAccess();
  const stored = encodeArchitectureYaml(architectureDocumentFixture("Stored architecture"));
  if (stored.status !== "success") throw new Error("The stored fixture must encode.");
  access.readText = stored.text;
  const result = await new DocumentFiles(access).prepareCandidate(architectureDocumentFixture());
  expect(result.status).toBe("success");
  if (result.status !== "success") throw new Error("The candidate must be ready.");
  expect(result.document).toEqual(architectureDocumentFixture("Stored architecture"));
  expect(access.snapshots.has(result.snapshotId)).toBe(true);
  expect(Number.isFinite(result.durationMs) && result.durationMs >= 0).toBe(true);
});

test("invalid models and already cancelled preparation write no candidate", async () => {
  const access = new MemoryDocumentAccess();
  const files = new DocumentFiles(access);
  expect(await files.prepareCandidate({ schemaVersion: 2 })).toMatchObject({ status: "failure", stage: "encoding", code: "unsupported-version" });
  const control = new AbortController();
  control.abort();
  expect(await files.prepareCandidate(architectureDocumentFixture(), control.signal)).toMatchObject({ status: "cancelled", stage: "storage" });
  expect(access.snapshots.size).toBe(0);
});

test("native creation failure returns no candidate", async () => {
  const access = new MemoryDocumentAccess();
  access.createFailure = documentStorageFailure("io-error");
  expect(await new DocumentFiles(access).prepareCandidate(architectureDocumentFixture())).toMatchObject({ status: "failure", stage: "storage", code: "io-error" });
  expect(access.snapshots.size).toBe(0);
});

test("read and decoding failures release only the candidate they own", async () => {
  for (const defect of ["read", "decode"] as const) {
    const access = new MemoryDocumentAccess();
    const files = new DocumentFiles(access);
    const previous = await files.prepareCandidate(architectureDocumentFixture("Previous"));
    if (previous.status !== "success") throw new Error("The previous candidate must be ready.");
    if (defect === "read") access.readFailure = documentStorageFailure("io-error");
    else access.readText = "schemaVersion: 2\n";
    const result = await files.prepareCandidate(architectureDocumentFixture());
    expect(result).toMatchObject({ status: "failure", stage: defect === "read" ? "storage" : "decoding" });
    expect([...access.snapshots.keys()]).toEqual([previous.snapshotId]);
  }
});

test("cancellation waits for creation and then removes the eventual snapshot", async () => {
  const access = new MemoryDocumentAccess();
  const gate = pendingDocumentOperation<void>();
  access.createGate = gate.promise;
  const control = new AbortController();
  let settled = false;
  const pending = new DocumentFiles(access).prepareCandidate(architectureDocumentFixture(), control.signal).then((result) => { settled = true; return result; });
  await access.created.promise;
  control.abort();
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(access.snapshots.size).toBe(1);
  gate.resolve();
  expect(await pending).toMatchObject({ status: "cancelled", stage: "storage" });
  expect(access.snapshots.size).toBe(0);
});

test("cancellation during the candidate read releases the same snapshot", async () => {
  const access = new MemoryDocumentAccess();
  const gate = pendingDocumentOperation<void>();
  access.readGate = gate.promise;
  const control = new AbortController();
  const pending = new DocumentFiles(access).prepareCandidate(architectureDocumentFixture(), control.signal);
  await access.readStarted.promise;
  control.abort();
  gate.resolve();
  expect(await pending).toMatchObject({ status: "cancelled", stage: "storage" });
  expect(access.snapshots.size).toBe(0);
});

test("preparation does not finish until failed-candidate cleanup finishes", async () => {
  const access = new MemoryDocumentAccess();
  const gate = pendingDocumentOperation<void>();
  access.releaseGate = gate.promise;
  access.readText = "schemaVersion: 2\n";
  let settled = false;
  const pending = new DocumentFiles(access).prepareCandidate(architectureDocumentFixture()).then((result) => { settled = true; return result; });
  await access.releaseStarted.promise;
  expect(settled).toBe(false);
  expect(access.snapshots.size).toBe(1);
  gate.resolve();
  expect(await pending).toMatchObject({ status: "failure", stage: "decoding", code: "unsupported-version" });
  expect(access.snapshots.size).toBe(0);
});

test("cleanup failure wins over cancellation and can be retried without deleting a live snapshot", async () => {
  const access = new MemoryDocumentAccess();
  const files = new DocumentFiles(access);
  const previous = await files.prepareCandidate(architectureDocumentFixture("Previous"));
  if (previous.status !== "success") throw new Error("The previous candidate must be ready.");
  const gate = pendingDocumentOperation<void>();
  access.createGate = gate.promise;
  access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  const control = new AbortController();
  const pending = files.prepareCandidate(architectureDocumentFixture(), control.signal);
  control.abort();
  gate.resolve();
  expect(await pending).toMatchObject({ status: "failure", stage: "cleanup", code: "cleanup-failed" });
  expect(access.snapshots.size).toBe(2);
  access.releaseFailure = undefined;
  expect(await files.retryCleanup()).toMatchObject({ status: "success", cleaned: true });
  expect([...access.snapshots.keys()]).toEqual([previous.snapshotId]);
});

test("cleanup failure also wins over invalid stored architecture", async () => {
  const access = new MemoryDocumentAccess();
  access.readText = "schemaVersion: 2\n";
  access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  expect(await new DocumentFiles(access).prepareCandidate(architectureDocumentFixture())).toMatchObject({ status: "failure", stage: "cleanup", code: "cleanup-failed" });
  expect(access.snapshots.size).toBe(1);
});

test("repeated and concurrent preparation keep snapshot ownership separate", async () => {
  const access = new MemoryDocumentAccess();
  const files = new DocumentFiles(access);
  const [first, second] = await Promise.all([
    files.prepareCandidate(architectureDocumentFixture("First")),
    files.prepareCandidate(architectureDocumentFixture("Second")),
  ]);
  if (first?.status !== "success" || second?.status !== "success") throw new Error("Both candidates must be ready.");
  expect(first.snapshotId).not.toBe(second.snapshotId);
  expect(first.document.name).toBe("First");
  expect(second.document.name).toBe("Second");
  expect(await files.releaseSnapshot(first.snapshotId)).toMatchObject({ status: "success", released: true });
  expect([...access.snapshots.keys()]).toEqual([second.snapshotId]);
});

test("export captures validated bytes before destination selection can change the caller's model", async () => {
  const access = new MemoryDocumentAccess();
  const destination = pendingDocumentOperation<{ path: string; overwrite: boolean } | null>();
  const document = architectureDocumentFixture();
  const pending = new DocumentFiles(access).exportDocument(document, () => destination.promise);
  document.name = "Beacon";
  document.components.reverse();
  destination.resolve({ path: "/exported.choom.yaml", overwrite: true });
  expect(await pending).toMatchObject({ status: "success", exported: true });
  expect(access.exports[0]?.overwrite).toBe(true);
  expect(decodeArchitectureYaml(access.files.get("/exported.choom.yaml") ?? "")).toMatchObject({ status: "success", document: { name: "Atlas" } });
  expect(document.name).toBe("Beacon");
});

test("declining a destination and invalid architecture perform no export", async () => {
  const access = new MemoryDocumentAccess();
  const files = new DocumentFiles(access);
  let selections = 0;
  expect(await files.exportDocument({ schemaVersion: 2 }, async () => { selections += 1; return null; })).toMatchObject({ status: "failure", stage: "encoding" });
  expect(selections).toBe(0);
  expect(await files.exportDocument(architectureDocumentFixture(), async () => null)).toMatchObject({ status: "cancelled", stage: "export" });
  expect(access.exports).toEqual([]);
});

test("export failure preserves the caller's document and forwards explicit overwrite consent", async () => {
  const access = new MemoryDocumentAccess();
  const document = architectureDocumentFixture();
  const before = structuredClone(document);
  access.files.set("/existing.choom.yaml", "previous bytes");
  const result = await new DocumentFiles(access).exportDocument(document, async () => ({ path: "/existing.choom.yaml", overwrite: false }));
  expect(result).toMatchObject({ status: "failure", stage: "export", code: "destination-exists" });
  expect(document).toEqual(before);
  expect(access.files.get("/existing.choom.yaml")).toBe("previous bytes");
  expect(access.exports[0]?.overwrite).toBe(false);
});

test("selection and unexpected storage errors return safe failures and still clean owned candidates", async () => {
  const access = new MemoryDocumentAccess();
  const files = new DocumentFiles(access);
  const selection = await files.exportDocument(architectureDocumentFixture(), async () => { throw new Error("/private/secret"); });
  expect(selection).toMatchObject({ status: "failure", stage: "export" });
  expect(JSON.stringify(selection)).not.toContain("/private");
  access.readDocumentSnapshot = async () => { throw new Error("/private/secret"); };
  const prepared = await files.prepareCandidate(architectureDocumentFixture());
  expect(prepared).toMatchObject({ status: "failure", stage: "storage" });
  expect(JSON.stringify(prepared)).not.toContain("/private");
  expect(access.snapshots.size).toBe(0);
});

test("a rejected cleanup operation is reported as cleanup failure", async () => {
  const access = new MemoryDocumentAccess();
  access.readText = "invalid: document";
  access.releaseDocumentSnapshot = async () => { throw new Error("/private/secret"); };
  const result = await new DocumentFiles(access).prepareCandidate(architectureDocumentFixture());
  expect(result).toMatchObject({ status: "failure", stage: "cleanup", code: "cleanup-failed" });
  expect(JSON.stringify(result)).not.toContain("/private");
});

test("failed release dispatch retains ownership across failed cleanup retries", async () => {
  const access = new MemoryDocumentAccess();
  const release = access.releaseDocumentSnapshot.bind(access);
  access.readText = "schemaVersion: 2\n";
  access.releaseDocumentSnapshot = async () => { throw new Error("Release was not dispatched."); };
  const files = new DocumentFiles(access);
  expect(await files.prepareCandidate(architectureDocumentFixture())).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(access.pendingCleanup.size).toBe(0);
  expect(await files.retryCleanup()).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(access.snapshots.size).toBe(1);
  access.releaseDocumentSnapshot = release;
  expect(await files.retryCleanup()).toMatchObject({ status: "success", cleaned: true });
  expect(access.snapshots.size).toBe(0);
});

test("unconfirmed releases block candidate writes and exports, including an open destination chooser", async () => {
  const access = new MemoryDocumentAccess();
  const files = new DocumentFiles(access);
  const destination = pendingDocumentOperation<{ path: string; overwrite: boolean } | null>();
  const pendingExport = files.exportDocument(architectureDocumentFixture(), () => destination.promise);
  access.readText = "schemaVersion: 2\n";
  access.releaseDocumentSnapshot = async () => { throw new Error("Release was not dispatched."); };
  expect(await files.prepareCandidate(architectureDocumentFixture())).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(await files.prepareCandidate(architectureDocumentFixture())).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(access.snapshots.size).toBe(1);
  let selections = 0;
  expect(await files.exportDocument(architectureDocumentFixture(), async () => {
    selections += 1;
    return { path: "/another.choom.yaml", overwrite: false };
  })).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(selections).toBe(0);
  destination.resolve({ path: "/selected.choom.yaml", overwrite: false });
  expect(await pendingExport).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(access.exports).toEqual([]);
});

test.each([
  ["malformed", "document-typo", "invalid-request"],
  ["foreign-session", "document-11111111-1111-4111-8111-111111111111-1", "invalid-snapshot"],
])("a definitive %s release rejection does not block valid document operations", async (_name, rejectedId, code) => {
  const encoded = encodeArchitectureYaml(architectureDocumentFixture());
  if (encoded.status !== "success") throw new Error("The fixture must encode.");
  const snapshotId = "document-00000000-0000-4000-8000-000000000000-1";
  const access = new DesktopDocumentAccess(async (command) => {
    switch (command) {
      case "document_snapshot_release": return {
        status: "failure", stage: "cleanup", code: "invalid-snapshot",
        message: "The document snapshot is not available.", durationMs: 0,
      };
      case "document_snapshot_create": return { status: "success", snapshotId, durationMs: 0 };
      case "document_snapshot_read": return { status: "success", text: encoded.text, durationMs: 0 };
      case "document_cleanup": return { status: "success", cleaned: true, durationMs: 0 };
      default: throw new Error("Unexpected document operation.");
    }
  }, () => true);
  const files = new DocumentFiles(access);
  expect(await files.releaseSnapshot(rejectedId)).toMatchObject({ status: "failure", stage: "cleanup", code });
  expect(await files.prepareCandidate(architectureDocumentFixture())).toMatchObject({ status: "success", snapshotId });
  expect(await files.retryCleanup()).toMatchObject({ status: "success", cleaned: true });
});

test("opening saved architecture uses only its stored text and the shared decoder", async () => {
  const access = new MemoryDocumentAccess();
  const encoded = encodeArchitectureYaml(architectureDocumentFixture());
  if (encoded.status !== "success") throw new Error("The saved fixture must encode.");
  access.files.set("/offline.choom.yaml", encoded.text);
  const files = new DocumentFiles(access);
  expect(await files.openSavedFile("/offline.choom.yaml")).toMatchObject({ status: "success", document: architectureDocumentFixture() });
  expect(await files.openSavedFile("/missing.choom.yaml")).toMatchObject({ status: "failure", stage: "storage", code: "not-found" });
  access.files.set("/unsupported.choom.yaml", "schemaVersion: 2\n");
  expect(await files.openSavedFile("/unsupported.choom.yaml")).toMatchObject({ status: "failure", stage: "decoding", code: "unsupported-version" });
  expect(access.snapshots.size).toBe(0);
  expect(access.exports).toEqual([]);
});
