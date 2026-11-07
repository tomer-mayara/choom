import { expect, test } from "bun:test";
import { DocumentFiles } from "../../../src/documents/document-files.ts";
import { decodeArchitectureYaml } from "../../../src/lib/architecture-yaml.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";
import { documentStorageFailure, MemoryDocumentAccess, pendingDocumentOperation } from "../../support/document-storage-fixtures.ts";

async function storedDocuments() {
  const access = new MemoryDocumentAccess();
  const files = new DocumentFiles(access);
  const previous = await files.prepareCandidate(architectureDocumentFixture("Previous"));
  const current = await files.prepareCandidate(architectureDocumentFixture("Current"));
  if (previous.status !== "success" || current.status !== "success") throw new Error("Both documents must be stored.");
  return { access, files, previous, current };
}

test("export captures bytes immediately and waits for a successful snapshot release", async () => {
  const { access, files, previous, current } = await storedDocuments();
  const gate = pendingDocumentOperation<void>();
  access.releaseGate = gate.promise;
  const releasing = files.releaseSnapshot(previous.snapshotId);
  await access.releaseStarted.promise;
  const document = architectureDocumentFixture("Current");
  let settled = false;
  const exporting = files.exportDocument(document, async () => ({ path: "/exported.choom.yaml", overwrite: false }))
    .then((result) => { settled = true; return result; });
  document.name = "Later";
  try {
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(access.exports).toEqual([]);
    gate.resolve();
    expect(await releasing).toMatchObject({ status: "success" });
    expect(await exporting).toMatchObject({ status: "success", exported: true });
    expect(decodeArchitectureYaml(access.files.get("/exported.choom.yaml") ?? ""))
      .toMatchObject({ status: "success", document: { name: "Current" } });
    expect([...access.snapshots.keys()]).toEqual([current.snapshotId]);
  } finally { gate.resolve(); await releasing; }
});

test("export waits for a release outcome and preserves a real cleanup failure", async () => {
  const { access, files, previous, current } = await storedDocuments();
  const gate = pendingDocumentOperation<void>();
  access.releaseGate = gate.promise;
  access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  const releasing = files.releaseSnapshot(previous.snapshotId);
  await access.releaseStarted.promise;
  let selected = false;
  const exporting = files.exportDocument(architectureDocumentFixture("Current"), async () => {
    selected = true;
    return { path: "/blocked.choom.yaml", overwrite: false };
  });
  gate.resolve();
  expect(await releasing).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(await exporting).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(selected).toBe(false);
  expect(access.exports).toEqual([]);
  expect([...access.snapshots.keys()]).toEqual([previous.snapshotId, current.snapshotId]);
  access.releaseFailure = undefined;
  expect(await files.retryCleanup()).toMatchObject({ status: "success", cleaned: true });
  expect([...access.snapshots.keys()]).toEqual([current.snapshotId]);
});

test("preparation captures bytes before waiting for a prior release", async () => {
  const { access, files, previous, current } = await storedDocuments();
  const gate = pendingDocumentOperation<void>();
  access.releaseGate = gate.promise;
  const releasing = files.releaseSnapshot(previous.snapshotId);
  await access.releaseStarted.promise;
  const document = architectureDocumentFixture("Next");
  const preparing = files.prepareCandidate(document);
  document.name = "Later";
  expect([...access.snapshots.keys()]).toEqual([previous.snapshotId, current.snapshotId]);
  gate.resolve();
  expect(await releasing).toMatchObject({ status: "success" });
  expect(await preparing).toMatchObject({ status: "success", document: { name: "Next" } });
  expect(access.snapshots.has(previous.snapshotId)).toBe(false);
  expect(access.snapshots.has(current.snapshotId)).toBe(true);
});

test("pre-aborted preparation does not inspect architecture or allocate a snapshot", async () => {
  const access = new MemoryDocumentAccess();
  const control = new AbortController();
  control.abort();
  let inspected = false;
  const document = new Proxy(architectureDocumentFixture(), {
    ownKeys() { inspected = true; throw new Error("The cancelled document should not be encoded."); },
  });
  expect(await new DocumentFiles(access).prepareCandidate(document, control.signal)).toMatchObject({ status: "cancelled" });
  expect(inspected).toBe(false);
  expect(access.snapshots.size).toBe(0);
});

