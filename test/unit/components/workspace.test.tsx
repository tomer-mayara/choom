import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../../../src/App.tsx";
import { LoadWorkflow } from "../../../src/architecture/load-workflow.ts";
import type { LoadWorkflowSnapshot, WorkflowView, WorkspaceBinding, WorkspaceExportOutcome } from "../../../src/architecture/workspace-view.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";
import { documentStorageFailure } from "../../support/document-storage-fixtures.ts";
import {
  browserWorkflowDocument, pendingDocumentOperation, repositoryWorkflowDependencies, workflowDependencies,
} from "../../support/load-workflow-fixtures.ts";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis, "isTauri");
});

function binding(workflow: WorkflowView): WorkspaceBinding {
  return { workflow, exportDocument: async () => ({ status: "success", exported: true, durationMs: 0 }) };
}

test("workspace controls accept a structural view role without lifecycle operations", async () => {
  const snapshot: LoadWorkflowSnapshot = {
    state: { phase: "idle", operation: null, stage: null, lastOutcome: null, cleanupRecovery: "none" },
    current: null,
  };
  const opened: string[] = [];
  const cancelled = async () => ({ status: "cancelled" as const, durationMs: 0 });
  const view: WorkflowView = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    loadRepository: cancelled,
    openDocument: async () => { opened.push("document"); return cancelled(); },
    cancel: cancelled,
    retry: cancelled,
    retryCleanup: cancelled,
  };
  render(<App workspace={binding(view)} />);

  fireEvent.click(screen.getByRole("button", { name: "Open Diagram" }));
  await waitFor(() => expect(opened).toEqual(["document"]));
  expect(screen.getByRole("heading", { name: "Architecture starts here." })).toBeTruthy();
});

