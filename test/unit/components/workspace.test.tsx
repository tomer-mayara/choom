import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../../../src/App.tsx";
import { LoadWorkflow, type SelectedBaseline } from "../../../src/architecture/load-workflow.ts";
import type { LoadWorkflowSnapshot, WorkflowView } from "../../../src/architecture/workspace-view.ts";
import { baselineWorkflowDependencies, pending, selectedBaseline, selectedBaselineText } from "../../support/baseline-workflow-fixtures.ts";
import { interfaceSourceFixture } from "../../support/interface-source-fixtures.ts";
import { selectInterfaceTab } from "../../support/interface-details-dom.ts";
import { selfConnectionBaseline } from "../../support/connection-scope-fixtures.ts";
import { showAllConnections, showSelfConnections } from "../../support/connection-controls.tsx";
import { duplicationWorkflow, duplicationReportText, selectedText } from "../../support/duplication-workflow-fixtures.ts";
import { parse } from "yaml";

afterEach(() => { cleanup(); Reflect.deleteProperty(globalThis, "isTauri"); });

test("controls use the view role without lifecycle or write commands", async () => {
  const snapshot: LoadWorkflowSnapshot = { state: { operation: "baseline", phase: "idle", stage: null, lastOutcome: null }, current: null, duplication: null };
  const opened: string[] = [];
  const cancelled = async () => ({ status: "cancelled" as const, durationMs: 0 });
  const workflow: WorkflowView = {
    getSnapshot: () => snapshot, subscribe: () => () => {},
    openBaseline: async () => { opened.push("baseline"); return cancelled(); }, cancel: cancelled, retry: cancelled,
    openDuplicationReport: cancelled, removeDuplicationReport: cancelled,
  };
  render(<App workspace={{ workflow }} />);
  fireEvent.click(screen.getByRole("button", { name: "Open Baseline" }));
  await waitFor(() => expect(opened).toEqual(["baseline"]));
  for (const name of ["Load Repo", "Choose directory", "Export Diagram"]) expect(screen.queryByRole("button", { name })).toBeNull();
});

test("a long saved report ID does not expand the workspace announcement", async () => {
  const { workflow, dependencies } = duplicationWorkflow();
  const report = { ...parse(duplicationReportText), id: "r".repeat(4096) };
  dependencies.selectDuplicationReport = async () => selectedText(JSON.stringify(report));
  expect((await workflow.openBaseline()).status).toBe("success");
  expect((await workflow.openDuplicationReport()).status).toBe("success");
  expect(workflow.getSnapshot().duplication?.report.id).toBe(report.id);
  render(<App workspace={{ workflow }} />);
  expect(screen.getByRole("status").textContent).toBe("Duplication report ready.");
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
  expect([...container.querySelectorAll(".react-flow__node[data-id]")].map((node) => node.getAttribute("data-id")))
    .toEqual(["checkout", "billing"]);
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
  const replacement = selectedBaselineText("formatVersion: 1\nid: replacement\nparentId: null\ncomponents: []\ninterfaces: []\nresources: []\nrules: []\n");
  dependencies.selectBaseline = async () => ({ read: async (signal) => fail
    ? { status: "failure", stage: "storage", code: "not-found", message: "The selected baseline was not found.", durationMs: 0 }
    : replacement.read(signal) });
  fireEvent.click(screen.getByRole("button", { name: "Open Baseline" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("was not found"));
  expect(screen.getByRole("heading", { name: "baseline-example" })).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "replacement" })).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
});

test.each(["canvas", "panel", "toolbar", "outside"])("successful replacement handles focus from the %s", async (target) => {
  const workflow = new LoadWorkflow(baselineWorkflowDependencies());
  await workflow.openBaseline();
  render(<App workspace={{ workflow }} />);
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  const opener = screen.getByRole("button", { name: "Open Baseline" });
  if (target === "panel") fireEvent.click(header, { detail: 0 });
  else act(() => (target === "toolbar" ? opener : header).focus());
  if (target === "outside") act(() => header.blur());
  await act(async () => { await workflow.openBaseline(); });
  const expected = target === "outside" ? document.body
    : target === "toolbar" ? opener : screen.getByRole("heading", { name: "baseline-example" });
  expect(document.activeElement === expected).toBe(true);
});

