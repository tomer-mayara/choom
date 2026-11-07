import { expect, test } from "bun:test";
import { DepCruiserReportConverter } from "../../../../src/architecture/dependency-cruiser/converter.ts";
import { DesktopDepCruiserRunner } from "../../../../src/architecture/dependency-cruiser/runner.ts";
import { DepCruiserArchitecturalLayer } from "../../../../src/architecture/dependency-cruiser/architectural-layer.ts";
import type { AnalysisProgress } from "../../../../src/domain/generated/contracts.ts";
import { converterFixture } from "../../../support/converter-fixtures.ts";
import { deferred, NativeAnalyzerDouble, nativeFailure } from "../../../support/execution-fixtures.ts";

function scenario() {
  const fixture = converterFixture();
  const native = new NativeAnalyzerDouble(fixture.input.completed.json);
  const abort = new AbortController();
  const progress: AnalysisProgress[] = [];
  const control = { signal: abort.signal, onProgress: (event: AnalysisProgress) => { progress.push(event); } };
  const layer = new DepCruiserArchitecturalLayer(new DesktopDepCruiserRunner(native), new DepCruiserReportConverter(fixture.repository));
  return { fixture, native, abort, progress, control, layer };
}

test("a fresh completed analysis converts and releases its native job while borrowing the session", async () => {
  const { fixture, native, control, layer, progress } = scenario();
  const result = await layer.analyze(fixture.input.request, control);
  expect(result.status).toBe("success");
  expect(native.released).toBe(true);
  expect(fixture.repository.activeSessions.has("repository-1")).toBe(true);
  expect(progress.map(({ stage }) => stage)).toEqual(expect.arrayContaining(["setup", "analysis", "conversion", "validation"]));
  expect(progress.every(({ elapsedMs }, index) => elapsedMs !== undefined && elapsedMs >= (progress[index - 1]?.elapsedMs ?? 0))).toBe(true);
  if (result.status === "success") expect(result.document.relationships[0]).toMatchObject({ source: "src", target: "packages/core" });
});

test("an abort before preparation starts no native job", async () => {
  const { fixture, native, control, layer, abort } = scenario();
  abort.abort();
  expect(await layer.analyze(fixture.input.request, control)).toEqual({ status: "cancelled" });
  expect(native.preparations).toHaveLength(0);
});

test("cancellation while preparing stops the acknowledged job without executing it", async () => {
  const { fixture, native, control, layer, abort } = scenario();
  native.prepareGate = deferred();
  const result = layer.analyze(fixture.input.request, control);
  await native.prepared.promise;
  abort.abort();
  native.prepareGate.resolve({ status: "success", value: { jobId: "analysis-1" } });
  expect(await result).toEqual({ status: "cancelled" });
  expect(native.runCalls).toBe(0);
  expect(native.cancelCalls).toBe(1);
  expect(native.clean && native.released).toBe(true);
});

test("cancellation waits for cleanup and release instead of racing a native promise", async () => {
  const { fixture, native, control, layer, abort } = scenario();
  native.runGate = deferred();
  native.cancelGate = deferred();
  native.releaseGate = deferred();
  let settled = false;
  const result = layer.analyze(fixture.input.request, control).then((value) => { settled = true; return value; });
  await native.started.promise;
  abort.abort();
  await native.cancelStarted.promise;
  expect(settled).toBe(false);
  native.cancelGate.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  native.releaseGate.resolve();
  expect(await result).toEqual({ status: "cancelled" });
  expect(native.clean && native.released).toBe(true);
});

test("cleanup failure stays a failure when cancellation was requested", async () => {
  const { fixture, native, control, layer, abort } = scenario();
  native.runGate = deferred();
  native.cancelResult = nativeFailure("cleanup-failed");
  native.releaseResult = nativeFailure("cleanup-failed");
  const result = layer.analyze(fixture.input.request, control);
  await native.started.promise;
  abort.abort();
  expect(await result).toMatchObject({ status: "failure", stage: "cleanup", code: "execution-failed" });
});

test("progress observers cannot abandon an active native job", async () => {
  const { fixture, native, layer, abort } = scenario();
  const result = await layer.analyze(fixture.input.request, { signal: abort.signal, onProgress: () => { throw new Error("private observer failure"); } });
  expect(result.status).toBe("success");
  expect(native.clean && native.released).toBe(true);
});

test("a synchronous cancellation transport failure still releases the prepared job", async () => {
  const { fixture, native, control, layer, abort } = scenario();
  native.prepareGate = deferred();
  native.cancelDepCruiser = () => { throw new Error("private cancellation transport error"); };
  const pending = layer.analyze(fixture.input.request, control);
  await native.prepared.promise;
  abort.abort();
  native.prepareGate.resolve({ status: "success", value: { jobId: "analysis-1" } });
  const result = await pending;
  expect(result).toMatchObject({ status: "failure", stage: "cleanup", code: "execution-failed" });
  expect(native.released).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private");
});

