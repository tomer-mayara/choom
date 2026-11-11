import { expect, test } from "bun:test";
import { LoadWorkflow, type SelectedBaseline } from "../../../src/architecture/load-workflow.ts";
import type { ArchitectureLayout } from "../../../src/lib/architecture-layout.ts";
import { baselineExample, fixtureItem } from "../../support/baseline-fixtures.ts";
import { baselineWorkflowDependencies, pending, selectedBaseline } from "../../support/baseline-workflow-fixtures.ts";

test("a saved baseline passes through the load workflow", async () => {
  const workflow = new LoadWorkflow(baselineWorkflowDependencies());
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().current?.baseline).toEqual(baselineExample());
});

test("selection owns the load slot until a cancelled picker settles", async () => {
  const selection = pending<SelectedBaseline | null>();
  const dependencies = baselineWorkflowDependencies();
  dependencies.selectBaseline = () => selection.promise;
  const workflow = new LoadWorkflow(dependencies);
  const first = workflow.openBaseline();
  const cancellation = workflow.cancel();
  expect(workflow.getSnapshot().state.phase).toBe("cancelling");
  expect(await workflow.openBaseline()).toMatchObject({ status: "busy" });
  selection.resolve(selectedBaseline());
  expect(await first).toMatchObject({ status: "cancelled" });
  await cancellation;
  expect(workflow.getSnapshot().current).toBeNull();
  expect(workflow.getSnapshot().state.phase).toBe("idle");
});

test.each(["selection", "reading", "validation", "layout"] as const)("%s failure preserves the committed baseline and layout", async (stage) => {
  const dependencies = baselineWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openBaseline();
  const current = workflow.getSnapshot().current;
  if (stage === "selection") dependencies.selectBaseline = async () => { throw new Error("/private/picker"); };
  if (stage === "reading") dependencies.selectBaseline = async () => ({ read: async () => { throw new Error("/private/read"); } });
  if (stage === "validation") dependencies.selectBaseline = async () => ({ read: async () => ({ status: "success", text: "schemaVersion: 1", durationMs: 0 }) });
  if (stage === "layout") dependencies.layout = async () => { throw new Error("/private/layout"); };
  const outcome = await workflow.openBaseline();
  expect(outcome).toMatchObject({ status: "failure", stage });
  expect(JSON.stringify(outcome)).not.toContain("/private");
  expect(workflow.getSnapshot().current).toBe(current);
});

test("retry rereads the selected baseline and does not reopen its picker", async () => {
  const dependencies = baselineWorkflowDependencies();
  let selections = 0;
  let unavailable = true;
  dependencies.selectBaseline = async () => {
    selections += 1;
    return { read: async (signal) => {
      if (unavailable) throw new Error("File temporarily unavailable");
      return selectedBaseline().read(signal);
    } };
  };
  const workflow = new LoadWorkflow(dependencies);
  expect(await workflow.openBaseline()).toMatchObject({ status: "failure", stage: "reading" });
  unavailable = false;
  expect(await workflow.retry()).toMatchObject({ status: "success" });
  expect(selections).toBe(1);
});

test("retry repeats a failed selection instead of reusing an older selected file", async () => {
  const dependencies = baselineWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openBaseline();
  dependencies.selectBaseline = async () => { throw new Error("No picker"); };
  expect(await workflow.openBaseline()).toMatchObject({ status: "failure" });
  let selected = false;
  dependencies.selectBaseline = async () => { selected = true; return null; };
  expect(await workflow.retry()).toMatchObject({ status: "cancelled" });
  expect(selected).toBe(true);
});

