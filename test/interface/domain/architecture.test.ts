import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import type { z } from "zod";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import {
  architectureSchema,
  starterArchitecture,
  type Architecture,
} from "../../../src/domain/architecture";

const validateStructure = new Ajv2020({ schemas: [contracts] }).compile({
  $ref: "Architecture.json",
});

test("the runtime parser output exactly matches the TypeSpec architecture", () => {
  expectTypeOf<z.output<typeof architectureSchema>>().toEqualTypeOf<Architecture>();
});

test("the emitted schema and runtime parser accept valid graph structures", () => {
  for (const input of [
    starterArchitecture,
    { name: " ", nodes: [{ id: " ", label: " " }], edges: [] },
  ]) {
    expect(validateStructure(input)).toBe(true);
    expect(architectureSchema.parse(input)).toEqual(input);
  }
});

test.each([
  ["missing graph name", { nodes: starterArchitecture.nodes, edges: [] }],
  ["missing nodes", { name: "Graph", edges: [] }],
  ["missing edges", { name: "Graph", nodes: starterArchitecture.nodes }],
  ["wrong name type", { ...starterArchitecture, name: 1 }],
  ["wrong nodes type", { ...starterArchitecture, nodes: {} }],
  ["wrong edges type", { ...starterArchitecture, edges: null }],
  ["missing node label", { name: "Graph", nodes: [{ id: "a" }], edges: [] }],
  ["wrong node ID type", { name: "Graph", nodes: [{ id: 1, label: "A" }], edges: [] }],
  ["missing edge target", { ...starterArchitecture, edges: [{ id: "e", source: "ui" }] }],
  ["wrong edge target type", { ...starterArchitecture, edges: [{ id: "e", source: "ui", target: 1 }] }],
  ["empty graph name", { ...starterArchitecture, name: "" }],
  ["empty node ID", { name: "Graph", nodes: [{ id: "", label: "A" }], edges: [] }],
  ["empty node label", { name: "Graph", nodes: [{ id: "a", label: "" }], edges: [] }],
  ["empty edge ID", { ...starterArchitecture, edges: [{ id: "", source: "ui", target: "domain" }] }],
  ["empty edge source", { ...starterArchitecture, edges: [{ id: "e", source: "", target: "domain" }] }],
  ["empty edge target", { ...starterArchitecture, edges: [{ id: "e", source: "ui", target: "" }] }],
  ["empty nodes", { name: "Graph", nodes: [], edges: [] }],
])("the emitted schema and runtime parser reject %s", (_name, input) => {
  expect(validateStructure(input)).toBe(false);
  expect(architectureSchema.safeParse(input).success).toBe(false);
});

test("open schema inputs are normalized by the runtime parser", () => {
  const input = {
    ...starterArchitecture,
    extra: "ignored",
    nodes: starterArchitecture.nodes.map((node) => ({ ...node, extra: "ignored" })),
    edges: starterArchitecture.edges.map((edge) => ({ ...edge, extra: "ignored" })),
  };

  expect(validateStructure(input)).toBe(true);
  expect(architectureSchema.parse(input)).toEqual(starterArchitecture);
});

test("the runtime parser enforces references beyond the structural schema", () => {
  const input = {
    ...starterArchitecture,
    edges: [{ id: "dangling", source: "ui", target: "missing" }],
  };

  expect(validateStructure(input)).toBe(true);
  expect(architectureSchema.safeParse(input).success).toBe(false);
});
