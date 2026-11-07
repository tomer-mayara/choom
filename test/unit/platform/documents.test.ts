import { expect, test } from "bun:test";
import { DesktopDocumentAccess } from "../../../src/platform/documents.ts";

const snapshotId = "document-00000000-0000-4000-8000-000000000000-1";

test("browser document operations are unavailable without native calls", async () => {
  let calls = 0;
  const access = new DesktopDocumentAccess(async () => { calls += 1; }, () => false);
  const results = await Promise.all([
    access.createDocumentSnapshot({ text: "architecture" }),
    access.readDocumentSnapshot({ snapshotId }),
    access.releaseDocumentSnapshot({ snapshotId }),
    access.readDocumentFile({ path: "/saved diagram.choom.yaml" }),
    access.exportDocument({ path: "/saved diagram.choom.yaml", text: "architecture", overwrite: false }),
    access.retryDocumentCleanup({}),
  ]);
  expect(results.every((result) => result.status === "failure" && result.code === "unavailable")).toBe(true);
  expect(calls).toBe(0);
});

test("document commands use validated request envelopes and preserve successful data", async () => {
  const requests: Array<{ command: string; request: unknown }> = [];
  const access = new DesktopDocumentAccess(async (command, { request }) => {
    requests.push({ command, request });
    switch (command) {
      case "document_snapshot_create": return { status: "success", snapshotId, durationMs: 1 };
      case "document_snapshot_read": return { status: "success", text: "stored 中文", durationMs: 2 };
      case "document_snapshot_release": return { status: "success", released: true, durationMs: 3 };
      case "document_file_read": return { status: "success", text: "saved 中文", durationMs: 4 };
      case "document_export": return { status: "success", exported: true, durationMs: 5 };
      case "document_cleanup": return { status: "success", cleaned: true, durationMs: 6 };
      default: throw new Error("Unexpected document operation.");
    }
  }, () => true);
  expect(await access.createDocumentSnapshot({ text: "stored 中文" })).toEqual({ status: "success", snapshotId, durationMs: 1 });
  expect(await access.readDocumentSnapshot({ snapshotId })).toEqual({ status: "success", text: "stored 中文", durationMs: 2 });
  expect(await access.releaseDocumentSnapshot({ snapshotId })).toEqual({ status: "success", released: true, durationMs: 3 });
  expect(await access.readDocumentFile({ path: "/saved diagram.choom.yaml" })).toEqual({ status: "success", text: "saved 中文", durationMs: 4 });
  expect(await access.exportDocument({ path: "/saved diagram.choom.yaml", text: "captured", overwrite: true })).toEqual({ status: "success", exported: true, durationMs: 5 });
  expect(await access.retryDocumentCleanup({})).toEqual({ status: "success", cleaned: true, durationMs: 6 });
  expect(requests).toEqual([
    { command: "document_snapshot_create", request: { text: "stored 中文" } },
    { command: "document_snapshot_read", request: { snapshotId } },
    { command: "document_snapshot_release", request: { snapshotId } },
    { command: "document_file_read", request: { path: "/saved diagram.choom.yaml" } },
    { command: "document_export", request: { path: "/saved diagram.choom.yaml", text: "captured", overwrite: true } },
    { command: "document_cleanup", request: {} },
  ]);
});

test("invalid paths, Unicode, and extra fields never reach native document operations", async () => {
  let calls = 0;
  const access = new DesktopDocumentAccess(async () => { calls += 1; }, () => true);
  for (const request of [
    { path: "relative.choom.yaml" }, { path: "/valid", extra: true },
    { path: `/${"中".repeat(1366)}` }, { path: "/hidden\nfile" }, { path: "/broken\ud800" },
  ]) {
    expect(await access.readDocumentFile(request)).toMatchObject({ status: "failure", stage: "storage", code: "invalid-request" });
  }
  expect(await access.createDocumentSnapshot({ text: "\ud800" })).toMatchObject({ status: "failure", code: "invalid-request" });
  const invalidExport = { path: "/valid", text: "valid", overwrite: false, extra: true };
  expect(await access.exportDocument(invalidExport)).toMatchObject({ status: "failure", code: "invalid-request" });
  const untypedCleanup = { extra: true } as unknown as Parameters<typeof access.retryDocumentCleanup>[0];
  expect(await access.retryDocumentCleanup(untypedCleanup)).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(calls).toBe(0);
});

