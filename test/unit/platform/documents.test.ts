import { expect, test } from "bun:test";
import { DesktopDocumentAccess } from "../../../src/platform/documents.ts";

test("browser file access is unavailable without native calls", async () => {
  let calls = 0;
  const access = new DesktopDocumentAccess(async () => { calls += 1; }, () => false);
  expect(await access.readDocumentFile({ path: "/baseline.yaml" })).toMatchObject({ status: "failure", code: "unavailable" });
  expect(calls).toBe(0);
});

test("selected-file reads use validated envelopes and preserve successful data", async () => {
  const requests: unknown[] = [];
  const access = new DesktopDocumentAccess(async (command, args) => {
    requests.push({ command, args });
    return { status: "success", text: "saved 中文", durationMs: 4 };
  }, () => true);
  expect(await access.readDocumentFile({ path: "/saved baseline.choom.yaml" })).toEqual({ status: "success", text: "saved 中文", durationMs: 4 });
  expect(requests).toEqual([{ command: "document_file_read", args: { request: { path: "/saved baseline.choom.yaml" } } }]);
});

test("invalid paths, Unicode, and extra fields never reach native file access", async () => {
  let calls = 0;
  const access = new DesktopDocumentAccess(async () => { calls += 1; }, () => true);
  for (const request of [
    { path: "relative.yaml" }, { path: "/valid", extra: true },
    { path: `/${"中".repeat(1366)}` }, { path: "/hidden\nfile" }, { path: "/broken\ud800" },
  ]) expect(await access.readDocumentFile(request)).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(calls).toBe(0);
});

test("malformed or oversized responses cannot become successful reads", async () => {
  for (const reply of [
    null, { status: "success", text: "data" },
    { status: "success", text: "data", durationMs: -1 },
    { status: "success", text: "data", durationMs: Number.NaN },
    { status: "success", text: "data", durationMs: Infinity },
    { status: "success", text: "data", durationMs: 0, path: "/private/secret" },
    { status: "success", text: "\ud800", durationMs: 0 },
    { status: "success", text: "é".repeat(8 * 1024 * 1024 + 1), durationMs: 0 },
    { status: "failure", stage: "storage", code: "unknown", message: "data", durationMs: 0 },
  ]) {
    const access = new DesktopDocumentAccess(async () => reply, () => true);
    expect(await access.readDocumentFile({ path: "/baseline.yaml" })).toMatchObject({ status: "failure", code: "invalid-response" });
  }
});

test.each(["not-found", "not-file", "source-changed", "limit-exceeded", "invalid-utf8"] as const)("native %s retains a safe useful error", async (code) => {
  const native = new DesktopDocumentAccess(async () => ({
    status: "failure", stage: "storage", code, message: "Cannot read /private/secret", durationMs: 7,
  }), () => true);
  const failed = await native.readDocumentFile({ path: "/baseline.yaml" });
  expect(failed).toMatchObject({ status: "failure", stage: "storage", code, durationMs: 7 });
  expect(JSON.stringify(failed)).not.toContain("/private");
});

test("transport exceptions become a safe unavailable error", async () => {
  const access = new DesktopDocumentAccess(async () => { throw new Error("Cannot read /private/secret"); }, () => true);
  const result = await access.readDocumentFile({ path: "/baseline.yaml" });
  expect(result).toMatchObject({ status: "failure", code: "unavailable" });
  expect(JSON.stringify(result)).not.toContain("/private");
});
