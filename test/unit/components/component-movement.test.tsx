import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { baselineExample } from "../../support/baseline-fixtures.ts";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { useEffect } from "react";
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from "@xyflow/react";

afterEach(cleanup);

function fixture() {
  const baseline = baselineExample();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 300, y: 24 }, width: 240, height: 88,
  })) };
  return { baseline, layout };
}

function press(header: HTMLElement) {
  fireEvent.pointerDown(header, { pointerId: 1, isPrimary: true, button: 0, clientX: 120, clientY: 50 });
}
function move() {
  fireEvent.pointerMove(window, { pointerId: 1, isPrimary: true, clientX: 155, clientY: 75 });
}
function release(header: HTMLElement) {
  fireEvent.pointerUp(window, { pointerId: 1, isPrimary: true, clientX: 155, clientY: 75 });
  fireEvent.click(header, { detail: 1 });
}
function position(id: string): string | undefined {
  return document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)?.style.transform;
}

function CaptureCanvas({ ready }: { ready: (canvas: ReactFlowInstance) => void }) {
  const canvas = useReactFlow();
  useEffect(() => { if (canvas.viewportInitialized) ready(canvas); }, [canvas, ready]);
  return null;
}

test("arrow movement changes ten diagram units, announces the move, and keeps focus", async () => {
  const { baseline, layout } = fixture();
  const canvas = await renderDiagramWithViewport(baseline, layout);
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  act(() => header.focus());
  fireEvent.keyDown(header, { key: "ArrowRight" });
  expect(canvas.getNode("checkout")?.position).toEqual({ x: 10, y: 24 });
  expect(document.activeElement === header).toBe(true);
  expect(screen.getByLabelText("Component position").textContent).toContain("Checkout");
  expect(screen.queryByRole("dialog") === null).toBe(true);
});

test("drag release does not replace inspection, while a new pointer click does", () => {
  const { baseline, layout } = fixture();
  render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }), { detail: 0 });
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  const before = position("checkout");
  press(header);
  move();
  release(header);
  expect(position("checkout")).not.toBe(before);
  expect(screen.getByRole("dialog").textContent).toContain("Billing");
  expect(screen.getByLabelText("Component position").textContent).toBe("");
  press(header);
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(header, { detail: 1 });
  expect(screen.getByRole("dialog").textContent).toContain("Checkout");
});

test.each(["Escape", "blur"])("%s restores a drag and suppresses its release click", (cause) => {
  const { baseline, layout } = fixture();
  render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }), { detail: 0 });
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  const before = position("checkout");
  press(header);
  move();
  expect(position("checkout")).not.toBe(before);
  if (cause === "Escape") fireEvent.keyDown(header, { key: "Escape" });
  else fireEvent(window, new Event("blur"));
  move();
  release(header);
  expect(position("checkout")).toBe(before);
  expect(screen.getByRole("dialog").textContent).toContain("Billing");
});

test.each([false, true])("reused IDs ignore the old pointer cycle after replacement: crossedThreshold=%s", (dragging) => {
  const { baseline, layout } = fixture();
  const view = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  press(header);
  if (dragging) move();
  view.rerender(<ArchitectureDiagram baseline={structuredClone(baseline)} layout={structuredClone(layout)} />);
  const freshPosition = position("checkout");
  move();
  release(screen.getByRole("button", { name: "Checkout, checkout" }));
  expect(position("checkout")).toBe(freshPosition);
  expect(screen.queryByRole("dialog") === null).toBe(true);
});

test("keyboard focus reveals an oversized header's leading edge at unchanged zoom", async () => {
  const { baseline, layout } = fixture();
  const canvas = await renderDiagramWithViewport(baseline, layout, { width: 320, height: 500 });
  await act(async () => { await canvas.setViewport({ x: 2000, y: 1000, zoom: 2 }); });
  act(() => screen.getByRole("button", { name: "Billing, billing" }).focus());
  await waitFor(() => {
    const viewport = canvas.getViewport();
    const bounds = canvas.getNodesBounds(["billing"]);
    expect(viewport.zoom).toBe(2);
    expect(bounds.x * viewport.zoom + viewport.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x * viewport.zoom + viewport.x).toBeLessThan(30);
  });
});

test("a new layout paired with the same baseline starts fresh geometry and inspection", () => {
  const { baseline, layout } = fixture();
  const view = render(<ArchitectureDiagram baseline={baseline} layout={layout} />);
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  const before = position("checkout");
  press(header);
  move();
  release(header);
  fireEvent.click(header, { detail: 0 });
  expect(screen.queryByRole("dialog") !== null).toBe(true);
  view.rerender(<ArchitectureDiagram baseline={baseline} layout={structuredClone(layout)} />);
  expect(position("checkout")).toBe(before);
  expect(screen.queryByRole("dialog") === null).toBe(true);
});

test.each([500, 1280])("a new baseline paired with the same layout starts a fresh camera at canvas width %s", async (width) => {
  const { baseline, layout } = fixture();
  let canvas: ReactFlowInstance | undefined;
  const ready = (value: ReactFlowInstance) => { canvas = value; };
  const view = render(<ReactFlowProvider initialWidth={500} initialHeight={500}>
    <ArchitectureDiagram baseline={baseline} layout={layout} /><CaptureCanvas ready={ready} />
  </ReactFlowProvider>);
  await waitFor(() => expect(canvas?.getViewport()).toEqual({ x: 24, y: 0, zoom: 1 }));
  await act(async () => { await canvas?.setViewport({ x: 800, y: 600, zoom: 0.5 }); });
  if (width === 1280) {
    const flow = document.querySelector<HTMLElement>(".react-flow");
    if (!flow) throw new Error("The rendered canvas must exist.");
    flow.getBoundingClientRect = () => new DOMRect(0, 0, width, 500);
  }
  view.rerender(<ReactFlowProvider initialWidth={500} initialHeight={500}>
    <ArchitectureDiagram baseline={structuredClone(baseline)} layout={layout} /><CaptureCanvas ready={ready} />
  </ReactFlowProvider>);
  const expected = width === 500 ? { x: 24, y: 0, zoom: 1 } : { x: 370, y: 182, zoom: 1 };
  await waitFor(() => expect(canvas?.getViewport()).toEqual(expected));
});
