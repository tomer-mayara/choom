import { afterEach, expect, test } from "bun:test";
import { cleanup, screen } from "@testing-library/react";
import { renderDiagramWithViewport } from "../../support/diagram-viewport.tsx";
import { showAllConnections } from "../../support/connection-controls.tsx";
import { sourceConnectionBaseline } from "../../support/source-connection-fixtures.ts";

afterEach(cleanup);

test("source connections keep complete endpoint names and explain their limited meaning", async () => {
  const baseline = sourceConnectionBaseline("different permission");
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 }, width: 240, height: 88 })) };
  await renderDiagramWithViewport(baseline, layout);
  showAllConnections();
  expect(document.querySelectorAll("path[data-interface-arc]")).toHaveLength(1);
  expect(document.querySelector("button[data-interface-label]")?.getAttribute("aria-label"))
    .toBe("Invoice API, invoice-api; consumer Checkout, checkout; owner Billing, billing");
  expect(screen.getByText("Arrow: component uses the interface in saved source.")).toBeTruthy();
  expect(screen.getByText("The canvas shows application and tooling value references. Type and test references stay in details. Source use does not prove runtime execution.")).toBeTruthy();
  expect(screen.queryByText("Arrow: consumer may use the owner's interface.")).toBeNull();
});