test("release failure prevents a completed run from becoming a document", async () => {
  const { fixture, native, layer, control } = scenario();
  native.releaseResult = nativeFailure("cleanup-failed");
  expect(await layer.analyze(fixture.input.request, control)).toMatchObject({ status: "failure", stage: "cleanup", code: "execution-failed" });
});

test("conversion cancellation and final validation cancellation both suppress the document", async () => {
  for (const phase of ["conversion", "validation"] as const) {
    const { fixture, native, control, abort } = scenario();
    const started = deferred<void>();
    const gate = deferred<void>();
    const converter = new DepCruiserReportConverter(fixture.repository);
    const layer = new DepCruiserArchitecturalLayer(new DesktopDepCruiserRunner(native), {
      convert: async (input) => { started.resolve(); if (phase === "conversion") await gate.promise; return converter.convert(input); },
    });
    const pending = layer.analyze(fixture.input.request, { ...control, onProgress: (event) => {
      control.onProgress(event);
      if (phase === "validation" && event.stage === "validation") abort.abort();
    } });
    await started.promise;
    expect(native.released).toBe(true);
    if (phase === "conversion") { abort.abort(); gate.resolve(); }
    expect(await pending).toEqual({ status: "cancelled" });
  }
});

test("exceptions while running still release the job and do not expose raw errors", async () => {
  const { fixture, native, layer, control } = scenario();
  native.runDepCruiser = () => { throw new Error("private /Users/tom/source.ts"); };
  const result = await layer.analyze(fixture.input.request, control);
  expect(result).toMatchObject({ status: "failure", stage: "analysis", code: "execution-failed" });
  expect(native.released).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private");
});

test.each([
  ["invalid-request", "invalid-request"], ["invalid-session", "unavailable"], ["invalid-job", "execution-failed"],
  ["busy", "unavailable"], ["node-not-found", "unavailable"], ["unsupported-node", "unsupported"],
  ["analyzer-not-found", "unavailable"], ["unsupported-analyzer", "unsupported"], ["unsupported-config-path", "unsupported"],
  ["source-changed", "source-changed"], ["execution-failed", "execution-failed"], ["timed-out", "execution-failed"],
  ["output-limit", "limit-exceeded"], ["report-missing", "execution-failed"], ["report-invalid", "invalid-observations"],
  ["cleanup-failed", "execution-failed"], ["unavailable", "unavailable"], ["invalid-response", "invalid-observations"],
] as const)("native %s maps to a neutral %s failure without invoking conversion", async (code, expectedCode) => {
  const { fixture, native, control } = scenario();
  native.result = nativeFailure(code);
  let converted = false;
  const layer = new DepCruiserArchitecturalLayer(new DesktopDepCruiserRunner(native), {
    convert: async () => { converted = true; throw new Error("No failed report may be converted."); },
  });
  expect(await layer.analyze(fixture.input.request, control)).toMatchObject({ status: "failure", code: expectedCode });
  expect(converted).toBe(false);
  expect(native.released).toBe(true);
});

test("cancellation during release waits for it and suppresses completion", async () => {
  const { fixture, native, control, layer, abort } = scenario();
  const releasing = deferred<void>();
  const gate = deferred<void>();
  native.releaseDepCruiser = async () => { releasing.resolve(); await gate.promise; native.released = true; return { status: "success", released: true }; };
  let settled = false;
  const pending = layer.analyze(fixture.input.request, control).then((result) => { settled = true; return result; });
  await releasing.promise;
  abort.abort();
  await native.cancelStarted.promise;
  expect(settled).toBe(false);
  gate.resolve();
  expect(await pending).toEqual({ status: "cancelled" });
});

test("invalid declarations and unsupported enforcers fail before executing the analyzer", async () => {
  const { fixture, native, control, layer } = scenario();
  fixture.input.request.components.push({ id: "src", name: "duplicate" });
  expect(await layer.analyze(fixture.input.request, control)).toMatchObject({ status: "failure", code: "invalid-request" });
  fixture.input.request.components.pop();
  fixture.input.request.analysis.enforcer = "different-analyzer";
  expect(await layer.analyze(fixture.input.request, control)).toMatchObject({ status: "failure", code: "unsupported" });
  expect(native.preparations).toHaveLength(0);
});

test("unusable declaration text is rejected before a native job is prepared", async () => {
  for (const declaration of [
    { id: ".", name: " " },
    { id: ".", name: "a".repeat(1025) },
    { id: ".", name: "private\nname" },
    { id: "a".repeat(4097), name: "long path", parent: "." },
  ]) {
    const { fixture, native, control, layer } = scenario();
    fixture.input.request.components = declaration.id === "." ? [declaration] : [{ id: ".", name: "Root" }, declaration];
    expect(await layer.analyze(fixture.input.request, control)).toMatchObject({ status: "failure", stage: "setup", code: "invalid-request" });
    expect(native.preparations).toHaveLength(0);
  }
});
