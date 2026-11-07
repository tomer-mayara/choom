import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";

afterEach(cleanup);

test("the canvas renders exactly the declared components at their prepared positions", () => {
  const document = architectureDocumentFixture();
  const layout = { nodes: document.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 24 } })) };
  const { container } = render(<ArchitectureDiagram document={document} layout={layout} />);

  expect(screen.getByRole("heading", { name: "Atlas" })).toBeTruthy();
  const cards = [...container.querySelectorAll(".react-flow__node[data-id]")];
  expect(cards.map((node) => node.getAttribute("data-id"))).toEqual([".", "packages/core", "src"]);
  expect(cards[0]?.textContent).toContain("No files reported");
  expect(cards[1]?.textContent).toContain("1 file reported");
  expect(cards[2]?.textContent).toContain("3 files reported");
  expect(cards[2]?.getAttribute("style")).toContain("translate(600px,24px)");
  expect(screen.getByRole("region", { name: "Findings" })).toBeTruthy();
});
