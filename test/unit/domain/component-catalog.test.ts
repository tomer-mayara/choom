import { expect, test } from "bun:test";
import { ComponentCatalog } from "../../../src/domain/component-catalog";
import { workspaceObservations } from "../../support/domain-model-fixtures";

test("a catalog answers membership and deepest ownership independently of manifest parents", () => {
  const { components } = workspaceObservations();
  components.push({ id: "src/domain", name: "Domain", parent: "." });
  const catalog = new ComponentCatalog(components);
  expect(catalog.has("src/domain")).toBe(true);
  expect(catalog.has("src/lib")).toBe(false);
  expect([
    "config.ts", "src/lib/tool.ts", "src/domain/model/entity.ts", "src/domain-extra/tool.ts",
    "node_modules/pkg/index.js", "src/domain/node_modules/pkg/index.js",
  ].map((file) => catalog.ownerOf(file))).toEqual([".", "src", "src/domain", "src", undefined, undefined]);
});

test("caller mutations cannot change the catalog's declaration snapshot", () => {
  const { components } = workspaceObservations();
  const catalog = new ComponentCatalog(components);
  const child = components[1];
  if (!child) throw new Error("The workspace fixture must declare a child.");
  child.id = "other";
  child.parent = "missing";
  components.push({ id: "src/domain", name: "Domain", parent: "." });
  expect(catalog.has("src")).toBe(true);
  expect(catalog.has("other")).toBe(false);
  expect(catalog.has("src/domain")).toBe(false);
  expect(catalog.ownerOf("src/domain/model.ts")).toBe("src");
  expect(catalog.ownerOf("other/model.ts")).toBe(".");
});

test("catalog validation rejects invalid declaration trees", () => {
  const { components } = workspaceObservations();
  expect(() => ComponentCatalog.declarationsSchema.parse(components.slice(1))).toThrow("exactly one root");
  components.push({ id: "src/domain", name: "workspace", parent: "src" });
  expect(() => ComponentCatalog.declarationsSchema.parse(components)).toThrow("Component names must be unique");
});

test("catalog validation rejects noncanonical declaration roots", () => {
  const { components } = workspaceObservations();
  components.push({ id: "src/../domain", name: "Domain", parent: "." });
  expect(() => ComponentCatalog.declarationsSchema.parse(components)).toThrow("canonical repository-relative directory path");
});

test("candidate ownership preserves duplicate declarations while collecting invalid-document errors", () => {
  const catalog = new ComponentCatalog([
    { id: "", name: "First invalid root", parent: "." },
    { id: ".", name: "Root" },
    { id: "", name: "Second invalid root", parent: "." },
    { id: "src/core", name: "Core", parent: "." },
  ]);
  expect(catalog.ownerOf("/bad.ts")).toBe("");
});
