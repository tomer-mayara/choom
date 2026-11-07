import assert from "node:assert/strict";
import { After, Before, Given, Then, When, type World } from "@cucumber/cucumber";
import type { DiscoveryOutcome } from "../../src/architecture/generated/contracts.ts";
import type { WorkflowOutcome } from "../../src/architecture/generated/workflow.ts";
import { LoadWorkflow } from "../../src/architecture/load-workflow.ts";
import type { ArchitectureLayout } from "../../src/lib/architecture-layout.ts";
import { architectureDocumentFixture } from "../support/document-fixtures.ts";
import { documentStorageFailure } from "../support/document-storage-fixtures.ts";
import {
  browserWorkflowDocument, discoveredWorkflowRepository, pendingDocumentOperation, repositoryWorkflowDependencies,
} from "../support/load-workflow-fixtures.ts";

interface WorkflowWorld extends World {
  workflow: LoadWorkflow;
  dependencies: ReturnType<typeof repositoryWorkflowDependencies>;
  outcome?: WorkflowOutcome | null;
  loading?: Promise<WorkflowOutcome>;
  cancellation?: Promise<WorkflowOutcome | null>;
  selection?: ReturnType<typeof pendingDocumentOperation<string | null>>;
  discovery?: ReturnType<typeof pendingDocumentOperation<DiscoveryOutcome>>;
  layout?: ReturnType<typeof pendingDocumentOperation<ArchitectureLayout>>;
  originalLayout: ReturnType<typeof repositoryWorkflowDependencies>["layout"];
  restoredDiscovery?: ReturnType<typeof repositoryWorkflowDependencies>["discover"];
  sourceCalls: number;
  selections: number;
  closedSessions: string[];
  useSavedLoad: boolean;
  cleanup?: ReturnType<typeof pendingDocumentOperation<void>>;
  originalCleanup?: ReturnType<typeof repositoryWorkflowDependencies>["documents"]["retryCleanup"];
  release?: ReturnType<typeof pendingDocumentOperation<void>>;
}

Before({ tags: "@cr-001-t07-api" }, function (this: WorkflowWorld) {
  this.dependencies = repositoryWorkflowDependencies();
  this.originalLayout = this.dependencies.layout;
  this.workflow = new LoadWorkflow(this.dependencies);
  this.closedSessions = [];
  this.sourceCalls = 0;
  this.selections = 0;
  this.useSavedLoad = false;
});

After({ tags: "@cr-001-t07-api" }, async function (this: WorkflowWorld) {
  this.selection?.resolve(null);
  this.discovery?.resolve({ status: "success", repository: discoveredWorkflowRepository(), durationMs: 0 });
  this.layout?.resolve({ nodes: [] });
  this.cleanup?.resolve();
  this.release?.resolve();
  this.dependencies.access.releaseFailure = undefined;
  await this.workflow.dispose();
  await this.workflow.retryCleanup();
});

async function showSaved(world: WorkflowWorld, name: string): Promise<void> {
  world.dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture(name));
  world.outcome = await world.workflow.openDocument();
  assert.equal(world.outcome.status, "success");
}

async function showRepository(world: WorkflowWorld, name: string): Promise<void> {
  world.dependencies.createLayer = () => ({ analyze: async () => ({ status: "success", document: architectureDocumentFixture(name) }) });
  world.outcome = await world.workflow.loadRepository();
  assert.equal(world.outcome.status, "success");
}

async function awaitLayout(world: WorkflowWorld, previous: string, next: string): Promise<void> {
  await showSaved(world, previous);
  world.layout = pendingDocumentOperation<ArchitectureLayout>();
  const ready = pendingDocumentOperation<void>();
  world.dependencies.layout = () => { ready.resolve(); return world.layout?.promise ?? Promise.resolve({ nodes: [] }); };
  world.dependencies.createLayer = () => ({ analyze: async () => ({ status: "success", document: architectureDocumentFixture(next) }) });
  world.loading = world.workflow.loadRepository();
  await ready.promise;
}

Given("a repository selection has not finished", function (this: WorkflowWorld) {
  this.selection = pendingDocumentOperation<string | null>();
  this.dependencies.selectRepository = () => this.selection?.promise ?? Promise.resolve(null);
  this.loading = this.workflow.loadRepository();
});

When("a saved document load is requested", async function (this: WorkflowWorld) {
  this.outcome = await this.workflow.openDocument();
});

