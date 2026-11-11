import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../../../src/App.tsx";
import { LoadWorkflow, type SelectedBaseline } from "../../../src/architecture/load-workflow.ts";
import type { LoadWorkflowSnapshot, WorkflowView } from "../../../src/architecture/workspace-view.ts";
import { baselineWorkflowDependencies, pending } from "../../support/baseline-workflow-fixtures.ts";

afterEach(() => { cleanup(); Reflect.deleteProperty(globalThis, "isTauri"); });

test("controls use the view role without lifecycle or write commands", async () => {
  const snapshot: LoadWorkflowSnapshot = { state: { phase: "idle", stage: null, lastOutcome: null }, current: null };
  const opened: string[] = [];
  const cancelled = async () => ({ status: "cancelled" as const, durationMs: 0 });
  const workflow: WorkflowView = {
    getSnapshot: () => snapshot, subscribe: () => () => {},
    openBaseline: async () => { opened.push("baseline"); return cancelled(); }, cancel: cancelled, retry: cancelled,
  };
  render(<App workspace={{ workflow }} />);
  fireEvent.click(screen.getByRole("button", { name: "Open Baseline" }));
  await waitFor(() => expect(opened).toEqual(["baseline"]));
  for (const name of ["Load Repo", "Choose directory", "Export Diagram"]) expect(screen.queryByRole("button", { name })).toBeNull();
});

test("opening publishes the prepared baseline only after layout finishes", async () => {
  const dependencies = baselineWorkflowDependencies();
  const layout = pending<void>();
  const prepare = dependencies.layout;
  dependencies.layout = async (baseline) => { await layout.promise; return prepare(baseline); };
  const workflow = new LoadWorkflow(dependencies);
  const { container } = render(<App workspace={{ workflow }} />);
  fireEvent.click(screen.getByRole("button", { name: "Open Baseline" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Arranging"));
  expect(screen.queryByRole("heading", { name: "baseline-example" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open Baseline" }).hasAttribute("disabled")).toBe(true);
  await act(async () => { layout.resolve(); });
  expect(screen.getByRole("heading", { name: "baseline-example" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Explore example" })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Baseline ready.");
  expect([...container.querySelectorAll(".react-flow__node[data-id]")].map((node) => node.getAttribute("data-id"))).toEqual(["checkout", "billing"]);
});

test("native picker cancellation keeps opening disabled until selection settles", async () => {
  Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  const dependencies = baselineWorkflowDependencies();
  const selection = pending<SelectedBaseline | null>();
  dependencies.selectBaseline = () => selection.promise;
  render(<App workspace={{ workflow: new LoadWorkflow(dependencies) }} />);
  fireEvent.click(screen.getByRole("button", { name: "Open Baseline" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("status").textContent).toContain("file picker");
  expect(screen.getByRole("button", { name: "Open Baseline" }).hasAttribute("disabled")).toBe(true);
  await act(async () => { selection.resolve(null); });
  expect(screen.getByRole("status").textContent).toBe("Load cancelled.");
  expect(screen.getByRole("button", { name: "Open Baseline" }).hasAttribute("disabled")).toBe(false);
});

test("a failed replacement keeps the current view and Retry uses the same selected file", async () => {
  const dependencies = baselineWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openBaseline();
  render(<App workspace={{ workflow }} />);
  let fail = true;
  dependencies.selectBaseline = async () => ({ read: async () => fail
    ? { status: "failure", stage: "storage", code: "not-found", message: "The selected baseline was not found.", durationMs: 0 }
    : { status: "success", text: "formatVersion: 1\nid: replacement\nparentId: null\ncomponents: []\ninterfaces: []\nresources: []\nrules: []\n", durationMs: 0 } });
  fireEvent.click(screen.getByRole("button", { name: "Open Baseline" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("was not found"));
  expect(screen.getByRole("heading", { name: "baseline-example" })).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "replacement" })).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
});
