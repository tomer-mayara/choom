import { expect, test } from "bun:test";
import { z } from "zod";
import { architectureDocumentSchema } from "../../../src/domain/architecture-document";
import { buildArchitectureDocument } from "../../../src/domain/build-architecture-document";
import { savedCycle, workspaceObservations } from "../../support/domain-model-fixtures";

test("saved declaration errors retain their component paths", () => {
  const saved = savedCycle();
  saved.components = [{ id: "src", name: "Workspace", parent: ".", reportedFiles: 0 }];
  saved.relationships = [];
  const result = architectureDocumentSchema.safeParse(saved);
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Missing root declarations must be rejected.");
  expect(result.error.issues.map(({ code, path, message }) => ({ code, path, message }))).toEqual([
    { code: "custom", path: ["components"], message: "Components must have exactly one root with ID '.'" },
    { code: "custom", path: ["components", 0, "parent"], message: "Nonroot components must reference a declared parent" },
  ]);
});

test("the builder reports duplicate names and unknown parents at the input boundary", () => {
  const input = workspaceObservations();
  const child = input.components[1];
  if (!child) throw new Error("The workspace fixture must declare a child component.");
  child.name = "atlas";
  child.parent = "missing";
  let failure: unknown;
  try {
    buildArchitectureDocument(input);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(z.ZodError);
  if (!(failure instanceof z.ZodError)) throw new Error("The builder must return declaration validation errors.");
  expect(failure.issues.map(({ code, path, message }) => ({ code, path, message }))).toEqual([
    { code: "custom", path: ["components", 1, "name"], message: "Component names must be unique" },
    { code: "custom", path: ["components", 1, "parent"], message: "Nonroot components must reference a declared parent" },
  ]);
});

test("malformed declarations retain component and relationship validation errors", () => {
  const saved = savedCycle();
  const component = saved.components[0];
  if (!component) throw new Error("The cycle fixture must declare a component.");
  component.id = "src/../ui";
  const result = architectureDocumentSchema.safeParse(saved);
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Noncanonical component paths must be rejected.");
  expect(result.error.issues.map(({ code, path, message }) => ({ code, path, message }))).toEqual([
    {
      code: "custom",
      path: ["components", 0, "id"],
      message: "Expected a canonical repository-relative directory path",
    },
    { code: "custom", path: ["relationships", 0], message: "Relationships must reference declared components" },
    { code: "custom", path: ["relationships", 0, "evidence", 0], message: "Evidence file ownership must match its relationship endpoints" },
    { code: "custom", path: ["relationships", 1], message: "Relationships must reference declared components" },
    { code: "custom", path: ["relationships", 1, "evidence", 0], message: "Evidence file ownership must match its relationship endpoints" },
  ]);
});