Then("the second load is refused while selection is pending", function (this: WorkflowWorld) {
  assert.equal(this.outcome?.status, "busy");
  assert.equal(this.workflow.getSnapshot().state.stage, "selection");
});

Given("repository discovery has not finished", async function (this: WorkflowWorld) {
  this.discovery = pendingDocumentOperation<DiscoveryOutcome>();
  const discovering = pendingDocumentOperation<void>();
  this.dependencies.discover = () => {
    discovering.resolve();
    assert.ok(this.discovery);
    return this.discovery.promise;
  };
  this.dependencies.closeRepository = async ({ repositorySession }) => {
    this.closedSessions.push(repositorySession);
    return { status: "success", value: { closed: true } };
  };
  this.loading = this.workflow.loadRepository();
  await discovering.promise;
});

When("the repository load is cancelled", function (this: WorkflowWorld) {
  this.cancellation = this.workflow.cancel();
});

Then("cancellation waits for discovery and releases its repository session", async function (this: WorkflowWorld) {
  assert.equal((await this.workflow.openDocument()).status, "busy");
  assert.deepEqual(this.closedSessions, []);
  this.discovery?.resolve({ status: "success", repository: discoveredWorkflowRepository(), durationMs: 0 });
  assert.equal((await this.cancellation)?.status, "cancelled");
  assert.equal((await this.loading)?.status, "cancelled");
  assert.deepEqual(this.closedSessions, ["repository-session"]);
});

Given("{string} is current and the new analysis is waiting to release its repository", async function (this: WorkflowWorld, name: string) {
  await showSaved(this, name);
  this.release = pendingDocumentOperation<void>();
  const closing = pendingDocumentOperation<void>();
  this.dependencies.closeRepository = async () => {
    closing.resolve();
    await this.release?.promise;
    return { status: "success", value: { closed: true } };
  };
  this.loading = this.workflow.loadRepository();
  await closing.promise;
  assert.equal(this.workflow.getSnapshot().state.phase, "loading");
  assert.equal(this.workflow.getSnapshot().state.stage, "cleanup");
});

When("cancellation is requested before that repository release completes", async function (this: WorkflowWorld) {
  this.cancellation = this.workflow.cancel();
  assert.equal(this.workflow.getSnapshot().state.phase, "cancelling");
  assert.equal((await this.workflow.openDocument()).status, "busy");
});

Then("{string} stays current and the load ends as cancelled after release", async function (this: WorkflowWorld, name: string) {
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  this.release?.resolve();
  assert.equal((await this.cancellation)?.status, "cancelled");
  assert.equal((await this.loading)?.status, "cancelled");
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.equal(this.dependencies.access.snapshots.size, 0);
});

Given("{string} is current and {string} is awaiting layout", async function (this: WorkflowWorld, previous: string, next: string) {
  await awaitLayout(this, previous, next);
});

When("the current document is observed", function (this: WorkflowWorld) {
  assert.equal(this.workflow.getSnapshot().state.stage, "layout");
});

Then("{string} is still current", function (this: WorkflowWorld, name: string) {
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
});

When("the load is cancelled", async function (this: WorkflowWorld) {
  this.outcome = await this.workflow.cancel();
});

Then("{string} stays current and the rejected candidate is removed", function (this: WorkflowWorld, name: string) {
  assert.equal(this.outcome?.status, "cancelled");
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.equal(this.dependencies.access.snapshots.size, 0);
});

Given("a load was cancelled while its layout was pending", async function (this: WorkflowWorld) {
  await awaitLayout(this, "Previous", "Abandoned");
  assert.equal((await this.workflow.cancel())?.status, "cancelled");
});

Given("{string} has since loaded", async function (this: WorkflowWorld, name: string) {
  this.dependencies.layout = this.originalLayout;
  await showSaved(this, name);
});

When("the cancelled layout finishes", async function (this: WorkflowWorld) {
  this.layout?.resolve({ nodes: [{ id: "abandoned", position: { x: 0, y: 0 } }] });
  await Promise.resolve();
});

Then("{string} stays current", function (this: WorkflowWorld, name: string) {
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
});

Given("{string} is current", async function (this: WorkflowWorld, name: string) {
  await showSaved(this, name);
});

