import { expect, test } from "bun:test";
import { boundaryBytes, boundaryFixture } from "../../support/boundary-baseline.ts";
import type { SelectedBaseline } from "../../../src/architecture/load-workflow.ts";
import { pending, selectedBaselineText } from "../../support/baseline-workflow-fixtures.ts";
import { duplicationV3Fixture } from "../../support/interface-duplication-fixtures.ts";
import { comparisonWorkflow } from "../../support/comparison-workflow.ts";

test("opens the original byte identities in reader-selected order and closes only the comparison", async () => {
  const { workflow, dependencies } = comparisonWorkflow();
  await workflow.openBaseline();
  const after = workflow.getSnapshot().current;
  const result = await workflow.openComparison();
  expect(result.status).toBe("success");
  const { comparison } = workflow.getSnapshot();
  expect(comparison?.result.findings.some(finding => finding.change === "New violation")).toBe(true);
  expect(Object.isFrozen(comparison?.before.baseline.components)).toBe(true);
  expect(comparison?.before.sha256).not.toBe(after?.sha256);
  dependencies.selectEarlierBaseline = dependencies.selectBaseline;
  await workflow.openComparison();
  expect(workflow.getSnapshot().comparison?.result.status).toBe("identical");
  await workflow.closeComparison();
  expect(workflow.getSnapshot().current).toBe(after);
  expect(workflow.getSnapshot().comparison).toBeNull();
});

test("validates the full Before and keeps the pair across failed selection, replacement and retry", async () => {
  const { workflow, dependencies } = comparisonWorkflow();
  await workflow.openBaseline();
  await workflow.openComparison();
  const previous = workflow.getSnapshot();
  const missing = boundaryFixture("before");
  Reflect.deleteProperty(missing.boundaryReview.identity, "projectKey");
  const mismatch = boundaryFixture("before");
  mismatch.boundaryReview.identity.projectKey = "Unrelated";
  const large = boundaryFixture("before");
  const component = large.components[0];
  if (!component) throw new Error("Invalid fixture");
  large.components.push(...Array.from({ length: 500 }, (_, i) => ({ ...component, id: "component-" + i })));
  for (const [text, code] of [
    ["invalid: [", "invalid-encoding"], [JSON.stringify(missing), "invalid-document"],
    [JSON.stringify(mismatch), "project-mismatch"], [JSON.stringify(large), "display-limit"],
    [JSON.stringify({ formatVersion: 4, id: "old", parentId: null, components: [], interfaces: [], rules: [], resources: [] }), "incompatible-format"],
    ["x".repeat(16 * 1024 * 1024 + 1), "limit-exceeded"],
  ]) {
    dependencies.selectEarlierBaseline = async () => selectedBaselineText(text ?? "");
    const result = await workflow.openComparison();
    expect(result).toMatchObject({ status: "failure", code });
    expect(workflow.getSnapshot().comparison).toBe(previous.comparison);
    expect(workflow.getSnapshot().current).toBe(previous.current);
  }
  let selected = 0;
  let contents = "invalid: [";
  dependencies.selectEarlierBaseline = async () => {
    selected++;
    return { read: signal => selectedBaselineText(contents).read(signal) };
  };
  await workflow.openComparison();
  const stale = boundaryFixture("before");
  stale.boundaryReview.status = "needs-refresh";
  contents = JSON.stringify(stale);
  expect((await workflow.retry()).status).toBe("success");
  expect(selected).toBe(1);
  expect(workflow.getSnapshot().comparison?.result.complete).toBe(false);
});

test("a pending Before picker holds the load slot; dismissal keeps the pair and successful After replacement clears it", async () => {
  const { workflow, dependencies } = comparisonWorkflow();
  await workflow.openBaseline();
  await workflow.openComparison();
  const prior = workflow.getSnapshot();
  const picker = pending<SelectedBaseline | null>();
  dependencies.selectEarlierBaseline = () => picker.promise;
  const attempt = workflow.openComparison();
  const cancel = workflow.cancel();
  expect((await workflow.openComparison()).status).toBe("busy");
  expect((await workflow.openBaseline()).status).toBe("busy");
  picker.resolve(null);
  expect((await cancel)?.status).toBe("cancelled");
  expect((await attempt).status).toBe("cancelled");
  expect(workflow.getSnapshot().comparison).toBe(prior.comparison);
  dependencies.selectBaseline = async () => selectedBaselineText("invalid: [");
  expect((await workflow.openBaseline()).status).toBe("failure");
  expect(workflow.getSnapshot().comparison).toBe(prior.comparison);
  dependencies.selectBaseline = async () => selectedBaselineText(boundaryBytes("after"));
  expect((await workflow.openBaseline()).status).toBe("success");
  expect(workflow.getSnapshot().comparison).toBeNull();
  expect(workflow.getSnapshot().current).not.toBe(prior.current);
});


test("the v6 duplication attachment remains bound to the original After bytes while opening and closing Before", async () => {
  const { workflow, dependencies } = comparisonWorkflow();
  await workflow.openBaseline();
  const current = workflow.getSnapshot().current;
  if (!current) throw new Error("Missing After file");
  const { report } = duplicationV3Fixture();
  const review = { ...report, findings: [], review: { ...report.review, inspected: 0, pending: 0 },
    baseline: { id: current.baseline.id, formatVersion: 6, sha256: current.sha256 } };
  dependencies.selectDuplicationReport = async () => selectedBaselineText(JSON.stringify(review));
  expect((await workflow.openDuplicationReport()).status).toBe("success");
  const original = workflow.getSnapshot().duplication;
  await workflow.openComparison();
  expect(workflow.getSnapshot().duplication).toBe(original);
  review.baseline.sha256 = workflow.getSnapshot().comparison?.before.sha256 ?? "";
  expect(await workflow.openDuplicationReport()).toMatchObject({ status: "failure", code: "baseline-mismatch" });
  await workflow.closeComparison();
  expect(workflow.getSnapshot().duplication).toBe(original);
});