test.each(["reading", "layout"] as const)("cancelled %s releases the slot and handles a late rejection", async (stage) => {
  const dependencies = baselineWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openBaseline();
  const previous = workflow.getSnapshot().current;
  const reached = pending<void>();
  const read = pending<Awaited<ReturnType<SelectedBaseline["read"]>>>();
  const layout = pending<ArchitectureLayout>();
  if (stage === "reading") dependencies.selectBaseline = async () => ({ read: () => { reached.resolve(); return read.promise; } });
  if (stage === "layout") dependencies.layout = () => { reached.resolve(); return layout.promise; };
  const loading = workflow.openBaseline();
  await reached.promise;
  expect(await workflow.cancel()).toMatchObject({ status: "cancelled" });
  expect(await loading).toMatchObject({ status: "cancelled" });
  expect(workflow.getSnapshot().current).toBe(previous);
  Object.assign(dependencies, baselineWorkflowDependencies());
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  const current = workflow.getSnapshot().current;
  if (stage === "reading") read.reject(new Error("Late read failure"));
  else layout.reject(new Error("Late layout failure"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(workflow.getSnapshot().current).toBe(current);
});

test("cancellation by a stage subscriber prevents layout and publication", async () => {
  const dependencies = baselineWorkflowDependencies();
  let layouts = 0;
  dependencies.layout = async () => { layouts += 1; return { nodes: [] }; };
  const workflow = new LoadWorkflow(dependencies);
  workflow.subscribe(() => {
    if (workflow.getSnapshot().state.phase === "loading" && workflow.getSnapshot().state.stage === "layout") void workflow.cancel();
  });
  expect(await workflow.openBaseline()).toMatchObject({ status: "cancelled" });
  expect(layouts).toBe(0);
  expect(workflow.getSnapshot().current).toBeNull();
});

test("cancellation after synchronous publication cannot reverse the commit", async () => {
  const workflow = new LoadWorkflow(baselineWorkflowDependencies());
  const cancelled = pending<unknown>();
  workflow.subscribe(() => {
    if (workflow.getSnapshot().current && workflow.getSnapshot().state.phase === "loading") void workflow.cancel().then(cancelled.resolve);
  });
  expect(await workflow.openBaseline()).toMatchObject({ status: "success" });
  expect(await cancelled.promise).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().current?.baseline.id).toBe("baseline-example");
});

test("publication owns immutable copies without freezing collaborator data", async () => {
  const dependencies = baselineWorkflowDependencies();
  const baseline = baselineExample();
  let supplied: typeof baseline | undefined;
  const positions: ArchitectureLayout = { nodes: [{ id: "checkout", position: { x: 0, y: 0 } }] };
  dependencies.selectBaseline = async () => selectedBaseline(baseline);
  dependencies.layout = async (value) => { supplied = value; return positions; };
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openBaseline();
  const current = workflow.getSnapshot().current;
  expect(Object.isFrozen(current?.baseline.rules[0]?.expected.value)).toBe(true);
  expect(Object.isFrozen(current?.baseline.components[0]?.purpose.evidenceRefs)).toBe(true);
  expect(Object.isFrozen(current?.layout.nodes[0]?.position)).toBe(true);
  expect(Object.isFrozen(positions)).toBe(false);
  expect(Object.isFrozen(supplied)).toBe(false);
  fixtureItem(positions.nodes).position.x = 900;
  if (supplied) fixtureItem(supplied.components).name = "Changed";
  expect(current?.baseline.components[0]?.name).toBe("Checkout");
  expect(current?.layout.nodes[0]?.position.x).toBe(0);
  expect(workflow.getSnapshot()).toBe(workflow.getSnapshot());
});

test("publication copy failure preserves the current baseline", async () => {
  const dependencies = baselineWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openBaseline();
  const current = workflow.getSnapshot().current;
  dependencies.layout = async () => Object.assign({ nodes: [] }, { uncloneable: () => {} });
  expect(await workflow.openBaseline()).toMatchObject({ status: "failure", stage: "layout" });
  expect(workflow.getSnapshot().current).toBe(current);
});

test("throwing observers cannot stop a load and returned outcomes cannot change retained state", async () => {
  const workflow = new LoadWorkflow(baselineWorkflowDependencies());
  const remove = workflow.subscribe(() => { throw new Error("Observer failed"); });
  const success = await workflow.openBaseline();
  expect(success.status).toBe("success");
  expect(Object.isFrozen(success)).toBe(true);
  expect(Object.isFrozen(workflow.getSnapshot().state)).toBe(true);
  remove();
  await workflow.dispose();
  expect(await workflow.openBaseline()).toMatchObject({ status: "failure", code: "disposed" });
});

test("a renewed subscription receives each published snapshot once", async () => {
  const dependencies = baselineWorkflowDependencies();
  const selection = pending<SelectedBaseline | null>();
  dependencies.selectBaseline = () => selection.promise;
  const workflow = new LoadWorkflow(dependencies);
  let calls = 0;
  let remove = () => {};
  const observe = () => {
    calls += 1;
    remove();
    if (calls < 20) remove = workflow.subscribe(observe);
  };
  remove = workflow.subscribe(observe);
  const load = workflow.openBaseline();
  expect(calls).toBe(1);
  selection.resolve(null);
  await load;
  expect(calls).toBe(2);
});
