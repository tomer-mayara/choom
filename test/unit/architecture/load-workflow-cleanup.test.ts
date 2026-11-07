import { expect, test } from "bun:test";
import { LoadWorkflow } from "../../../src/architecture/load-workflow.ts";
import type { AnalysisOutcome } from "../../../src/domain/generated/contracts.ts";
import type { ArchitectureLayout } from "../../../src/lib/architecture-layout.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";
import { documentStorageFailure } from "../../support/document-storage-fixtures.ts";
import {
  browserWorkflowDocument, pendingDocumentOperation, repositoryWorkflowDependencies,
} from "../../support/load-workflow-fixtures.ts";

test("failed superseded cleanup preserves the new view and success while blocking cache growth", async () => {
  const dependencies = repositoryWorkflowDependencies(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  dependencies.access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  dependencies.createLayer = () => ({ analyze: async () => ({ status: "success", document: architectureDocumentFixture("Current") }) });
  expect(await workflow.loadRepository()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().current?.document.name).toBe("Current");
  expect(workflow.getSnapshot().state).toMatchObject({
    phase: "cleanup", lastOutcome: { status: "success" }, cleanupRecovery: "retry", cleanupFailure: { stage: "cleanup" },
  });
  expect(dependencies.access.snapshots.size).toBe(2);
  expect(await workflow.loadRepository()).toMatchObject({ status: "busy" });
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  expect(await workflow.retry()).toMatchObject({ status: "busy" });
  dependencies.access.releaseFailure = undefined;
  expect(await workflow.retryCleanup()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().state).toMatchObject({ phase: "idle", cleanupRecovery: "none", lastOutcome: { status: "success" } });
  expect(workflow.getSnapshot().state.cleanupFailure).toBeUndefined();
  expect(dependencies.access.snapshots.size).toBe(1);
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Saved"));
  expect(await workflow.openDocument()).toMatchObject({ status: "success" });
  expect(dependencies.access.snapshots.size).toBe(0);
});

test("candidate cleanup failure wins over cancellation and must be retried before another load", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const create = pendingDocumentOperation<void>();
  dependencies.access.createGate = create.promise;
  dependencies.access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  const workflow = new LoadWorkflow(dependencies);
  const loaded = workflow.loadRepository();
  await dependencies.access.created.promise;
  const cancellation = workflow.cancel();
  create.resolve();
  expect(await loaded).toMatchObject({ status: "failure", stage: "cleanup" });
  await cancellation;
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("retry");
  expect(workflow.getSnapshot().current).toBeNull();
  expect(await workflow.retry()).toMatchObject({ status: "busy" });
  dependencies.access.releaseFailure = undefined;
  expect(await workflow.retryCleanup()).toMatchObject({ status: "success" });
  expect(dependencies.access.snapshots.size).toBe(0);
  expect(await workflow.retry()).toMatchObject({ status: "success" });
  await workflow.dispose();
});

test("repository close failures retain their known session for cleanup retry", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const closed: string[] = [];
  let removalAvailable = false;
  dependencies.closeRepository = async ({ repositorySession }) => {
    closed.push(repositorySession);
    return removalAvailable
      ? { status: "success", value: { closed: true } }
      : { status: "failure", code: "io-error", message: "Cannot release the repository." };
  };
  const workflow = new LoadWorkflow(dependencies);
  expect(await workflow.loadRepository()).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("retry");
  expect(workflow.getSnapshot().current).toBeNull();
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  removalAvailable = true;
  expect(await workflow.retryCleanup()).toMatchObject({ status: "success" });
  expect(new Set(closed)).toEqual(new Set(["repository-session"]));
  expect(closed.length).toBe(2);
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("none");
});

test.each(["returned", "rejected"] as const)("%s analyzer cleanup uncertainty requires restart and never releases its repository", async (failure) => {
  const dependencies = repositoryWorkflowDependencies();
  let closed = false;
  dependencies.closeRepository = async () => { closed = true; return { status: "success", value: { closed: true } }; };
  dependencies.createLayer = () => ({ analyze: async (): Promise<AnalysisOutcome> => {
    if (failure === "rejected") throw new Error("/private/analyzer-failure");
    return { status: "failure", stage: "cleanup", code: "unavailable", message: "Analyzer cleanup failed." };
  } });
  const workflow = new LoadWorkflow(dependencies);
  expect(await workflow.loadRepository()).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("restart");
  expect(await workflow.retryCleanup()).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("restart");
  expect(await workflow.loadRepository()).toMatchObject({ status: "busy" });
  await workflow.dispose();
  expect(closed).toBe(false);
});

