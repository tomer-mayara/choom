import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { baselineExample } from "../../support/baseline-fixtures.ts";
import { baselineWithParentLevels } from "../../support/baseline-layout-fixtures.ts";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";

afterEach(cleanup);
function diagramFixture() {
  const baseline = baselineExample();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 }, width: 240, height: 120 })) };
  return { baseline, layout };
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
  const canvas = await renderDiagramWithViewport(baseline, layout);
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

test("the canvas keeps prepared group dimensions, parent order, and relative child positions", () => {
  const baseline = baselineWithParentLevels(2);
  baseline.components.reverse();
  const layout = { nodes: [
    { id: "component-0", position: { x: 12, y: 12 }, width: 2000, height: 2000 },
    { id: "component-1", position: { x: 24, y: 144 }, width: 240, height: 120, parentId: "component-0" },
  ] };
  const { container } = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  const nodes = [...container.querySelectorAll(".react-flow__node[data-id]")];
  expect(nodes.map((node) => node.getAttribute("data-id"))).toEqual(["component-0", "component-1"]);
  expect(nodes[0]?.getAttribute("style")).toContain("width: 2000px");
  expect(nodes[0]?.getAttribute("style")).toContain("height: 2000px");
  expect(nodes[1]?.getAttribute("style")).toContain("translate(36px,156px)");
  expect(screen.getByRole("button", { name: "Component 0, component-0" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Component 1, component-1" })).toBeTruthy();
});

test("keyboard focus reveals a large group header at the current zoom", async () => {
  const baseline = baselineWithParentLevels(2);
  const layout = { nodes: [
    { id: "component-0", position: { x: 12, y: 12 }, width: 2000, height: 2000 },
    { id: "component-1", position: { x: 24, y: 144 }, width: 240, height: 120, parentId: "component-0" },
  ] };
  const canvas = await renderDiagramWithViewport(baseline, layout);
  await act(async () => { await canvas.setViewport({ x: -1500, y: -1500, zoom: 1 }); });
  act(() => screen.getByRole("button", { name: "Component 0, component-0" }).focus());
  await waitFor(() => {
    const position = canvas.getViewport();
    const group = canvas.getNodesBounds(["component-0"]);
    expect(group.width).toBe(2000);
    expect(position.zoom).toBe(1);
    expect(group.x + position.x).toBeGreaterThanOrEqual(0);
    expect(group.x + 240 + position.x).toBeLessThanOrEqual(500);
    expect(group.y + position.y).toBeGreaterThanOrEqual(0);
    expect(group.y + 120 + position.y).toBeLessThanOrEqual(500);
  });
});

test("zoom controls allow a large diagram to zoom below the library default", async () => {
  const { baseline, layout } = diagramFixture();
  const distant = layout.nodes[1];
  if (!distant) throw new Error("The fixture needs a second component.");
  distant.position.x = 30_000;
  const canvas = await renderDiagramWithViewport(baseline, layout);
  for (let step = 0; step < 6; step += 1) {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Zoom Out" })); });
  }
  await waitFor(() => {
    const position = canvas.getViewport();
    expect(position.zoom).toBeLessThan(0.5);
  });
});