test.each(["destination", "replacement confirmation"])("export waits for a successful release begun during %s", async (phase) => {
  const { access, files, previous, current } = await storedDocuments();
  const prompt = pendingDocumentOperation<void>();
  const asked = pendingDocumentOperation<void>();
  const gate = pendingDocumentOperation<void>();
  access.releaseGate = gate.promise;
  if (phase === "replacement confirmation") access.files.set("/exported.choom.yaml", "original bytes");
  const exporting = files.exportDocument(architectureDocumentFixture("Current"), async () => {
    if (phase === "destination") { asked.resolve(); await prompt.promise; }
    return { path: "/exported.choom.yaml", overwrite: false };
  }, async () => { asked.resolve(); await prompt.promise; return true; });
  await asked.promise;
  const releasing = files.releaseSnapshot(previous.snapshotId);
  await access.releaseStarted.promise;
  prompt.resolve();
  // The chooser completes before the native release acknowledges removal.
  await Promise.resolve();
  await Promise.resolve();
  gate.resolve();
  expect(await releasing).toMatchObject({ status: "success" });
  expect(await exporting).toMatchObject({ status: "success", exported: true });
  expect(decodeArchitectureYaml(access.files.get("/exported.choom.yaml") ?? ""))
    .toMatchObject({ status: "success", document: { name: "Current" } });
  expect([...access.snapshots.keys()]).toEqual([current.snapshotId]);
});

test("export also waits for a second release that starts while the first is pending", async () => {
  const { access, files, previous, current } = await storedDocuments();
  const first = pendingDocumentOperation<void>();
  const second = pendingDocumentOperation<void>();
  access.releaseGate = first.promise;
  const releasingFirst = files.releaseSnapshot(previous.snapshotId);
  await access.releaseStarted.promise;
  let selected = false;
  const exporting = files.exportDocument(architectureDocumentFixture("Current"), async () => {
    selected = true;
    return { path: "/exported.choom.yaml", overwrite: false };
  });
  access.releaseGate = second.promise;
  const releasingSecond = files.releaseSnapshot(current.snapshotId);
  first.resolve();
  expect(await releasingFirst).toMatchObject({ status: "success" });
  await Promise.resolve();
  expect(selected).toBe(false);
  expect(access.exports).toEqual([]);
  second.resolve();
  expect(await releasingSecond).toMatchObject({ status: "success" });
  expect(await exporting).toMatchObject({ status: "success", exported: true });
  expect(access.snapshots.size).toBe(0);
});

test("cleanup retry joins a running release before native cleanup", async () => {
  const { access, files, previous, current } = await storedDocuments();
  const gate = pendingDocumentOperation<void>();
  access.releaseGate = gate.promise;
  let releases = 0;
  const cleanupSnapshots: string[][] = [];
  const release = access.releaseDocumentSnapshot.bind(access);
  const cleanup = access.retryDocumentCleanup.bind(access);
  access.releaseDocumentSnapshot = async (request) => { releases += 1; return release(request); };
  access.retryDocumentCleanup = async () => { cleanupSnapshots.push([...access.snapshots.keys()]); return cleanup(); };
  const releasing = files.releaseSnapshot(previous.snapshotId);
  await access.releaseStarted.promise;
  const joining = files.releaseSnapshot(previous.snapshotId);
  const cleaning = files.retryCleanup();
  gate.resolve();
  expect(await releasing).toMatchObject({ status: "success" });
  expect(await joining).toMatchObject({ status: "success" });
  expect(await cleaning).toMatchObject({ status: "success", cleaned: true });
  expect(releases).toBe(1);
  expect(cleanupSnapshots).toEqual([[current.snapshotId]]);
  expect([...access.snapshots.keys()]).toEqual([current.snapshotId]);
});
