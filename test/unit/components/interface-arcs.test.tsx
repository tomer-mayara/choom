import { afterEach, expect, test } from "bun:test";
import { cleanup, screen } from "@testing-library/react";
import { baselineExample } from "../../support/baseline-fixtures.ts";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { interfaceArcBaseline } from "../../support/interface-arc-fixtures.ts";

afterEach(cleanup);

test("the known interface is a named curved consumer-to-owner arrow with a permission legend", async () => {
  const baseline = baselineExample();
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 }, width: 240, height: 88 })) };
  await renderDiagramWithViewport(baseline, layout);
  const paths = document.querySelectorAll("path[data-interface-arc]");
  expect(paths).toHaveLength(1);
  expect(paths[0]?.getAttribute("data-consumer-id")).toBe("checkout");
  expect(paths[0]?.getAttribute("data-owner-id")).toBe("billing");
  expect(paths[0]?.getAttribute("d")).toMatch(/[CQ]/);
  expect(paths[0]?.getAttribute("marker-end")).toContain("url(");
  expect(document.querySelector("[data-interface-label]")?.textContent).toBe("Invoice API");
  expect(screen.getByText("Arrow: consumer may use the owner's interface.")).toBeTruthy();
});

test("bounded labels retain full interface and endpoint identities even when names repeat", async () => {
  const baseline = interfaceArcBaseline("parallel");
  for (const component of baseline.components) component.name = "Component";
  for (const item of baseline.interfaces) item.name = `Invoice ${"interface ".repeat(100)}`;
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 }, width: 240, height: 88 })) };
  await renderDiagramWithViewport(baseline, layout);
  const labels = [...document.querySelectorAll<HTMLElement>("[data-interface-label]")];
  expect(labels).toHaveLength(2);
  for (const [index, label] of labels.entries()) {
    expect(label.getAttribute("aria-label")).toBe(`${baseline.interfaces[index]?.name}, ${baseline.interfaces[index]?.id}; consumer Component, checkout; owner Component, billing`);
    expect(label.style.maxWidth).toBe("240px");
    expect(label.querySelector("span")?.className).toContain("line-clamp-2");
  }
});
