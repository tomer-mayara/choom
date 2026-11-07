import { expect, test } from "bun:test";
import { DesktopAnalyzerAccess } from "../../../src/platform/analyzer.ts";

const request = { repositorySession: "repository-1", config: ".dependency-cruiser.cjs", inputs: ["src"] };

test("browser analysis is unavailable and never calls native transport", async () => {
  let calls = 0;
  const access = new DesktopAnalyzerAccess(async () => { calls += 1; }, () => false);
  expect(await access.prepareDepCruiser(request)).toMatchObject({ status: "failure", code: "unavailable", stage: "setup" });
  expect(calls).toBe(0);
});

test("invalid execution requests are rejected before transport", async () => {
  let calls = 0;
  const access = new DesktopAnalyzerAccess(async () => { calls += 1; }, () => true);
  for (const input of [{ ...request, inputs: [] }, { ...request, inputs: ["src/(glob).ts"] }, { ...request, config: "../rules.cjs" }, { ...request, nodeExecutable: "node" }, { ...request, command: "arbitrary" }]) {
    expect(await access.prepareDepCruiser(input)).toMatchObject({ status: "failure", code: "invalid-request" });
  }
  expect(await access.runDepCruiser({ jobId: "analysis-0" })).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(calls).toBe(0);
});

test("validated product commands preserve their envelopes and native result data", async () => {
  const commands: Array<{ command: string; request: unknown }> = [];
  const progress: unknown[] = [];
  const completed = { status: "completed", reportJson: "{}", version: "18.7.2", workingDirectory: ".", completedAtMs: 0, durationMs: 2 } as const;
  let receive: (message: unknown) => void = () => {};
  const access = new DesktopAnalyzerAccess(async (command, args) => {
    commands.push({ command, request: args.request });
    switch (command) {
      case "depcruiser_prepare": return { status: "success", value: { jobId: "analysis-1" } };
      case "depcruiser_run": receive({ jobId: "analysis-1", stage: "analysis", elapsedMs: 1 }); return completed;
      case "depcruiser_cancel": return { status: "success", stopped: true };
      case "depcruiser_release": return { status: "success", released: true };
      default: throw new Error("Unexpected product operation.");
    }
  }, () => true, (listener) => { receive = listener; return { channel: "test" }; });
  expect(await access.prepareDepCruiser({ ...request, nodeExecutable: "/runtime/node" })).toEqual({ status: "success", value: { jobId: "analysis-1" } });
  expect(await access.runDepCruiser({ jobId: "analysis-1" }, (event) => { progress.push(event); })).toEqual(completed);
  expect(await access.cancelDepCruiser({ jobId: "analysis-1" })).toEqual({ status: "success", stopped: true });
  expect(await access.releaseDepCruiser({ jobId: "analysis-1" })).toEqual({ status: "success", released: true });
  expect(commands.map(({ command }) => command)).toEqual(["depcruiser_prepare", "depcruiser_run", "depcruiser_cancel", "depcruiser_release"]);
  expect(commands[0]?.request).toEqual({ ...request, nodeExecutable: "/runtime/node" });
  expect(progress).toEqual([{ jobId: "analysis-1", stage: "analysis", elapsedMs: 1 }]);
  receive({ jobId: "analysis-1", stage: "cleanup", elapsedMs: 2 });
  expect(progress).toHaveLength(1);
});

test("malformed completion data cannot cross the native boundary", async () => {
  const complete = { status: "completed", reportJson: "{}", version: "18.7.2", workingDirectory: ".", completedAtMs: 0, durationMs: 2 };
  for (const result of [null, { ...complete, version: "18.8.0" }, { ...complete, workingDirectory: "/private/repo" },
    { ...complete, completedAtMs: 253_402_300_800_000 }, { ...complete, durationMs: -1 }, { ...complete, extra: "private" },
    { ...complete, reportJson: "" }, { status: "failure", stage: "analysis", code: "unexpected", message: "private", durationMs: 0 }]) {
    const access = new DesktopAnalyzerAccess(async () => result, () => true, () => ({}));
    expect(await access.runDepCruiser({ jobId: "analysis-1" })).toMatchObject({ status: "failure", code: "invalid-response" });
  }
});

test("progress data must match its job and remain monotonic", async () => {
  for (const progress of [
    { jobId: "analysis-2", stage: "analysis", elapsedMs: 2 },
    { jobId: "analysis-1", stage: "analysis", elapsedMs: -1 },
    { jobId: "analysis-1", stage: "analysis", elapsedMs: 0 },
    { jobId: "analysis-1", stage: "stderr", elapsedMs: 2 },
    { jobId: "analysis-1", stage: "analysis", elapsedMs: 2, text: "private" },
  ]) {
    let receive: (message: unknown) => void = () => {};
    const access = new DesktopAnalyzerAccess(async () => {
      receive({ jobId: "analysis-1", stage: "setup", elapsedMs: 1 });
      receive(progress);
      return { status: "cancelled", durationMs: 3 };
    }, () => true, (listener) => { receive = listener; return {}; });
    expect(await access.runDepCruiser({ jobId: "analysis-1" })).toMatchObject({ status: "failure", code: "invalid-response" });
  }
});

test("observer and transport errors cannot expose raw errors or bypass terminal results", async () => {
  let receive: (message: unknown) => void = () => {};
  const access = new DesktopAnalyzerAccess(async () => {
    receive({ jobId: "analysis-1", stage: "analysis", elapsedMs: 2 });
    return { status: "cancelled", durationMs: 3 };
  }, () => true, (listener) => { receive = listener; return {}; });
  expect(await access.runDepCruiser({ jobId: "analysis-1" }, () => { throw new Error("private observer details"); })).toEqual({ status: "cancelled", durationMs: 3 });
  const broken = new DesktopAnalyzerAccess(async () => { throw new Error("private /Users/tom/source.ts"); }, () => true, () => ({}));
  const result = await broken.runDepCruiser({ jobId: "analysis-1" });
  expect(result).toMatchObject({ status: "failure", code: "unavailable" });
  expect(JSON.stringify(result)).not.toContain("private");
});

test("UTF-8 report bytes are bounded independently of string length", async () => {
  const complete = { status: "completed", reportJson: "é".repeat(8 * 1024 * 1024), version: "18.7.2", workingDirectory: ".", completedAtMs: 0, durationMs: 1 };
  const access = new DesktopAnalyzerAccess(async () => complete, () => true, () => ({}));
  expect((await access.runDepCruiser({ jobId: "analysis-1" })).status).toBe("completed");
  complete.reportJson += "é";
  expect(await access.runDepCruiser({ jobId: "analysis-1" })).toMatchObject({ status: "failure", code: "invalid-response" });
});