test("snapshot identities require UUID version 4 and an in-range positive counter", async () => {
  let calls = 0;
  const access = new DesktopDocumentAccess(async () => { calls += 1; return { status: "success", released: true, durationMs: 0 }; }, () => true);
  for (const identity of [
    "", "document-1", snapshotId.replace("4000", "3000"), snapshotId.replace("8000", "7000"),
    snapshotId.replace(/-1$/, "-0"), snapshotId.replace(/-1$/, "-01"),
    snapshotId.replace(/-1$/, "-18446744073709551616"),
  ]) {
    expect(await access.releaseDocumentSnapshot({ snapshotId: identity })).toMatchObject({ status: "failure", code: "invalid-request" });
  }
  expect(calls).toBe(0);
  expect(await access.releaseDocumentSnapshot({ snapshotId: snapshotId.replace(/-1$/, "-18446744073709551615") }))
    .toMatchObject({ status: "success" });
});

test("document text is limited by UTF-8 bytes on both sides of the boundary", async () => {
  const text = "é".repeat(8 * 1024 * 1024);
  let calls = 0;
  const access = new DesktopDocumentAccess(async (command) => {
    calls += 1;
    return command === "document_snapshot_create"
      ? { status: "success", snapshotId, durationMs: 0 }
      : { status: "success", text: `${text}é`, durationMs: 0 };
  }, () => true);
  expect((await access.createDocumentSnapshot({ text })).status).toBe("success");
  expect(await access.createDocumentSnapshot({ text: `${text}é` })).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(calls).toBe(1);
  expect(await access.readDocumentSnapshot({ snapshotId })).toMatchObject({ status: "failure", code: "invalid-response" });
});

test("malformed replies cannot become successful document results", async () => {
  for (const reply of [
    null, { status: "success", text: "data" },
    { status: "success", text: "data", durationMs: -1 },
    { status: "success", text: "data", durationMs: Number.NaN },
    { status: "success", text: "data", durationMs: Infinity },
    { status: "success", text: "data", durationMs: 0, path: "/private/secret" },
    { status: "success", text: "\ud800", durationMs: 0 },
    { status: "failure", stage: "storage", code: "unknown", message: "data", durationMs: 0 },
  ]) {
    const access = new DesktopDocumentAccess(async () => reply, () => true);
    expect(await access.readDocumentSnapshot({ snapshotId })).toMatchObject({ status: "failure", code: "invalid-response" });
  }
  const access = new DesktopDocumentAccess(async () => ({ status: "success", snapshotId: "document-1", durationMs: 0 }), () => true);
  expect(await access.createDocumentSnapshot({ text: "data" })).toMatchObject({ status: "failure", code: "invalid-response" });
});

test("native and transport errors retain useful codes without exposing raw paths", async () => {
  const native = new DesktopDocumentAccess(async () => ({
    status: "failure", stage: "cleanup", code: "cleanup-failed", message: "Cannot remove /private/secret", durationMs: 7,
  }), () => true);
  const failed = await native.createDocumentSnapshot({ text: "data" });
  expect(failed).toMatchObject({ status: "failure", stage: "cleanup", code: "cleanup-failed", durationMs: 7 });
  expect(JSON.stringify(failed)).not.toContain("/private");
  const unavailable = new DesktopDocumentAccess(async () => { throw new Error("Cannot write /private/secret"); }, () => true);
  const result = await unavailable.exportDocument({ path: "/saved.choom.yaml", text: "data", overwrite: false });
  expect(result).toMatchObject({ status: "failure", stage: "export", code: "unavailable" });
  expect(JSON.stringify(result)).not.toContain("/private");
});
