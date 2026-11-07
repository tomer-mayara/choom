import { expect, test } from "bun:test";
import type { DiscoveryOutcome } from "../../../src/architecture/generated/contracts.ts";
import { LoadWorkflow } from "../../../src/architecture/load-workflow.ts";
import type { AnalysisControl } from "../../../src/domain/architectural-layer.ts";
import type { AnalysisOutcome } from "../../../src/domain/generated/contracts.ts";
import type { ArchitectureLayout } from "../../../src/lib/architecture-layout.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";
import {
  browserWorkflowDocument, discoveredWorkflowRepository, pendingDocumentOperation,
  repositoryWorkflowDependencies,
} from "../../support/load-workflow-fixtures.ts";

test("cancelled discovery must settle and close its acquired session before retry", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const discovered = pendingDocumentOperation<DiscoveryOutcome>();
  const discovering = pendingDocumentOperation<void>();
  const closing = pendingDocumentOperation<void>();
  const closed = pendingDocumentOperation<void>();
  let analyzerCreated = false;
  dependencies.discover = () => { discovering.resolve(); return discovered.promise; };
  dependencies.createLayer = () => { analyzerCreated = true; throw new Error("Cancelled discovery cannot analyze."); };
  dependencies.closeRepository = async () => {
    closing.resolve();
    await closed.promise;
    return { status: "success", value: { closed: true } };
  };
  const workflow = new LoadWorkflow(dependencies);
  const loaded = workflow.loadRepository();
  await discovering.promise;
  const cancellation = workflow.cancel();
  expect(await workflow.retry()).toMatchObject({ status: "busy" });
  discovered.resolve({ status: "success", repository: discoveredWorkflowRepository(), durationMs: 0 });
  await closing.promise;
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  closed.resolve();
  expect(await loaded).toMatchObject({ status: "cancelled" });
  expect(await cancellation).toMatchObject({ status: "cancelled" });
  expect(analyzerCreated).toBe(false);
  expect(workflow.getSnapshot().state.phase).toBe("idle");
});

test("cancellation waits for analyzer cleanup before releasing the repository", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const analysis = pendingDocumentOperation<AnalysisOutcome>();
  const started = pendingDocumentOperation<AnalysisControl>();
  let closed = false;
  dependencies.createLayer = () => ({ analyze: (_, control) => { started.resolve(control); return analysis.promise; } });
  dependencies.closeRepository = async () => { closed = true; return { status: "success", value: { closed: true } }; };
  const workflow = new LoadWorkflow(dependencies);
  const loaded = workflow.loadRepository();
  const control = await started.promise;
  const cancellation = workflow.cancel();
  expect(control.signal.aborted).toBe(true);
  expect(closed).toBe(false);
  expect(await workflow.loadRepository()).toMatchObject({ status: "busy" });
  analysis.resolve({ status: "cancelled" });
  expect(await loaded).toMatchObject({ status: "cancelled" });
  await cancellation;
  expect(closed).toBe(true);
  expect(dependencies.access.snapshots.size).toBe(0);
});

test("the load stays cancellable while its repository closes before the view commit", async () => {
  const dependencies = repositoryWorkflowDependencies(architectureDocumentFixture("Next"));
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  const previous = workflow.getSnapshot().current;
  const closing = pendingDocumentOperation<void>();
  const release = pendingDocumentOperation<void>();
  dependencies.closeRepository = async () => {
    closing.resolve();
    await release.promise;
    return { status: "success", value: { closed: true } };
  };
  const loaded = workflow.loadRepository();
  await closing.promise;
  expect(workflow.getSnapshot().state).toMatchObject({ phase: "loading", stage: "cleanup", cleanupRecovery: "none" });
  const cancellation = workflow.cancel();
  expect(workflow.getSnapshot().state.phase).toBe("cancelling");
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  expect(workflow.getSnapshot().current).toBe(previous);
  release.resolve();
  expect(await loaded).toMatchObject({ status: "cancelled" });
  expect(await cancellation).toMatchObject({ status: "cancelled" });
  expect(workflow.getSnapshot().current).toBe(previous);
  expect(dependencies.access.snapshots.size).toBe(0);
});

test("cancellation during candidate creation waits for its owned file to be removed", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const create = pendingDocumentOperation<void>();
  const release = pendingDocumentOperation<void>();
  dependencies.access.createGate = create.promise;
  dependencies.access.releaseGate = release.promise;
  const workflow = new LoadWorkflow(dependencies);
  const loaded = workflow.loadRepository();
  await dependencies.access.created.promise;
  const cancellation = workflow.cancel();
  expect(dependencies.access.snapshots.size).toBe(1);
  expect(await workflow.retry()).toMatchObject({ status: "busy" });
  create.resolve();
  await dependencies.access.releaseStarted.promise;
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  release.resolve();
  expect(await loaded).toMatchObject({ status: "cancelled" });
  await cancellation;
  expect(dependencies.access.snapshots.size).toBe(0);
});