function publishedView() {
  return {
    positions: [...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((node) => node.style.transform),
    camera: document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform,
    panel: screen.queryByRole("dialog")?.textContent ?? null,
    all: screen.getByRole<HTMLInputElement>("radio", { name: "All" }).checked,
    self: screen.getByRole<HTMLInputElement>("checkbox", { name: "Show self-connections" }).checked,
    arcs: [...document.querySelectorAll("path[data-interface-arc]")].map((arc) => arc.getAttribute("d")),
  };
}

test.each(["failure", "picker cancellation", "cancelled then late result"])("a %s replacement keeps both choices and the published view", async (outcome) => {
  const dependencies = baselineWorkflowDependencies();
  dependencies.selectBaseline = async () => selectedBaseline(selfConnectionBaseline());
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openBaseline();
  render(<App workspace={{ workflow }} />);
  showAllConnections(); showSelfConnections();
  fireEvent.keyDown(screen.getByRole("button", { name: "Billing, billing" }), { key: "ArrowRight" });
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Owned interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  const before = publishedView();
  expect(before.all && before.self).toBe(true);
  if (outcome === "failure") {
    dependencies.selectBaseline = async () => ({ read: async () => ({ status: "failure", stage: "storage", code: "not-found", message: "The selected baseline was not found.", durationMs: 0 }) });
    await act(async () => { await workflow.openBaseline(); });
  } else if (outcome === "picker cancellation") {
    dependencies.selectBaseline = async () => null;
    await act(async () => { await workflow.openBaseline(); });
  } else {
    const layout = pending<void>();
    const prepare = dependencies.layout;
    dependencies.layout = async (baseline) => { await layout.promise; return prepare(baseline); };
    let loading: ReturnType<LoadWorkflow["openBaseline"]> | undefined;
    act(() => { loading = workflow.openBaseline(); });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Arranging"));
    await act(async () => { await workflow.cancel(); });
    expect(publishedView()).toEqual(before);
    await act(async () => { layout.resolve(); await loading; });
  }
  expect(publishedView()).toEqual(before);
});


test.each(["failure", "picker cancellation", "cancelled then late result"])("a %s replacement preserves a rich interface frame", async (outcome) => {
  const dependencies = baselineWorkflowDependencies();
  dependencies.selectBaseline = async () => selectedBaseline(interfaceSourceFixture("reading"));
  const workflow = new LoadWorkflow(dependencies); await workflow.openBaseline();
  render(<App workspace={{ workflow }} />);
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Owned interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  selectInterfaceTab("Sources");
  for (const name of ["Recorded statements", "Evidence references", "Original record"]) fireEvent.click(screen.getByText(name, { selector: "summary" }));
  selectInterfaceTab("Example");
  fireEvent.click(screen.getByRole("button", { name: "An empty order, empty-order" }));
  fireEvent.click(screen.getByText("Detailed result", { selector: "summary" }));
  const record = screen.getByLabelText("Record content"); record.scrollTop = 500;
  const before = screen.getByRole("dialog");
  if (outcome === "failure") dependencies.selectBaseline = async () => ({ read: async () => ({ status: "failure", stage: "storage", code: "not-found", message: "Missing baseline.", durationMs: 0 }) });
  if (outcome === "picker cancellation") dependencies.selectBaseline = async () => null;
  if (outcome === "cancelled then late result") {
    const done = pending<void>(); const prepare = dependencies.layout;
    dependencies.layout = async (baseline) => { await done.promise; return prepare(baseline); };
    let opening: ReturnType<LoadWorkflow["openBaseline"]> | undefined;
    act(() => { opening = workflow.openBaseline(); });
    await waitFor(() => expect(screen.getByText("Arranging component cards…")).toBeTruthy());
    await act(async () => { await workflow.cancel(); done.resolve(); await opening; });
  } else await act(async () => { await workflow.openBaseline(); });
  expect(screen.getByRole("dialog") === before).toBe(true);
  expect(screen.getByRole("tab", { name: "Example" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("button", { name: "An empty order, empty-order" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Detailed result", { selector: "summary" }).closest("details")?.open).toBe(true);
  expect(record.scrollTop).toBe(500);
  selectInterfaceTab("Sources");
  for (const name of ["Recorded statements", "Evidence references", "Original record"]) expect(screen.getByText(name, { selector: "summary" }).closest("details")?.open).toBe(true);
});
