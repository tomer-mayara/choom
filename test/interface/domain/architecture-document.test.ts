import { expect, expectTypeOf, test } from "bun:test";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import type { z } from "zod";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { architectureDocumentSchema } from "../../../src/domain/architecture-document";
import { buildArchitectureDocument } from "../../../src/domain/build-architecture-document";
import type {
  ArchitectureBuildInput,
  ArchitectureDocument,
} from "../../../src/domain/generated/contracts";
import { savedCycle, workspaceObservations } from "../../support/domain-model-fixtures";

const validateStructure = addFormats(new Ajv2020({ schemas: [contracts] }))
  .compile({ $ref: "ArchitectureDocument.json" });

test("the public builder and validator use the generated document contract", () => {
  expectTypeOf<z.output<typeof architectureDocumentSchema>>().toEqualTypeOf<ArchitectureDocument>();
  expectTypeOf<Parameters<typeof buildArchitectureDocument>[0]>()
    .toEqualTypeOf<ArchitectureBuildInput>();
  expectTypeOf<ReturnType<typeof buildArchitectureDocument>>().toEqualTypeOf<ArchitectureDocument>();
});

test("saved data and builder output conform to the emitted document schema", () => {
  const saved: unknown = parse(readFileSync(
    "test/fixtures/architecture-import/declared-components.choom.yaml", "utf8",
  ));
  for (const input of [saved, savedCycle(), buildArchitectureDocument(workspaceObservations())]) {
    expect(validateStructure(input)).toBe(true);
    const document = architectureDocumentSchema.parse(input);
    expect(validateStructure(document)).toBe(true);
    expect(architectureDocumentSchema.parse(document)).toEqual(document);
  }
});

test.each([
  ["wrong version", { schemaVersion: 2 }],
  ["missing provenance", { analysis: undefined }],
  ["unknown root field", { viewport: { x: 0, y: 0 } }],
  ["fractional file count", { components: [{ id: ".", name: "Atlas", reportedFiles: 0.5 }] }],
  ["negative file count", { components: [{ id: ".", name: "Atlas", reportedFiles: -1 }] }],
  ["unsafe file count", { components: [{ id: ".", name: "Atlas", reportedFiles: 2 ** 53 }] }],
  ["unknown component field", { components: [{ id: ".", name: "Atlas", reportedFiles: 0, path: "." }] }],
  ["invalid timestamp", { analysis: { ...workspaceObservations().analysis, generatedAt: "yesterday" } }],
  ["lowercase timestamp", { analysis: { ...workspaceObservations().analysis, generatedAt: "2026-11-06t12:00:00z" } }],
  ["leap-second timestamp", { analysis: { ...workspaceObservations().analysis, generatedAt: "2016-12-31T23:59:60Z" } }],
  ["unknown provenance field", { analysis: { ...workspaceObservations().analysis, sessionRoot: "/repo" } }],
])("the structural and semantic boundaries reject %s", (_label, change) => {
  const input = { ...savedCycle(), ...change };
  expect(validateStructure(input)).toBe(false);
  expect(architectureDocumentSchema.safeParse(input).success).toBe(false);
});

test.each([
  ["empty variants", []],
  ["null flag", [{ typeOnly: null }]],
  ["unknown flag", [{ typeOnly: true, runtime: false }]],
  ["duplicate variants", [{}, {}]],
])("nested evidence rejects %s at both boundaries", (_label, variants) => {
  const input = savedCycle();
  const evidence = input.relationships[0]?.evidence[0];
  if (!evidence) throw new Error("The saved cycle must contain import evidence.");
  Object.assign(evidence, { variants });
  expect(validateStructure(input)).toBe(false);
  expect(architectureDocumentSchema.safeParse(input).success).toBe(false);
});

test("graph consistency belongs to the shared runtime validator", () => {
  const input = savedCycle();
  input.components.push({ id: ".", name: "another root", reportedFiles: 0 });
  expect(validateStructure(input)).toBe(true);
  expect(architectureDocumentSchema.safeParse(input).success).toBe(false);
});

test("the generated metrics map and runtime retain every finite own key", () => {
  const input = savedCycle();
  const metrics = Object.fromEntries([["__proto__", 1], ["constructor", 2], ["ordinary", 3]]);
  input.diagnostics.push({ code: "metrics", severity: "info", message: "Reported metrics", subjects: [], metrics });
  expect(validateStructure(input)).toBe(true);
  const parsed = architectureDocumentSchema.parse(input).diagnostics[0]?.metrics;
  expect(parsed).toEqual(metrics);
  expect(Object.hasOwn(parsed ?? {}, "__proto__")).toBe(true);
});
