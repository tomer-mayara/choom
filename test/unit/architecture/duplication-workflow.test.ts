import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { duplicationBaselineText, duplicationReportText, duplicationWorkflow, selectedText } from "../../support/duplication-workflow-fixtures.ts";
import { pending } from "../../support/baseline-workflow-fixtures.ts";
import type { SelectedBaseline } from "../../../src/architecture/load-workflow.ts";

test("a matching report attaches without replacing the committed baseline and layout", async () => {
  const { workflow } = duplicationWorkflow();
  await workflow.openBaseline();
  const current = workflow.getSnapshot().current;
  expect(await workflow.openDuplicationReport()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot()).toMatchObject({ duplication: { report: { id: "illustrative-duplication-review" } } });
  expect(workflow.getSnapshot().current).toBe(current);
});

test("a report cannot open until a saved baseline is current", async () => {
  const { workflow } = duplicationWorkflow();
  expect(await workflow.openDuplicationReport()).toMatchObject({ status: "failure", code: "no-baseline" });
  expect(workflow.getSnapshot().current).toBeNull();
});

test("the current baseline retains the digest returned by its bounded byte reader", async () => {
  const { workflow } = duplicationWorkflow();
  await workflow.openBaseline();
  expect(workflow.getSnapshot().current?.sha256).toBe("da2c0800e21354f5e161ee0eeeff3fb418a50b6b4d36e546272cc2e2333bfe32");
});

test("an invalid report replacement retains the attachment and its session", async () => {
  const { workflow, dependencies } = duplicationWorkflow();
  await workflow.openBaseline(); await workflow.openDuplicationReport();
  const previous = workflow.getSnapshot();
  assert.ok(previous.current);
  const digest = previous.current.sha256;
  dependencies.selectDuplicationReport = async () => selectedText(duplicationReportText.replace(digest, "0".repeat(64)));
  expect(await workflow.openDuplicationReport()).toMatchObject({ status: "failure", code: "baseline-mismatch" });
  expect(workflow.getSnapshot().current).toBe(previous.current);
  expect(workflow.getSnapshot().duplication).toBe(previous.duplication);
  expect(workflow.getSnapshot().state.operation).toBe("report");
});

test("report Retry rereads its selected file without opening the baseline or another picker", async () => {
  const { workflow, dependencies } = duplicationWorkflow();
  let selections = 0;
  let text = "invalid report";
  dependencies.selectDuplicationReport = async () => {
    selections += 1;
    return { read: (signal) => selectedText(text).read(signal) };
  };
  await workflow.openBaseline();
  const current = workflow.getSnapshot().current;
  expect(await workflow.openDuplicationReport()).toMatchObject({ status: "failure" });
  text = duplicationReportText;
  expect(await workflow.retry()).toMatchObject({ status: "success" });
  expect(selections).toBe(1);
  expect(workflow.getSnapshot().current).toBe(current);
});

test("a cancelled report read cannot attach to a replacement baseline with the same IDs", async () => {
  const { workflow, dependencies } = duplicationWorkflow();
  await workflow.openBaseline(); await workflow.openDuplicationReport();
  const started = pending<void>();
  const reading = pending<Awaited<ReturnType<SelectedBaseline["read"]>>>();
  dependencies.selectDuplicationReport = async () => ({ read: () => { started.resolve(); return reading.promise; } });
  const opening = workflow.openDuplicationReport(); await started.promise;
  expect(await workflow.openBaseline()).toMatchObject({ status: "busy" });
  expect(await workflow.cancel()).toMatchObject({ status: "cancelled" });
  expect(await opening).toMatchObject({ status: "cancelled" });
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  const current = workflow.getSnapshot().current;
  reading.resolve(await selectedText(duplicationReportText).read(new AbortController().signal));
  await Promise.resolve();
  expect(workflow.getSnapshot().current).toBe(current);
  expect(workflow.getSnapshot().duplication).toBeNull();
});

test("failed baseline opening retains a report, while reopening the same saved baseline clears it", async () => {
  const { workflow, dependencies } = duplicationWorkflow();
  await workflow.openBaseline(); await workflow.openDuplicationReport();
  const attachment = workflow.getSnapshot().duplication;
  dependencies.selectBaseline = async () => selectedText("invalid baseline");
  expect(await workflow.openBaseline()).toMatchObject({ status: "failure" });
  expect(workflow.getSnapshot().duplication).toBe(attachment);
  dependencies.selectBaseline = async () => selectedText(duplicationBaselineText);
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().duplication).toBeNull();
});

test("valid report replacement creates an immutable attachment and a fresh session", async () => {
  const { workflow } = duplicationWorkflow();
  await workflow.openBaseline(); await workflow.openDuplicationReport();
  const previous = workflow.getSnapshot().duplication;
  await workflow.openDuplicationReport();
  const next = workflow.getSnapshot().duplication;
  expect(next?.session).not.toBe(previous?.session);
  expect(Object.isFrozen(next?.report.findings[0]?.observations[0]?.endpoints)).toBe(true);
  expect(previous?.report.id).toBe("illustrative-duplication-review");
});

test("removing a report clears it immediately and rejects a pending attachment", async () => {
  const { workflow, dependencies } = duplicationWorkflow();
  await workflow.openBaseline(); await workflow.openDuplicationReport();
  const current = workflow.getSnapshot().current;
  const started = pending<void>();
  const reading = pending<Awaited<ReturnType<SelectedBaseline["read"]>>>();
  dependencies.selectDuplicationReport = async () => ({ read: () => { started.resolve(); return reading.promise; } });
  const opening = workflow.openDuplicationReport(); await started.promise;
  expect(await workflow.removeDuplicationReport()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().duplication).toBeNull();
  expect(await opening).toMatchObject({ status: "cancelled" });
  reading.resolve(await selectedText(duplicationReportText).read(new AbortController().signal));
  await Promise.resolve();
  expect(workflow.getSnapshot().duplication).toBeNull();
  expect(workflow.getSnapshot().current).toBe(current);
  expect(await workflow.retry()).toMatchObject({ status: "failure", code: "no-previous-load" });
});

test("report cancellation keeps the load slot until an outstanding native picker closes", async () => {
  const { workflow, dependencies } = duplicationWorkflow();
  await workflow.openBaseline();
  const selection = pending<SelectedBaseline | null>();
  dependencies.selectDuplicationReport = () => selection.promise;
  const opening = workflow.openDuplicationReport();
  const cancelled = workflow.cancel();
  expect(await workflow.openBaseline()).toMatchObject({ status: "busy" });
  selection.resolve(selectedText(duplicationReportText));
  expect(await opening).toMatchObject({ status: "cancelled" }); await cancelled;
  expect(workflow.getSnapshot().duplication).toBeNull();
});
