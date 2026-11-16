import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import type { SelectedBaseline } from "../../../src/architecture/load-workflow.ts";
import { pending } from "../../support/baseline-workflow-fixtures.ts";
import { discoveryResultText, discoveryWorkflow } from "../../support/discovery-workflow-fixtures.ts";
import { duplicationBaselineText, selectedText } from "../../support/duplication-workflow-fixtures.ts";

type Read = Awaited<ReturnType<SelectedBaseline["read"]>>;

test("a matching discovery result attaches beside a duplication report without replacing the baseline view", async () => {
  const { workflow } = discoveryWorkflow();
  await workflow.openBaseline();
  await workflow.openDuplicationReport();
  const { current, duplication } = workflow.getSnapshot();
  expect(await workflow.openDiscoveryResult()).toMatchObject({ status: "success" });
  const snapshot = workflow.getSnapshot();
  expect(snapshot.discovery?.result.questions.map(({ id }) => id)).toEqual(["s3-001-question-001", "s4-001-question-001"]);
  expect(snapshot.current).toBe(current);
  expect(snapshot.duplication).toBe(duplication);
  expect(snapshot.state).toMatchObject({ operation: "discovery", phase: "idle", lastOutcome: { status: "success" } });
});

test("a discovery result needs an open saved baseline, so the built-in example cannot have one", async () => {
  const { workflow } = discoveryWorkflow();
  expect(await workflow.openDiscoveryResult()).toMatchObject({ status: "failure", stage: "selection", code: "no-baseline",
    message: "Open a saved baseline before opening a discovery result." });
  expect(workflow.getSnapshot()).toMatchObject({ current: null, discovery: null });
});

test("a refused or failed replacement keeps the open baseline and both attachments", async () => {
  const { workflow, dependencies } = discoveryWorkflow();
  await workflow.openBaseline(); await workflow.openDuplicationReport(); await workflow.openDiscoveryResult();
  const previous = workflow.getSnapshot();
  for (const text of [discoveryResultText((result) => { result.baselineDigest = "0".repeat(64); }), "invalid: [yaml"]) {
    dependencies.selectDiscoveryResult = async () => selectedText(text);
    expect(await workflow.openDiscoveryResult()).toMatchObject({ status: "failure", stage: "validation" });
    expect(workflow.getSnapshot()).toMatchObject({ current: previous.current, duplication: previous.duplication, discovery: previous.discovery });
  }
  dependencies.selectDiscoveryResult = async () => ({ read: async () => ({
    status: "failure", stage: "storage", code: "io-error", message: "The selected discovery result is no longer readable.", durationMs: 0 }) });
  expect(await workflow.openDiscoveryResult()).toMatchObject({ status: "failure", stage: "reading", code: "io-error" });
  expect(workflow.getSnapshot().discovery).toBe(previous.discovery);
});

test("Retry rereads the selected discovery result without another picker or a baseline load", async () => {
  const { workflow, dependencies } = discoveryWorkflow();
  let selections = 0;
  let text = "kind: architecture-discovery\nformatVersion: 1";
  dependencies.selectDiscoveryResult = async () => {
    selections += 1;
    return { read: (signal) => selectedText(text).read(signal) };
  };
  await workflow.openBaseline();
  const current = workflow.getSnapshot().current;
  expect(await workflow.openDiscoveryResult()).toMatchObject({ status: "failure", code: "unsupported-version" });
  text = discoveryResultText();
  expect(await workflow.retry()).toMatchObject({ status: "success" });
  expect(selections).toBe(1);
  expect(workflow.getSnapshot().current).toBe(current);
  expect(workflow.getSnapshot().discovery).not.toBeNull();
});