Given(/^the next load will fail during (discovery|storage|reading|validation|layout)$/, function (this: WorkflowWorld, stage: string) {
  switch (stage) {
    case "discovery":
      this.dependencies.discover = async () => ({
        status: "failure", stage: "discovery", code: "manifest-unreadable", message: "The manifest could not be read.", durationMs: 0,
      });
      break;
    case "storage": this.dependencies.access.createFailure = documentStorageFailure("io-error"); break;
    case "reading": this.dependencies.selectDocument = async () => ({ kind: "desktop", path: "/missing" }); break;
    case "validation": this.dependencies.selectDocument = async () => ({ kind: "browser", readText: async () => "schemaVersion: 42" }); break;
    case "layout": this.dependencies.layout = async () => { throw new Error("Layout unavailable."); }; break;
  }
  this.useSavedLoad = stage === "reading" || stage === "validation";
});

When("that load is requested", async function (this: WorkflowWorld) {
  this.outcome = await (this.useSavedLoad ? this.workflow.openDocument() : this.workflow.loadRepository());
});

Then("{string} stays current and the failure identifies {string}", function (this: WorkflowWorld, name: string, stage: string) {
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.ok(this.outcome?.status === "failure");
  assert.equal(this.outcome.stage, stage);
  assert.equal(this.dependencies.access.snapshots.size, 0);
});

Given("{string} has finished loading", async function (this: WorkflowWorld, name: string) {
  await showSaved(this, name);
});

When("cancellation is requested", async function (this: WorkflowWorld) {
  this.outcome = await this.workflow.cancel();
});

Then("{string} stays current and the completed load remains successful", function (this: WorkflowWorld, name: string) {
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.equal(this.outcome?.status, "success");
  assert.equal(this.workflow.getSnapshot().state.lastOutcome?.status, "success");
});

Given("{string} has a stored snapshot", async function (this: WorkflowWorld, name: string) {
  await showRepository(this, name);
  assert.equal(this.dependencies.access.snapshots.size, 1);
});

Given("that snapshot cannot be removed", function (this: WorkflowWorld) {
  this.dependencies.access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
});

When("{string} finishes loading", async function (this: WorkflowWorld, name: string) {
  await showRepository(this, name);
});

Then("{string} is displayed and another load is blocked until cleanup succeeds", async function (this: WorkflowWorld, name: string) {
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.equal(this.workflow.getSnapshot().state.lastOutcome?.status, "success");
  assert.equal(this.workflow.getSnapshot().state.cleanupRecovery, "retry");
  assert.equal(this.dependencies.access.snapshots.size, 2);
  assert.equal((await this.workflow.loadRepository()).status, "busy");
  assert.equal((await this.workflow.openDocument()).status, "busy");
});

Given("a superseded snapshot could not be removed after {string} loaded", async function (this: WorkflowWorld, name: string) {
  await showRepository(this, "Previous");
  this.dependencies.access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  await showRepository(this, name);
  assert.equal(this.workflow.getSnapshot().state.cleanupRecovery, "retry");
});

When("workspace cleanup is retried after removal becomes available", async function (this: WorkflowWorld) {
  this.dependencies.access.releaseFailure = undefined;
  this.outcome = await this.workflow.retryCleanup();
});

Then("{string} stays current and another load can start", async function (this: WorkflowWorld, name: string) {
  assert.equal(this.outcome?.status, "success");
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.equal(this.dependencies.access.snapshots.size, 1);
  this.dependencies.selectRepository = async () => null;
  assert.equal((await this.workflow.loadRepository()).status, "cancelled");
});

Given("analyzer cleanup failed without returning an owned cleanup handle", async function (this: WorkflowWorld) {
  this.dependencies.createLayer = () => ({ analyze: async () => ({
    status: "failure", stage: "cleanup", code: "unavailable", message: "Analyzer cleanup failed.",
  }) });
  this.outcome = await this.workflow.loadRepository();
  assert.equal(this.outcome.status, "failure");
});

When("cleanup retry is requested", async function (this: WorkflowWorld) {
  this.outcome = await this.workflow.retryCleanup();
});

Then("another load remains blocked and restarting the application is required", async function (this: WorkflowWorld) {
  assert.ok(this.outcome?.status === "failure");
  assert.equal(this.outcome.stage, "cleanup");
  assert.match(this.outcome.message, /restart/i);
  assert.equal(this.workflow.getSnapshot().state.cleanupRecovery, "restart");
  assert.equal((await this.workflow.openDocument()).status, "busy");
});

Given("only a portable document for {string} is available", function (this: WorkflowWorld, name: string) {
  this.dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture(name));
  this.dependencies.discover = async () => { this.sourceCalls += 1; throw new Error("Source is unavailable."); };
  this.dependencies.createLayer = () => { this.sourceCalls += 1; throw new Error("Analyzer is unavailable."); };
});

