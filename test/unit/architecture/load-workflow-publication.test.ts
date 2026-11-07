import { expect, test } from "bun:test";
import { LoadWorkflow } from "../../../src/architecture/load-workflow.ts";
import type { ArchitectureDocument } from "../../../src/domain/generated/contracts.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";
import { documentStorageFailure } from "../../support/document-storage-fixtures.ts";
import {
  browserWorkflowDocument, pendingDocumentOperation, repositoryWorkflowDependencies, workflowDependencies,
} from "../../support/load-workflow-fixtures.ts";

function overwrite(target: object, key: PropertyKey, value: unknown): void {
  const writable = target as Record<PropertyKey, unknown>;
  writable[key] = value;
}

test("an observer cannot clear a cleanup gate through the published state", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  dependencies.access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  await workflow.loadRepository();
  const observed = workflow.getSnapshot();
  const current = observed.current;

  expect(() => overwrite(observed.state, "cleanupRecovery", "none")).toThrow(TypeError);
  expect(() => overwrite(observed, "state", { cleanupRecovery: "none" })).toThrow(TypeError);
  expect(workflow.getSnapshot().current).toBe(current);
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("retry");
  expect(await workflow.loadRepository()).toMatchObject({ status: "busy" });
  dependencies.access.releaseFailure = undefined;
  expect(await workflow.retryCleanup()).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().current).toBe(current);
  await workflow.dispose();
});

test("published document collections, findings, and positions cannot be mutated", async () => {
  const dependencies = workflowDependencies();
  dependencies.selectDocument = async () => browserWorkflowDocument();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  const current = workflow.getSnapshot().current;
  if (!current) throw new Error("Expected a committed diagram");
  const expected = structuredClone(current);
  const targets: Array<[object | undefined, PropertyKey, unknown]> = [
    [current, "document", architectureDocumentFixture("Changed")],
    [current.document, "name", "Changed"],
    [current.document.analysis.inputs, 0, "changed"],
    [current.document.components[1], "id", "changed"],
    [current.document.relationships[0]?.evidence[0]?.variants[0], "typeOnly", true],
    [current.document.diagnostics[0]?.subjects[0], "value", "changed"],
    [current.document.diagnostics[0]?.cycle, 0, { kind: "folder", value: "changed" }],
    [current.document.diagnostics[0]?.metrics, "__proto__", 42],
    [current.layout.nodes[0]?.position, "x", 12345],
    [current.layout.nodes, "length", 0],
  ];
  for (const [target, key, value] of targets) {
    if (!target) throw new Error("Expected nested fixture data");
    expect(() => overwrite(target, key, value)).toThrow(TypeError);
  }
  expect(workflow.getSnapshot().current).toEqual(expected);
  expect(Object.hasOwn(current.document.diagnostics[0]?.metrics ?? {}, "__proto__")).toBe(true);
  await workflow.dispose();
});

test("commit owns copies without freezing document and layout references held by a collaborator", async () => {
  const dependencies = workflowDependencies();
  dependencies.selectDocument = async () => browserWorkflowDocument();
  const retained: { document?: ArchitectureDocument } = {};
  const layout = { nodes: architectureDocumentFixture().components.map(({ id }) => ({ id, position: { x: 1, y: 2 } })) };
  dependencies.layout = async (document) => { retained.document = document; return layout; };
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  const current = workflow.getSnapshot().current;
  if (!current || !retained.document) throw new Error("Expected layout to receive a document");
  const expected = structuredClone(current);

  expect(current.document).not.toBe(retained.document);
  expect(current.layout).not.toBe(layout);
  retained.document.name = "Changed by layout";
  retained.document.components.splice(0);
  const metrics = retained.document.diagnostics[0]?.metrics;
  if (!metrics) throw new Error("Expected finding metrics");
  metrics["__proto__"] = 42;
  const node = layout.nodes[0];
  if (!node) throw new Error("Expected a position");
  node.position.x = 12345;
  layout.nodes.splice(1);

  expect(workflow.getSnapshot().current).toEqual(expected);
  expect(Object.isFrozen(retained.document)).toBe(false);
  expect(Object.isFrozen(layout)).toBe(false);
  await workflow.dispose();
});

test("a publication copy failure preserves the current diagram and releases the candidate", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  const current = workflow.getSnapshot().current;
  const retainedSnapshots = [...dependencies.access.snapshots.keys()];
  const prepare = dependencies.layout;
  dependencies.layout = async (document) => new Proxy(await prepare(document), {});

  expect(await workflow.loadRepository()).toMatchObject({ status: "failure", stage: "layout" });
  expect(workflow.getSnapshot().current).toBe(current);
  expect([...dependencies.access.snapshots.keys()]).toEqual(retainedSnapshots);
  expect(workflow.getSnapshot().state.cleanupRecovery).toBe("none");
  await workflow.dispose();
  expect(dependencies.access.snapshots.size).toBe(0);
});

test("cancel during postcommit cleanup cannot expose a mutable successful outcome", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  const release = pendingDocumentOperation<void>();
  dependencies.access.releaseGate = release.promise;
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Current"));
  const loading = workflow.openDocument();
  await dependencies.access.releaseStarted.promise;
  try {
    const outcome = await workflow.cancel();
    if (!outcome) throw new Error("Expected the committed outcome");
    expect(outcome.status).toBe("success");
    expect(() => overwrite(outcome, "status", "cancelled")).toThrow(TypeError);
    expect(workflow.getSnapshot().state.lastOutcome?.status).toBe("success");
  } finally {
    release.resolve();
  }
  expect(await loading).toMatchObject({ status: "success" });
  expect(workflow.getSnapshot().current?.document.name).toBe("Current");
  expect(workflow.getSnapshot().state.lastOutcome?.status).toBe("success");
  await workflow.dispose();
});

test("returned failure outcomes and published failure details cannot alter retained state", async () => {
  const dependencies = repositoryWorkflowDependencies();
  dependencies.discover = async () => ({
    status: "failure", stage: "discovery", code: "manifest-unreadable", message: "The manifest could not be read.", durationMs: 0,
  });
  const workflow = new LoadWorkflow(dependencies);
  const outcome = await workflow.loadRepository();
  expect(() => overwrite(outcome, "message", "Changed")).toThrow(TypeError);
  expect(workflow.getSnapshot().state.lastOutcome).toMatchObject({ message: "The manifest could not be read." });
  workflow.documentCleanupFailed();
  const failure = workflow.getSnapshot().state.cleanupFailure;
  if (!failure) throw new Error("Expected a cleanup failure");
  expect(() => overwrite(failure, "code", "changed")).toThrow(TypeError);
  expect(workflow.getSnapshot().state.cleanupFailure?.code).toBe("cleanup-failed");
  await workflow.retryCleanup();
  await workflow.dispose();
});

test("snapshot reads are stable and later state publications reuse the committed graph", async () => {
  const dependencies = workflowDependencies();
  dependencies.selectDocument = async () => browserWorkflowDocument();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  const initial = workflow.getSnapshot();
  expect(workflow.getSnapshot()).toBe(initial);
  const selected = pendingDocumentOperation<string | null>();
  dependencies.selectRepository = () => selected.promise;
  const loading = workflow.loadRepository();
  const pending = workflow.getSnapshot();
  expect(pending).not.toBe(initial);
  expect(workflow.getSnapshot()).toBe(pending);
  expect(pending.current).toBe(initial.current);
  selected.resolve(null);
  await loading;
  expect(workflow.getSnapshot().current).toBe(initial.current);
  await workflow.dispose();
});
