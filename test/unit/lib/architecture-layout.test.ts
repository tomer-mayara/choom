import { expect, test } from "bun:test";
import { layoutArchitectureDocument } from "../../../src/lib/architecture-layout.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";

test("layout places every declared component without deriving cards from file or folder paths", async () => {
  const document = architectureDocumentFixture();
  document.components.push({ id: "native", name: "Native shell", parent: ".", reportedFiles: 0 });
  const original = structuredClone(document);
  const layout = await layoutArchitectureDocument(document);

  expect(layout.nodes.map(({ id }) => id)).toEqual([".", "packages/core", "src", "native"]);
  expect(layout.nodes.every(({ position }) => Number.isFinite(position.x) && Number.isFinite(position.y))).toBe(true);
  expect(new Set(layout.nodes.map(({ position }) => `${position.x}:${position.y}`)).size).toBe(4);
  expect(document).toEqual(original);
});

test("layout accepts directed dependency cycles and disconnected declared components", async () => {
  const document = architectureDocumentFixture();
  document.relationships.push({
    id: "imports:packages%2Fcore:src", source: "packages/core", target: "src", kind: "imports",
    evidence: [{ sourceFile: "packages/core/model/entity.ts", targetFile: "src/lib/format.ts", variants: [{}] }],
  });
  const layout = await layoutArchitectureDocument(document);

  expect(layout.nodes.map(({ id }) => id)).toEqual(document.components.map(({ id }) => id));
  expect(layout.nodes.every(({ position }) => position.x >= 0 && position.y >= 0)).toBe(true);
});