When("that saved document is loaded", async function (this: WorkflowWorld) {
  this.outcome = await this.workflow.openDocument();
});

Then("{string} is current without repository access or analyzer construction", function (this: WorkflowWorld, name: string) {
  assert.equal(this.outcome?.status, "success");
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.equal(this.sourceCalls, 0);
  assert.equal(this.dependencies.access.snapshots.size, 0);
});

Given("a selected repository failed because its manifest was missing", async function (this: WorkflowWorld) {
  this.dependencies.selectRepository = async () => { this.selections += 1; return "/selected"; };
  this.restoredDiscovery = this.dependencies.discover;
  this.dependencies.discover = async () => ({
    status: "failure", stage: "discovery", code: "manifest-unreadable", message: "The manifest could not be read.", durationMs: 0,
  });
  this.outcome = await this.workflow.loadRepository();
  assert.equal(this.outcome.status, "failure");
});

Given("the missing manifest has been restored", function (this: WorkflowWorld) {
  assert.ok(this.restoredDiscovery);
  this.dependencies.discover = this.restoredDiscovery;
});

When("the load is retried", async function (this: WorkflowWorld) {
  this.outcome = await this.workflow.retry();
});

Then("the same repository loads without another selection", function (this: WorkflowWorld) {
  assert.equal(this.outcome?.status, "success");
  assert.equal(this.workflow.getSnapshot().current?.document.name, "Atlas");
  assert.equal(this.selections, 1);
});

When("export cleanup fails and {string} finishes loading", async function (this: WorkflowWorld, name: string) {
  this.workflow.documentCleanupFailed();
  assert.equal(this.workflow.getSnapshot().current?.document.name, "Previous");
  assert.equal(this.workflow.getSnapshot().state.lastOutcome, null);
  this.layout?.resolve(await this.originalLayout(architectureDocumentFixture(name)));
  this.outcome = await this.loading;
});

Then("{string} is current and its successful load waits for cleanup", async function (this: WorkflowWorld, name: string) {
  assert.equal(this.outcome?.status, "success");
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.equal(this.workflow.getSnapshot().state.lastOutcome?.status, "success");
  assert.equal(this.workflow.getSnapshot().state.cleanupRecovery, "retry");
  assert.equal((await this.workflow.openDocument()).status, "busy");
  assert.equal((await this.workflow.retryCleanup()).status, "success");
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
});

When("export cleanup fails and the load is cancelled", async function (this: WorkflowWorld) {
  this.workflow.documentCleanupFailed();
  this.outcome = await this.workflow.cancel();
});

Then("{string} is current and its cancelled replacement waits for cleanup", async function (this: WorkflowWorld, name: string) {
  assert.equal(this.outcome?.status, "cancelled");
  assert.equal(this.workflow.getSnapshot().current?.document.name, name);
  assert.equal(this.workflow.getSnapshot().state.lastOutcome?.status, "cancelled");
  assert.equal(this.workflow.getSnapshot().state.cleanupRecovery, "retry");
  assert.equal((await this.workflow.openDocument()).status, "busy");
});

Given("document cleanup is being retried", async function (this: WorkflowWorld) {
  this.cleanup = pendingDocumentOperation<void>();
  const cleaning = pendingDocumentOperation<void>();
  this.originalCleanup = this.dependencies.documents.retryCleanup.bind(this.dependencies.documents);
  this.dependencies.documents.retryCleanup = async () => {
    cleaning.resolve();
    await this.cleanup?.promise;
    return { status: "success", cleaned: true, durationMs: 0 };
  };
  this.workflow.documentCleanupFailed();
  this.loading = this.workflow.retryCleanup();
  await cleaning.promise;
});

When("another export needs cleanup before that retry finishes", async function (this: WorkflowWorld) {
  this.workflow.documentCleanupFailed();
  this.cleanup?.resolve();
  this.outcome = await this.loading;
});

Then("another load waits for a further successful cleanup retry", async function (this: WorkflowWorld) {
  assert.equal(this.outcome?.status, "failure");
  assert.equal(this.workflow.getSnapshot().state.cleanupRecovery, "retry");
  assert.equal((await this.workflow.openDocument()).status, "busy");
  assert.ok(this.originalCleanup);
  this.dependencies.documents.retryCleanup = this.originalCleanup;
  assert.equal((await this.workflow.retryCleanup()).status, "success");
  assert.equal(this.workflow.getSnapshot().state.cleanupRecovery, "none");
});
