import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from "@xyflow/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";

afterEach(cleanup);

function diagramFixture() {
  const document = architectureDocumentFixture();
  const layout = { nodes: document.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 } })) };
  return { document, layout };
}

function CaptureViewport({ capture }: { capture: (viewport: ReactFlowInstance) => void }) {
  const viewport = useReactFlow();
  useEffect(() => capture(viewport), [capture, viewport]);
  return null;
}

test("the canvas renders exactly the declared components at their prepared positions", () => {
  const { document, layout } = diagramFixture();
  const { container } = render(<ArchitectureDiagram document={document} layout={layout} />);

  expect(screen.getByRole("heading", { name: "Atlas" })).toBeTruthy();
  const cards = [...container.querySelectorAll(".react-flow__node[data-id]")];
  expect(cards.map((node) => node.getAttribute("data-id"))).toEqual([".", "packages/core", "src"]);
  expect(cards[0]?.textContent).toContain("No files reported");
  expect(cards[1]?.textContent).toContain("1 file reported");
  expect(cards[2]?.textContent).toContain("3 files reported");
  expect(cards[2]?.getAttribute("style")).toContain("translate(600px,24px)");
  expect(screen.queryByRole("region", { name: "Findings" }) === null).toBe(true);
  expect(screen.queryByRole("region", { name: "Recorded analysis" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Declared components" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Imports" })).toBeNull();
});

test("recorded analysis opens on request and closing returns focus to its button", async () => {
  const { document, layout } = diagramFixture();
  render(<ArchitectureDiagram document={document} layout={layout} />);
  const trigger = screen.getByRole("button", { name: "Recorded analysis" });
  fireEvent.click(trigger);

  const panel = screen.getByRole("dialog", { name: "Recorded analysis" });
  expect(panel.textContent).toContain(document.analysis.config);
  expect(panel.textContent).toContain(document.analysis.version);
  expect(within(panel).queryByRole("region", { name: "Imports" })).toBeNull();
  fireEvent.click(within(panel).getByRole("button", { name: "Close details" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(globalThis.document.activeElement).toBe(trigger));
});

test("a pointer double-click opens only that component's declaration and imports", async () => {
  const { document, layout } = diagramFixture();
  render(<ArchitectureDiagram document={document} layout={layout} />);
  const component = screen.getByRole("button", { name: "Workspace, src" });
  fireEvent.click(component, { detail: 1 });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.doubleClick(component);

  const panel = screen.getByRole("dialog", { name: "Component details" });
  const declaration = within(panel).getByRole("region", { name: "Declared components" });
  expect(declaration.textContent).toContain("Workspace");
  expect(declaration.textContent).toContain("src");
  expect(declaration.textContent).toContain("3 files reported");
  expect(declaration.textContent).not.toContain("Core");
  expect(within(panel).getByRole("region", { name: "Imports" }).textContent).toContain("src/components/panel.ts");
  fireEvent.keyDown(panel, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(globalThis.document.activeElement).toBe(component));
});

test("keyboard activation opens component details and repeated renders preserve them", () => {
  const { document, layout } = diagramFixture();
  const { rerender } = render(<ArchitectureDiagram document={document} layout={layout} />);
  const component = screen.getByRole("button", { name: "Atlas, ." });
  // Native buttons send a click with detail zero for keyboard activation.
  fireEvent.click(component, { detail: 0 });
  expect(screen.getByRole("dialog", { name: "Component details" }).textContent).toContain("No imports involving this component were reported.");
  rerender(<ArchitectureDiagram document={document} layout={layout} />);
  expect(screen.getByRole("dialog", { name: "Component details" })).toBeTruthy();

  rerender(<ArchitectureDiagram document={architectureDocumentFixture("Replacement")} layout={layout} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("global findings remain available independently of component imports", () => {
  const { document, layout } = diagramFixture();
  render(<ArchitectureDiagram document={document} layout={layout} />);
  fireEvent.click(screen.getByRole("button", { name: "Findings" }));
  const panel = screen.getByRole("dialog", { name: "Findings" });
  expect(panel.textContent).toContain("The two folders depend on each other.");
  expect(panel.textContent).toContain("Source folder: src/components");
  expect(within(panel).queryByRole("region", { name: "Declared components" })).toBeNull();
});

test("keyboard focus reveals a clipped component without changing zoom or moving a visible component", async () => {
  const { document, layout } = diagramFixture();
  let viewport: ReactFlowInstance | undefined;
  const capture = (instance: ReactFlowInstance) => { viewport = instance; };
  render(<ReactFlowProvider initialWidth={500} initialHeight={500}>
    <ArchitectureDiagram document={document} layout={layout} />
    <CaptureViewport capture={capture} />
  </ReactFlowProvider>);
  await waitFor(() => expect(viewport?.viewportInitialized).toBe(true));
  const canvas = viewport;
  if (!canvas) throw new Error("The diagram viewport must be available.");
  await act(async () => { await canvas.setViewport({ x: 2000, y: 0, zoom: 1 }); });
  const component = screen.getByRole("button", { name: "Core, packages/core" });
  act(() => component.focus());
  await waitFor(() => {
    const position = canvas.getViewport();
    const bounds = canvas.getNodesBounds(["packages/core"]);
    expect(position.zoom).toBe(1);
    expect(bounds.x * position.zoom + position.x).toBeGreaterThanOrEqual(0);
    expect((bounds.x + bounds.width) * position.zoom + position.x).toBeLessThanOrEqual(500);
    expect(bounds.y * position.zoom + position.y).toBeGreaterThanOrEqual(0);
    expect((bounds.y + bounds.height) * position.zoom + position.y).toBeLessThanOrEqual(500);
  });
  const visibleViewport = canvas.getViewport();
  act(() => screen.getByRole("button", { name: "Recorded analysis" }).focus());
  act(() => component.focus());
  expect(canvas.getViewport()).toEqual(visibleViewport);

  fireEvent.click(component, { detail: 0 });
  const panel = screen.getByRole("dialog", { name: "Component details" });
  await act(async () => { await canvas.setViewport({ x: 2000, y: 0, zoom: 1 }); });
  fireEvent.keyDown(panel, { key: "Escape" });
  await waitFor(() => expect(globalThis.document.activeElement === component).toBe(true));
  await waitFor(() => expect(canvas.getViewport()).toEqual(visibleViewport));
});