test("cancellation after analysis preserves the current view and discards a candidate awaiting layout", async () => {
  const dependencies = repositoryWorkflowDependencies(architectureDocumentFixture("Next"));
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  const previous = workflow.getSnapshot().current;
  const layout = pendingDocumentOperation<ArchitectureLayout>();
  const layingOut = pendingDocumentOperation<void>();
  dependencies.layout = () => { layingOut.resolve(); return layout.promise; };
  const loaded = workflow.loadRepository();
  await layingOut.promise;
  expect(dependencies.access.snapshots.size).toBe(1);
  expect(workflow.getSnapshot().current).toBe(previous);
  expect(workflow.getSnapshot().state).toMatchObject({ phase: "loading", stage: "layout" });
  expect(await workflow.cancel()).toMatchObject({ status: "cancelled" });
  expect(await loaded).toMatchObject({ status: "cancelled" });
  expect(workflow.getSnapshot().current).toBe(previous);
  expect(dependencies.access.snapshots.size).toBe(0);
  layout.resolve({ nodes: [] });
});

test("late layout and progress from a cancelled load cannot replace a newer document", async () => {
  const dependencies = repositoryWorkflowDependencies(architectureDocumentFixture("Abandoned"));
  const layout = pendingDocumentOperation<ArchitectureLayout>();
  const layingOut = pendingDocumentOperation<void>();
  const originalLayout = dependencies.layout;
  const analyzerControl = pendingDocumentOperation<AnalysisControl>();
  dependencies.createLayer = () => ({ analyze: async (_, control) => {
    analyzerControl.resolve(control);
    return { status: "success", document: architectureDocumentFixture("Abandoned") };
  } });
  dependencies.layout = () => { layingOut.resolve(); return layout.promise; };
  const workflow = new LoadWorkflow(dependencies);
  const abandoned = workflow.loadRepository();
  await layingOut.promise;
  await workflow.cancel();
  expect(await abandoned).toMatchObject({ status: "cancelled" });
  dependencies.layout = originalLayout;
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Current"));
  await workflow.openDocument();
  const current = workflow.getSnapshot();
  layout.resolve({ nodes: [{ id: "wrong", position: { x: 0, y: 0 } }] });
  (await analyzerControl.promise).onProgress({ stage: "analysis" });
  await Promise.resolve();
  expect(workflow.getSnapshot()).toBe(current);
  expect(current.current?.document.name).toBe("Current");
});

test("an abort observed synchronously before layout starts prevents a commit", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  workflow.subscribe(() => {
    if (workflow.getSnapshot().state.stage === "layout") void workflow.cancel();
  });
  expect(await workflow.loadRepository()).toMatchObject({ status: "cancelled" });
  expect(workflow.getSnapshot().current).toBeNull();
  expect(dependencies.access.snapshots.size).toBe(0);
});

test("cancellation cannot reverse a synchronous commit while superseded cleanup is pending", async () => {
  const dependencies = repositoryWorkflowDependencies(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  const release = pendingDocumentOperation<void>();
  dependencies.access.releaseGate = release.promise;
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Current"));
  const loaded = workflow.openDocument();
  await dependencies.access.releaseStarted.promise;
  expect(workflow.getSnapshot().current?.document.name).toBe("Current");
  expect(workflow.getSnapshot().state.lastOutcome?.status).toBe("success");
  expect(workflow.getSnapshot().state.phase).toBe("cleanup");
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  expect(await workflow.cancel()).toMatchObject({ status: "success" });
  release.resolve();
  expect(await loaded).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().current?.document.name).toBe("Current");
  expect(dependencies.access.snapshots.size).toBe(0);
});

test("dispose cancels an in-flight load and releases current and candidate snapshots", async () => {
  const dependencies = repositoryWorkflowDependencies(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  const layout = pendingDocumentOperation<ArchitectureLayout>();
  const layingOut = pendingDocumentOperation<void>();
  dependencies.layout = () => { layingOut.resolve(); return layout.promise; };
  const loaded = workflow.loadRepository();
  await layingOut.promise;
  expect(dependencies.access.snapshots.size).toBe(2);
  await workflow.dispose();
  expect(await loaded).toMatchObject({ status: "cancelled" });
  expect(dependencies.access.snapshots.size).toBe(0);
  expect(await workflow.loadRepository()).toMatchObject({ status: "failure", code: "disposed" });
  layout.resolve({ nodes: [] });
});