test("a discovery failure with an unavailable cleanup handle requires restart", async () => {
  const dependencies = repositoryWorkflowDependencies();
  dependencies.discover = async () => ({
    status: "failure", stage: "discovery", code: "cleanup-failed",
    message: "Repository access failed. The repository session could not be closed.", durationMs: 0,
  });
  const workflow = new LoadWorkflow(dependencies);
  expect(await workflow.loadRepository()).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("restart");
  expect(await workflow.retryCleanup()).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(await workflow.retry()).toMatchObject({ status: "busy" });
});

test("external document cleanup preserves a successful current load and gates new loads", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  const current = workflow.getSnapshot().current;
  const outcome = workflow.getSnapshot().state.lastOutcome;
  workflow.documentCleanupFailed();
  expect(workflow.getSnapshot().current).toBe(current);
  expect(workflow.getSnapshot().state.lastOutcome).toBe(outcome);
  expect(workflow.getSnapshot().state).toMatchObject({ phase: "cleanup", cleanupRecovery: "retry" });
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  expect(await workflow.retryCleanup()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("none");
  expect(workflow.getSnapshot().state.lastOutcome).toBe(outcome);
  expect(workflow.getSnapshot().current).toBe(current);
  await workflow.dispose();
});

test.each(["success", "cancelled"] as const)("external document cleanup never replaces an active load's %s outcome", async (status) => {
  const dependencies = repositoryWorkflowDependencies();
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  const layout = pendingDocumentOperation<ArchitectureLayout>();
  const layingOut = pendingDocumentOperation<void>();
  dependencies.layout = () => { layingOut.resolve(); return layout.promise; };
  const loaded = workflow.loadRepository();
  await layingOut.promise;
  const pending = workflow.getSnapshot();
  workflow.documentCleanupFailed();
  expect(workflow.getSnapshot().state.lastOutcome).toBe(pending.state.lastOutcome);
  expect(workflow.getSnapshot().current).toBe(pending.current);
  if (status === "cancelled") await workflow.cancel();
  else layout.resolve({ nodes: [] });
  expect(await loaded).toMatchObject({ status });
  expect(workflow.getSnapshot().state.lastOutcome?.status).toBe(status);
  expect(workflow.getSnapshot().current?.document.name).toBe(status === "success" ? "Atlas" : "Previous");
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("retry");
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  expect(await workflow.retryCleanup()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("none");
  layout.resolve({ nodes: [] });
  await workflow.dispose();
});

test("external document cleanup cannot downgrade the analyzer restart requirement", async () => {
  const dependencies = repositoryWorkflowDependencies();
  dependencies.createLayer = () => ({ analyze: async () => ({
    status: "failure", stage: "cleanup", code: "unavailable", message: "Analyzer cleanup failed.",
  }) });
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  const failure = workflow.getSnapshot().state.cleanupFailure;
  workflow.documentCleanupFailed();
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("restart");
  expect(workflow.getSnapshot().state.cleanupFailure).toBe(failure);
  expect(await workflow.retryCleanup()).toMatchObject({ status: "failure" });
});

test("a cleanup completion cannot clear a newer independent export cleanup failure", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const cleanup = pendingDocumentOperation<void>();
  const cleaning = pendingDocumentOperation<void>();
  const retryCleanup = dependencies.documents.retryCleanup.bind(dependencies.documents);
  dependencies.documents.retryCleanup = async () => {
    cleaning.resolve();
    await cleanup.promise;
    return { status: "success", cleaned: true, durationMs: 0 };
  };
  const workflow = new LoadWorkflow(dependencies);
  workflow.documentCleanupFailed();
  const firstRetry = workflow.retryCleanup();
  await cleaning.promise;
  workflow.documentCleanupFailed();
  cleanup.resolve();
  expect(await firstRetry).toMatchObject({ status: "failure", stage: "cleanup" });
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("retry");
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  dependencies.documents.retryCleanup = retryCleanup;
  expect(await workflow.retryCleanup()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("none");
});