test("browser opening commits the prepared diagram before export becomes available", async () => {
  const dependencies = workflowDependencies();
  dependencies.selectDocument = async () => browserWorkflowDocument();
  const layout = pendingDocumentOperation<void>();
  const prepare = dependencies.layout;
  dependencies.layout = async (document) => { await layout.promise; return prepare(document); };
  const workflow = new LoadWorkflow(dependencies);
  const { container } = render(<App workspace={binding(workflow)} />);

  expect(screen.queryByRole("button", { name: "Load Repo" })).toBeNull();
  expect(screen.getByRole("button", { name: "Export Diagram" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Open Diagram" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Arranging"));
  expect(screen.queryByRole("heading", { name: "Atlas" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open Diagram" }).hasAttribute("disabled")).toBe(true);
  await act(async () => { layout.resolve(); });
  expect(screen.getByRole("heading", { name: "Atlas" })).toBeTruthy();
  expect(screen.queryAllByRole("heading", { name: "Architecture starts here." }).length).toBe(0);
  expect(screen.queryAllByRole("button", { name: "Explore example" }).length).toBe(0);
  const actions = within(screen.getByRole("navigation", { name: "Workspace actions" }));
  expect(actions.getByRole("button", { name: "Open Diagram" }).hasAttribute("disabled")).toBe(false);
  expect(actions.getByRole("button", { name: "Export Diagram" }).hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("status").textContent).toBe("Diagram ready.");
  const current = workflow.getSnapshot().current;
  expect(Object.isFrozen(current?.document.components)).toBe(true);
  expect(Object.isFrozen(current?.layout.nodes[2]?.position)).toBe(true);
  const cards = [...container.querySelectorAll(".react-flow__node[data-id]")];
  expect(cards.map((node) => node.getAttribute("data-id"))).toEqual([".", "packages/core", "src"]);
  expect(cards[2]?.getAttribute("style")).toContain("translate(500px,0px)");
});

test("desktop cancellation keeps loads disabled until selection has settled", async () => {
  Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  const dependencies = workflowDependencies();
  const selection = pendingDocumentOperation<string | null>();
  dependencies.selectRepository = () => selection.promise;
  render(<App workspace={binding(new LoadWorkflow(dependencies))} />);

  expect(screen.getByText(/Only load repositories you trust/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load Repo" }));
  expect(screen.getByRole("button", { name: "Open Diagram" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("status").textContent).toContain("Cancelling");
  expect(screen.getByRole("button", { name: "Load Repo" }).hasAttribute("disabled")).toBe(true);
  await act(async () => { selection.resolve("/selected"); });
  expect(screen.getByRole("status").textContent).toContain("cancelled");
  expect(screen.getByRole("button", { name: "Load Repo" }).hasAttribute("disabled")).toBe(false);
});

test("Cancel remains available while a repository is closing before the diagram is ready", async () => {
  Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  const dependencies = repositoryWorkflowDependencies();
  const closed = pendingDocumentOperation<void>();
  const close = dependencies.closeRepository;
  dependencies.closeRepository = async (request) => { await closed.promise; return close(request); };
  const workflow = new LoadWorkflow(dependencies);
  render(<App workspace={binding(workflow)} />);
  fireEvent.click(screen.getByRole("button", { name: "Load Repo" }));
  await waitFor(() => expect(workflow.getSnapshot().state.stage).toBe("cleanup"));
  try {
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Open Diagram" }).hasAttribute("disabled")).toBe(true);
  } finally {
    await act(async () => { closed.resolve(); });
  }
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("cancelled"));
  expect(screen.queryByRole("heading", { name: "Atlas" })).toBeNull();
});

test("a failed layout retains the displayed document and retry presents the corrected result", async () => {
  const dependencies = workflowDependencies();
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Next"));
  const prepare = dependencies.layout;
  dependencies.layout = async () => { throw new Error("private layout detail"); };
  render(<App workspace={binding(workflow)} />);

  fireEvent.click(screen.getByRole("button", { name: "Open Diagram" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("diagram layout"));
  expect(screen.getByRole("heading", { name: "Previous" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).not.toContain("private layout detail");
  dependencies.layout = prepare;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Next" })).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("export captures the displayed document while another diagram can load", async () => {
  const dependencies = workflowDependencies();
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openDocument();
  const exporting = pendingDocumentOperation<WorkspaceExportOutcome>();
  const captured: string[] = [];
  const workspace: WorkspaceBinding = {
    workflow,
    exportDocument: (document) => { captured.push(document.name); return exporting.promise; },
  };
  render(<App workspace={workspace} />);

  fireEvent.click(screen.getByRole("button", { name: "Export Diagram" }));
  expect(captured).toEqual(["Previous"]);
  expect(screen.getByRole("button", { name: "Open Diagram" }).hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("button", { name: "Export Diagram" }).hasAttribute("disabled")).toBe(true);
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Next"));
  fireEvent.click(screen.getByRole("button", { name: "Open Diagram" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Next" })).toBeTruthy());
  await act(async () => { exporting.resolve({ status: "success", exported: true, durationMs: 0 }); });
  expect(screen.getByText(/Exported “Previous”/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Next" })).toBeTruthy();
});

test("cleanup recovery retains the committed diagram and gates loading until retry succeeds", async () => {
  const dependencies = repositoryWorkflowDependencies(architectureDocumentFixture("Previous"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.loadRepository();
  dependencies.selectDocument = async () => browserWorkflowDocument(architectureDocumentFixture("Next"));
  dependencies.access.releaseFailure = documentStorageFailure("cleanup-failed", "cleanup");
  render(<App workspace={binding(workflow)} />);

  fireEvent.click(screen.getByRole("button", { name: "Open Diagram" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry cleanup" })).toBeTruthy());
  expect(screen.getByRole("heading", { name: "Next" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open Diagram" }).hasAttribute("disabled")).toBe(true);
  dependencies.access.releaseFailure = undefined;
  fireEvent.click(screen.getByRole("button", { name: "Retry cleanup" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Open Diagram" }).hasAttribute("disabled")).toBe(false));
  expect(screen.getByRole("heading", { name: "Next" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
