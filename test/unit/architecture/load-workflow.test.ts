import { expect, test } from "bun:test";
import { LoadWorkflow } from "../../../src/architecture/load-workflow.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";
import { documentStorageFailure } from "../../support/document-storage-fixtures.ts";
import {
  browserWorkflowDocument, discoveredWorkflowRepository, pendingDocumentOperation,
  repositoryWorkflowDependencies, workflowDependencies, workflowDocumentText,
} from "../../support/load-workflow-fixtures.ts";

test("selection already owns the one load slot", async () => {
  const selected = pendingDocumentOperation<string | null>();
  const dependencies = workflowDependencies();
  dependencies.selectRepository = () => selected.promise;
  const workflow = new LoadWorkflow(dependencies);
  const first = workflow.loadRepository();
  expect(workflow.getSnapshot().state.phase).toBe("loading");
  expect(workflow.getSnapshot().state.stage).toBe("selection");
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  selected.resolve(null);
  expect(await first).toMatchObject({ status: "cancelled" });
  expect(workflow.getSnapshot().state.phase).toBe("idle");
});

test("cancellation keeps the slot until an unfinished picker returns", async () => {
  const selected = pendingDocumentOperation<string | null>();
  const dependencies = workflowDependencies();
  dependencies.selectRepository = () => selected.promise;
  let discovery = 0;
  const discover = dependencies.discover;
  dependencies.discover = (request) => { discovery += 1; return discover(request); };
  const workflow = new LoadWorkflow(dependencies);
  const first = workflow.loadRepository();
  const cancellation = workflow.cancel();
  expect(workflow.getSnapshot().state.phase).toBe("cancelling");
  expect(await workflow.openDocument()).toMatchObject({ status: "busy" });
  selected.resolve("/selected");
  expect(await first).toMatchObject({ status: "cancelled" });
  await cancellation;
  expect(discovery).toBe(0);
  expect(workflow.getSnapshot().state.phase).toBe("idle");
});

test("a failed selection keeps the current view empty and permits another attempt", async () => {
  const dependencies = workflowDependencies();
  dependencies.selectRepository = async () => { throw new Error("/private/picker-failure"); };
  const workflow = new LoadWorkflow(dependencies);
  const failed = await workflow.loadRepository();
  expect(failed).toMatchObject({ status: "failure", stage: "selection" });
  expect(JSON.stringify(failed)).not.toContain("/private");
  expect(workflow.getSnapshot().current).toBeNull();
  dependencies.selectRepository = async () => null;
  expect(await workflow.loadRepository()).toMatchObject({ status: "cancelled" });
});

test("a repository load uses a substitute neutral layer and displays the reread candidate", async () => {
  const document = architectureDocumentFixture();
  const dependencies = repositoryWorkflowDependencies(document);
  const repository = discoveredWorkflowRepository(document);
  const analyzed = pendingDocumentOperation<unknown>();
  let closed = false;
  dependencies.createLayer = () => ({
    analyze: async (request, control) => {
      analyzed.resolve(request);
      control.onProgress({ stage: "conversion" });
      return { status: "success", document };
    },
  });
  dependencies.closeRepository = async (request) => {
    closed = request.repositorySession === repository.repositorySession;
    return { status: "success", value: { closed: true } };
  };
  const reread = architectureDocumentFixture("Reread");
  dependencies.access.readText = workflowDocumentText(reread);
  const workflow = new LoadWorkflow(dependencies);
  expect(await workflow.loadRepository()).toMatchObject({ status: "success" });
  expect(await analyzed.promise).toEqual({
    repositorySession: repository.repositorySession, components: repository.components, analysis: repository.analysis,
  });
  expect(closed).toBe(true);
  expect(workflow.getSnapshot().current?.document).toEqual(reread);
  expect(workflow.getSnapshot().current?.layout.nodes.map(({ id }) => id)).toEqual([".", "packages/core", "src"]);
  expect(dependencies.access.snapshots.size).toBe(1);
  await workflow.dispose();
  expect(dependencies.access.snapshots.size).toBe(0);
});

