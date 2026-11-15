import { expect, test } from "bun:test";
import { duplicationWorkflow, selectedText } from "../../support/duplication-workflow-fixtures.ts";
import { duplicationV4Fixture } from "../../support/duplication-v4-fixtures.ts";

test("a version 4 report attaches to its exact loaded baseline without replacing the view", async () => {
  const { baselineText, report } = duplicationV4Fixture();
  const { workflow, dependencies } = duplicationWorkflow();
  dependencies.selectBaseline = async () => selectedText(baselineText);
  dependencies.selectDuplicationReport = async () => selectedText(JSON.stringify(report));
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  const current = workflow.getSnapshot().current;
  expect(await workflow.openDuplicationReport()).toMatchObject({ status: "success" });
  const snapshot = workflow.getSnapshot();
  expect(snapshot.current).toBe(current);
  expect(snapshot.duplication?.report).toEqual(report);
});

test("a wrong version or digest cannot replace an attached version 4 report", async () => {
  const { baselineText, report } = duplicationV4Fixture();
  const { workflow, dependencies } = duplicationWorkflow();
  dependencies.selectBaseline = async () => selectedText(baselineText);
  dependencies.selectDuplicationReport = async () => selectedText(JSON.stringify(report));
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  expect(await workflow.openDuplicationReport()).toMatchObject({ status: "success" });
  const attached = workflow.getSnapshot().duplication;
  for (const baseline of [
    { ...report.baseline, formatVersion: 3 },
    { ...report.baseline, sha256: "0".repeat(64) },
  ]) {
    dependencies.selectDuplicationReport = async () => selectedText(JSON.stringify({ ...report, baseline }));
    expect(await workflow.openDuplicationReport()).toMatchObject({ status: "failure", code: "baseline-mismatch" });
    expect(workflow.getSnapshot().duplication).toBe(attached);
  }
});
