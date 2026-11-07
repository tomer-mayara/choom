import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import type { WorkflowOperations } from "../../../src/architecture/generated/workflow.ts";
import { LoadWorkflow } from "../../../src/architecture/load-workflow.ts";
import { documentStorageFailure } from "../../support/document-storage-fixtures.ts";
import { browserWorkflowDocument, pendingDocumentOperation, repositoryWorkflowDependencies } from "../../support/load-workflow-fixtures.ts";

const schema = addFormats(new Ajv2020({ schemas: [contracts] }));
const validateState = schema.compile({ $ref: "WorkflowState.json" });
const validateOutcome = schema.compile({ $ref: "WorkflowOutcome.json" });
type AsyncOperations = {
  [Name in Exclude<keyof WorkflowOperations, "documentCleanupFailed">]: (...args: Parameters<WorkflowOperations[Name]>) => Promise<ReturnType<WorkflowOperations[Name]>>;
} & Pick<WorkflowOperations, "documentCleanupFailed">;

test("public load operations bind TypeSpec outcomes through asynchronous controls", () => {
  expectTypeOf<LoadWorkflow>().toExtend<AsyncOperations>();
});

test("emitted states and success, busy, cancellation, and failure conform to generated schemas", async () => {
  const dependencies = repositoryWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  const states = [workflow.getSnapshot().state];
  workflow.subscribe(() => { states.push(workflow.getSnapshot().state); });
  const selected = pendingDocumentOperation<string | null>();
  dependencies.selectRepository = () => selected.promise;
  const first = workflow.loadRepository();
  const busy = await workflow.openDocument();
  selected.resolve(null);
  const cancelled = await first;
  dependencies.selectRepository = async () => "/selected";
  const success = await workflow.loadRepository();
  workflow.documentCleanupFailed();
  await workflow.retryCleanup();
  dependencies.access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  dependencies.selectDocument = async () => browserWorkflowDocument();
  await workflow.openDocument();
  const cleanupFailure = workflow.getSnapshot().state.cleanupFailure;
  dependencies.access.releaseFailure = undefined;
  await workflow.retryCleanup();
  dependencies.selectDocument = async () => ({ kind: "browser", readText: async () => "schemaVersion: 2" });
  const failure = await workflow.openDocument();
  for (const outcome of [busy, cancelled, success, failure, cleanupFailure]) expect(validateOutcome(outcome)).toBe(true);
  for (const state of states) expect(validateState(state)).toBe(true);
  expect(validateState({ ...workflow.getSnapshot().state, path: "/private" })).toBe(false);
  expect(validateOutcome({ status: "failure", stage: "layout", code: "failure", message: "Failed", durationMs: -1 })).toBe(false);
  expect(states.some(({ phase }) => phase === "cleanup")).toBe(true);
  await workflow.dispose();
});

test("discovery messages with no source length bound fit the workflow failure contract", async () => {
  const dependencies = repositoryWorkflowDependencies();
  dependencies.discover = async () => ({
    status: "failure", stage: "discovery", code: "manifest-unreadable",
    message: `The manifest could not be read: ${"component/".repeat(400)}`, durationMs: 0,
  });
  const workflow = new LoadWorkflow(dependencies);
  const failure = await workflow.loadRepository();
  expect(failure).toMatchObject({ status: "failure", stage: "discovery", code: "manifest-unreadable" });
  expect(validateOutcome(failure)).toBe(true);
  expect(validateState(workflow.getSnapshot().state)).toBe(true);
});