test.each(["browser", "desktop"] as const)("%s saved documents use the common decoder without source access", async (kind) => {
  const document = architectureDocumentFixture("Saved");
  const dependencies = workflowDependencies();
  dependencies.selectDocument = async () => kind === "browser"
    ? browserWorkflowDocument(document) : { kind: "desktop", path: "/saved.choom.yaml" };
  dependencies.access.files.set("/saved.choom.yaml", workflowDocumentText(document));
  dependencies.discover = async () => { throw new Error("A saved document cannot discover a repository."); };
  dependencies.createLayer = () => { throw new Error("A saved document cannot construct an analyzer."); };
  dependencies.closeRepository = async () => { throw new Error("A saved document has no repository to close."); };
  const workflow = new LoadWorkflow(dependencies);
  expect(await workflow.openDocument()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().current?.document).toEqual(document);
  expect(dependencies.access.snapshots.size).toBe(0);
  expect(dependencies.access.files.get("/saved.choom.yaml")).toBe(workflowDocumentText(document));
});

test.each(["discovery", "storage", "reading", "validation", "layout"] as const)("%s failure preserves the previously committed view", async (stage) => {
  const dependencies = repositoryWorkflowDependencies(architectureDocumentFixture("Next"));
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  const previous = workflow.getSnapshot().current;
  if (stage === "discovery") dependencies.discover = async () => ({
    status: "failure", stage, code: "manifest-unreadable", message: "The manifest could not be read.", durationMs: 0,
  });
  if (stage === "storage") dependencies.access.createFailure = documentStorageFailure("io-error");
  if (stage === "reading") dependencies.selectDocument = async () => ({ kind: "desktop", path: "/missing" });
  if (stage === "validation") dependencies.selectDocument = async () => ({ kind: "browser", readText: async () => "schemaVersion: 42" });
  if (stage === "layout") dependencies.layout = async () => { throw new Error("/private/layout-failure"); };
  const outcome = await (stage === "reading" || stage === "validation" ? workflow.openDocument() : workflow.loadRepository());
  expect(outcome).toMatchObject({ status: "failure", stage });
  expect(JSON.stringify(outcome)).not.toContain("/private");
  expect(workflow.getSnapshot().current).toBe(previous);
  expect(dependencies.access.snapshots.size).toBe(0);
});

test("retry uses the resolved selection with a fresh operation after its manifest is restored", async () => {
  const dependencies = repositoryWorkflowDependencies();
  let selections = 0;
  dependencies.selectRepository = async () => { selections += 1; return "/selected"; };
  const discover = dependencies.discover;
  dependencies.discover = async () => ({
    status: "failure", stage: "discovery", code: "manifest-unreadable", message: "The manifest could not be read.", durationMs: 0,
  });
  const workflow = new LoadWorkflow(dependencies);
  expect(await workflow.loadRepository()).toMatchObject({ status: "failure" });
  dependencies.discover = discover;
  expect(await workflow.retry()).toMatchObject({ status: "success" });
  expect(selections).toBe(1);
  expect(workflow.getSnapshot().current?.document.name).toBe("Atlas");
  await workflow.dispose();
});

test("subscriptions expose stable snapshots and observer failures cannot interrupt a load", async () => {
  const dependencies = workflowDependencies();
  dependencies.selectDocument = async () => browserWorkflowDocument();
  const workflow = new LoadWorkflow(dependencies);
  const initial = workflow.getSnapshot();
  expect(workflow.getSnapshot()).toBe(initial);
  let notified = 0;
  const unsubscribe = workflow.subscribe(() => { notified += 1; });
  const unsubscribeThrowing = workflow.subscribe(() => { throw new Error("The observer failed."); });
  expect(await workflow.openDocument()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot()).not.toBe(initial);
  expect(notified).toBeGreaterThan(0);
  unsubscribe();
  unsubscribeThrowing();
  const notifications = notified;
  await workflow.openDocument();
  expect(notified).toBe(notifications);
});
