import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { interfaceViewBaseline } from "../../support/interface-view-fixtures.ts";

afterEach(cleanup);

const layout = { nodes: [
  { id: "commerce", position: { x: 0, y: 0 }, width: 300, height: 250 },
  { id: "checkout", parentId: "commerce", position: { x: 24, y: 112 }, width: 240, height: 88 },
  { id: "billing", position: { x: 600, y: 0 }, width: 240, height: 88 },
] };

function paths() {
  return [...document.querySelectorAll("path[data-interface-arc]")].map((path) => path.getAttribute("d"));
}

function consumerStart() {
  const path = document.querySelector('path[data-interface-arc][data-consumer-id="checkout"]');
  const numbers = path?.getAttribute("d")?.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/)?.slice(1).map(Number);
  if (!numbers || numbers[0] === undefined || numbers[1] === undefined) throw new Error("The consumer arc needs a visible start point.");
  return { x: numbers[0], y: numbers[1] };
}

function inspect() {
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }), { detail: 0 });
  fireEvent.click(within(screen.getByRole("region", { name: "Interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  return screen.getByRole("dialog", { name: "Interface details" });
}

test("parent and child keyboard movement update their existing arc without fitting or clearing inspection", async () => {
  const baseline = interfaceViewBaseline(true);
  const recorded = structuredClone(baseline);
  const canvas = await renderDiagramWithViewport(baseline, layout, { width: 1200, height: 800 });
  const panel = inspect();
  const before = consumerStart();
  const camera = canvas.getViewport();
  for (const name of ["Commerce, commerce", "Checkout, checkout"]) {
    fireEvent.keyDown(screen.getByRole("button", { name }), { key: "ArrowRight" });
  }
  expect(consumerStart()).toEqual({ x: before.x + 20, y: before.y });
  expect(canvas.getViewport()).toEqual(camera);
  expect(screen.getByRole("dialog")).toBe(panel);
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  expect(baseline).toEqual(recorded);
  expect(layout.nodes[0]?.position).toEqual({ x: 0, y: 0 });
});

test.each(["Escape", "blur", "Reset"])("%s restores grown ancestor bounds and arc paths and rejects the old drag release", async (ending) => {
  const canvas = await renderDiagramWithViewport(interfaceViewBaseline(true), layout, { width: 1200, height: 800 });
  const panel = inspect();
  const before = paths();
  const camera = canvas.getViewport();
  const header = screen.getByRole("button", { name: "Checkout, checkout" });
  fireEvent.pointerDown(header, { pointerId: 1, isPrimary: true, button: 0, clientX: 120, clientY: 180 });
  fireEvent.pointerMove(window, { pointerId: 1, isPrimary: true, clientX: 520, clientY: 380 });
  expect(canvas.getNode("commerce")?.width).toBeGreaterThan(300);
  expect(paths()).not.toEqual(before);
  if (ending === "Escape") fireEvent.keyDown(header, { key: "Escape" });
  else if (ending === "blur") fireEvent(window, new Event("blur"));
  else await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reset layout" }), { detail: 0 }); });
  fireEvent.pointerMove(window, { pointerId: 1, isPrimary: true, clientX: 600, clientY: 420 });
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(header, { detail: 1 });
  expect(canvas.getNode("commerce")?.width).toBe(300);
  expect(canvas.getNode("checkout")?.position).toEqual({ x: 24, y: 112 });
  expect(paths()).toEqual(before);
  expect(canvas.getViewport()).toEqual(camera);
  expect(screen.getByRole("dialog")).toBe(panel);
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
});

test("an arc revealed after its parent and child move uses their current positions", async () => {
  const canvas = await renderDiagramWithViewport(interfaceViewBaseline(true), layout, { width: 1200, height: 800 });
  inspect();
  const before = consumerStart();
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  expect(document.querySelectorAll("path[data-interface-arc]")).toHaveLength(0);
  const flow = document.querySelector<HTMLElement>(".react-flow");
  if (!flow) throw new Error("The moving components need their canvas.");
  for (const name of ["Commerce, commerce", "Checkout, checkout"]) fireEvent.keyDown(within(flow).getByRole("button", { name }), { key: "ArrowRight" });
  const movedCamera = canvas.getViewport();
  inspect();
  expect(consumerStart()).toEqual({ x: before.x + 20, y: before.y });
  expect(canvas.getViewport()).toEqual(movedCamera);
});
