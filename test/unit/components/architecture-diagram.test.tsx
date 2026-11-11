import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from "@xyflow/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { baselineExample } from "../../support/baseline-fixtures.ts";

afterEach(cleanup);
function diagramFixture() {
  const baseline = baselineExample();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 } })) };
  return { baseline, layout };
}
function CaptureViewport({ capture }: { capture: (viewport: ReactFlowInstance) => void }) {
  const viewport = useReactFlow();
  useEffect(() => capture(viewport), [capture, viewport]);
  return null;
}

test("the canvas shows exactly the modeled components at prepared positions", () => {
  const { baseline, layout } = diagramFixture();
  const { container } = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  expect(screen.getByRole("heading", { name: "baseline-example" })).toBeTruthy();
  const cards = [...container.querySelectorAll(".react-flow__node[data-id]")];
  expect(cards.map((node) => node.getAttribute("data-id"))).toEqual(["checkout", "billing"]);
  expect(cards[0]?.textContent).toContain("Create orders");
  expect(cards[1]?.getAttribute("style")).toContain("translate(300px,24px)");
  expect(screen.queryByRole("button", { name: "Findings" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Recorded analysis" })).toBeNull();
});

test("double-click opens basic component details and Escape restores focus", async () => {
  const { baseline, layout } = diagramFixture();
  render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  const component = screen.getByRole("button", { name: "Checkout, checkout" });
  fireEvent.click(component, { detail: 1 });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.doubleClick(component);
  const panel = screen.getByRole("dialog", { name: "Component details" });
  expect(panel.textContent).toContain("Create orders");
  expect(panel.textContent).not.toContain("Prepare invoices");
  fireEvent.keyDown(panel, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(component));
});

test("keyboard activation survives repeated renders and a new baseline closes old details", () => {
  const { baseline, layout } = diagramFixture();
  const { rerender } = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  fireEvent.click(screen.getByRole("button", { name: "Checkout, checkout" }), { detail: 0 });
  expect(screen.getByRole("dialog").textContent).toContain("Create orders");
  rerender(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
  rerender(<ArchitectureDiagram baseline={baselineExample()} layout={layout} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test.each([true, false])("an empty component list keeps its own model and correct empty state: allEmpty=%s", (allEmpty) => {
  const baseline = baselineExample();
  baseline.components = [];
  if (allEmpty) { baseline.interfaces = []; baseline.resources = []; baseline.rules = []; }
  const { container } = render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: [] }} />);
  expect(screen.getByRole("heading", { name: "baseline-example" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe(allEmpty ? "No architecture items modeled" : "No components modeled");
  expect(container.querySelectorAll(".react-flow__node").length).toBe(0);
});

test("keyboard focus reveals a clipped component without changing zoom or moving a visible component", async () => {
  const { baseline, layout } = diagramFixture();
  let viewport: ReactFlowInstance | undefined;
  const capture = (instance: ReactFlowInstance) => { viewport = instance; };
  render(<ReactFlowProvider initialWidth={500} initialHeight={500}>
    <ArchitectureDiagram baseline={baseline} layout={layout} />
    <CaptureViewport capture={capture} />
  </ReactFlowProvider>);
  await waitFor(() => expect(viewport?.viewportInitialized).toBe(true));
  const canvas = viewport;
  if (!canvas) throw new Error("The diagram viewport must be available.");
  await act(async () => { await canvas.setViewport({ x: 2000, y: 0, zoom: 1 }); });
  const component = screen.getByRole("button", { name: "Billing, billing" });
  act(() => component.focus());
  await waitFor(() => {
    const position = canvas.getViewport();
    const bounds = canvas.getNodesBounds(["billing"]);
    expect(position.zoom).toBe(1);
    expect(bounds.x * position.zoom + position.x).toBeGreaterThanOrEqual(0);
    expect((bounds.x + bounds.width) * position.zoom + position.x).toBeLessThanOrEqual(500);
    expect(bounds.y * position.zoom + position.y).toBeGreaterThanOrEqual(0);
    expect((bounds.y + bounds.height) * position.zoom + position.y).toBeLessThanOrEqual(500);
  });
  const visibleViewport = canvas.getViewport();
  act(() => component.blur());
  act(() => component.focus());
  expect(canvas.getViewport()).toEqual(visibleViewport);

  fireEvent.click(component, { detail: 0 });
  const panel = screen.getByRole("dialog", { name: "Component details" });
  await act(async () => { await canvas.setViewport({ x: 2000, y: 0, zoom: 1 }); });
  fireEvent.keyDown(panel, { key: "Escape" });
  await waitFor(() => expect(globalThis.document.activeElement === component).toBe(true));
  await waitFor(() => expect(canvas.getViewport()).toEqual(visibleViewport));
});