test("one load runs at a time, and a late result cannot attach to a replacement baseline with the same IDs", async () => {
  const { workflow, dependencies } = discoveryWorkflow();
  await workflow.openBaseline(); await workflow.openDiscoveryResult();
  const started = pending<void>();
  const reading = pending<Read>();
  dependencies.selectDiscoveryResult = async () => ({ read: () => { started.resolve(); return reading.promise; } });
  const opening = workflow.openDiscoveryResult(); await started.promise;
  expect(await workflow.openBaseline()).toMatchObject({ status: "busy" });
  expect(await workflow.openDuplicationReport()).toMatchObject({ status: "busy" });
  expect(await workflow.cancel()).toMatchObject({ status: "cancelled" });
  expect(await opening).toMatchObject({ status: "cancelled" });
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  const current = workflow.getSnapshot().current;
  reading.resolve(await selectedText(discoveryResultText()).read(new AbortController().signal));
  await Promise.resolve();
  expect(workflow.getSnapshot()).toMatchObject({ current, discovery: null });
});

test("a failed baseline open keeps the discovery result, and reopening the same saved baseline removes it", async () => {
  const { workflow, dependencies } = discoveryWorkflow();
  await workflow.openBaseline(); await workflow.openDiscoveryResult();
  const attachment = workflow.getSnapshot().discovery;
  dependencies.selectBaseline = async () => selectedText("invalid baseline");
  expect(await workflow.openBaseline()).toMatchObject({ status: "failure" });
  expect(workflow.getSnapshot().discovery).toBe(attachment);
  dependencies.selectBaseline = async () => selectedText(duplicationBaselineText);
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().discovery).toBeNull();
});

test("the attachment is a frozen copy, and a valid replacement creates a new attachment", async () => {
  const { workflow } = discoveryWorkflow();
  await workflow.openBaseline(); await workflow.openDiscoveryResult();
  const previous = workflow.getSnapshot().discovery;
  await workflow.openDiscoveryResult();
  const next = workflow.getSnapshot().discovery;
  expect(next).not.toBe(previous);
  expect(Object.isFrozen(next?.result.gaps[0]?.subjectRefs)).toBe(true);
});

test("Remove discovery result removes only the discovery result and ignores a pending load", async () => {
  const { workflow, dependencies } = discoveryWorkflow();
  await workflow.openBaseline(); await workflow.openDuplicationReport(); await workflow.openDiscoveryResult();
  const { current, duplication } = workflow.getSnapshot();
  const started = pending<void>();
  const reading = pending<Read>();
  dependencies.selectDiscoveryResult = async () => ({ read: () => { started.resolve(); return reading.promise; } });
  const opening = workflow.openDiscoveryResult(); await started.promise;
  expect(await workflow.removeDiscoveryResult()).toMatchObject({ status: "success" });
  expect(await opening).toMatchObject({ status: "cancelled" });
  reading.resolve(await selectedText(discoveryResultText()).read(new AbortController().signal));
  await Promise.resolve();
  expect(workflow.getSnapshot()).toMatchObject({ current, duplication, discovery: null });
  expect(await workflow.retry()).toMatchObject({ status: "failure", code: "no-previous-load" });
});

test("Remove report keeps the discovery result", async () => {
  const { workflow } = discoveryWorkflow();
  await workflow.openBaseline(); await workflow.openDuplicationReport(); await workflow.openDiscoveryResult();
  const discovery = workflow.getSnapshot().discovery;
  assert.ok(discovery);
  expect(await workflow.removeDuplicationReport()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot()).toMatchObject({ duplication: null, discovery });
});

test("cancellation keeps the load slot until an outstanding native picker closes", async () => {
  const { workflow, dependencies } = discoveryWorkflow();
  await workflow.openBaseline();
  const selection = pending<SelectedBaseline | null>();
  dependencies.selectDiscoveryResult = () => selection.promise;
  const opening = workflow.openDiscoveryResult();
  const cancelled = workflow.cancel();
  expect(await workflow.openBaseline()).toMatchObject({ status: "busy" });
  selection.resolve(selectedText(discoveryResultText()));
  expect(await opening).toMatchObject({ status: "cancelled" }); await cancelled;
  expect(workflow.getSnapshot().discovery).toBeNull();
});
