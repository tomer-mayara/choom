import { describe, expect, test } from "bun:test";
import { buildArchitectureDocument } from "../../../src/domain/build-architecture-document";
import type { ArchitectureBuildInput, ImportObservation } from "../../../src/domain/generated/contracts";

function input(): ArchitectureBuildInput {
  return {
    name: "Repository",
    analysis: {
      enforcer: "substitute", version: "1.0", config: ".analyzer.json",
      inputs: ["src"], generatedAt: "2026-11-06T12:00:00Z", scopeNotes: [],
    },
    components: [
      { id: ".", name: "Repository" },
      { id: "src", name: "Workspace", parent: "." },
      { id: "packages/core", name: "Core", parent: "." },
      { id: "native", name: "Native", parent: "." },
    ],
    observations: { files: [], imports: [], diagnostics: [] },
  };
}

describe("building a semantic architecture document", () => {
  test("retains every declared component when no files were reported", () => {
    const request = input();
    request.components.push({ id: "node_modules/generated", name: "Declared external directory", parent: "." });
    const document = buildArchitectureDocument(request);
    expect(document.components).toHaveLength(request.components.length);
    expect(document.components.every(({ reportedFiles }) => reportedFiles === 0)).toBe(true);
    expect(document.relationships).toEqual([]);
  });

  test("one declaration owns several ordinary subdirectories", () => {
    const request = input();
    request.observations.files = ["src/components/panel.ts", "src/lib/format.ts", "src/hooks/use-model.ts"];
    request.observations.imports = [
      { sourceFile: "src/components/panel.ts", targetFile: "src/lib/format.ts" },
      { sourceFile: "src/lib/format.ts", targetFile: "src/hooks/use-model.ts" },
    ];
    const document = buildArchitectureDocument(request);
    expect(document.components).toEqual([
      { id: ".", name: "Repository", reportedFiles: 0 },
      { id: "native", name: "Native", parent: ".", reportedFiles: 0 },
      { id: "packages/core", name: "Core", parent: ".", reportedFiles: 0 },
      { id: "src", name: "Workspace", parent: ".", reportedFiles: 3 },
    ]);
    expect(document.relationships).toEqual([]);
  });

  test("ownership follows the deepest declared path with complete path segments", () => {
    const request = input();
    request.components.push({ id: "src/domain", name: "Domain", parent: "src" });
    request.observations.files = ["config.ts", "src/domain/model.ts", "src/domain-extra/tool.ts", "src/domain/model.ts"];
    const counts = buildArchitectureDocument(request).components.map(({ id, reportedFiles }) => [id, reportedFiles]);
    expect(counts).toEqual([[".", 1], ["native", 0], ["packages/core", 0], ["src", 1], ["src/domain", 1]]);
  });

  test("a declaration's parent does not determine ownership", () => {
    const request = input();
    request.components.push(
      { id: "src/api", name: "API", parent: "src" },
      { id: "src/core", name: "Sibling core", parent: "src/api" },
    );
    request.observations.files = ["src/api/server.ts", "src/core/model/entity.ts"];
    const document = buildArchitectureDocument(request);
    expect(document.components.find(({ id }) => id === "src/core")).toEqual({
      id: "src/core", name: "Sibling core", parent: "src/api", reportedFiles: 1,
    });
    expect(document.components.find(({ id }) => id === "src/api")?.reportedFiles).toBe(1);
  });

  test("aggregates duplicate imports and retains all file-pair variants", () => {
    const request = input();
    request.observations.files = ["src/a.ts", "src/b.ts", "packages/core/entity.ts"];
    request.observations.imports = [
      { sourceFile: "src/a.ts", targetFile: "packages/core/entity.ts", typeOnly: true },
      { sourceFile: "src/a.ts", targetFile: "packages/core/entity.ts", typeOnly: false },
      { sourceFile: "src/a.ts", targetFile: "packages/core/entity.ts", typeOnly: true },
      { sourceFile: "src/b.ts", targetFile: "packages/core/entity.ts" },
    ];
    const document = buildArchitectureDocument(request);
    expect(document.relationships).toEqual([{
      id: "imports:src:packages%2Fcore", source: "src", target: "packages/core", kind: "imports",
      evidence: [
        { sourceFile: "src/a.ts", targetFile: "packages/core/entity.ts", variants: [{ typeOnly: false }, { typeOnly: true }] },
        { sourceFile: "src/b.ts", targetFile: "packages/core/entity.ts", variants: [{}] },
      ],
    }]);
  });

  test("each optional import flag keeps false, true, and unknown distinct", () => {
    const request = input();
    request.observations.files = ["src/a.ts", "packages/core/entity.ts"];
    const values = [undefined, false, true];
    for (const typeOnly of values) {
      for (const dynamic of values) {
        for (const preCompilationOnly of values) {
          const observed: ImportObservation = { sourceFile: "src/a.ts", targetFile: "packages/core/entity.ts" };
          if (typeOnly !== undefined) observed.typeOnly = typeOnly;
          if (dynamic !== undefined) observed.dynamic = dynamic;
          if (preCompilationOnly !== undefined) observed.preCompilationOnly = preCompilationOnly;
          request.observations.imports.push(observed);
        }
      }
    }
    const variants = buildArchitectureDocument(request).relationships[0]?.evidence[0]?.variants;
    expect(variants).toHaveLength(27);
    expect(variants).toContainEqual({});
    expect(variants).toContainEqual({ typeOnly: false, dynamic: true, preCompilationOnly: false });
  });

  test("preserves reciprocal component imports", () => {
    const request = input();
    request.observations.files = ["src/a.ts", "packages/core/entity.ts"];
    request.observations.imports = [
      { sourceFile: "src/a.ts", targetFile: "packages/core/entity.ts" },
      { sourceFile: "packages/core/entity.ts", targetFile: "src/a.ts" },
    ];
    expect(buildArchitectureDocument(request).relationships.map(({ source, target }) => [source, target])).toEqual([
      ["packages/core", "src"], ["src", "packages/core"],
    ]);
  });

  test("node_modules files remain external at every directory depth", () => {
    const request = input();
    request.observations.files = ["src/a.ts", "node_modules/pkg/a.js", "src/node_modules/pkg/b.js"];
    request.observations.imports = [
      { sourceFile: "src/a.ts", targetFile: "node_modules/pkg/a.js" },
      { sourceFile: "src/node_modules/pkg/b.js", targetFile: "src/a.ts" },
      { sourceFile: "src/a.ts", targetFile: "packages/core/node_modules/unreported/a.js" },
    ];
    const document = buildArchitectureDocument(request);
    expect(document.components.find(({ id }) => id === ".")?.reportedFiles).toBe(0);
    expect(document.components.find(({ id }) => id === "src")?.reportedFiles).toBe(1);
    expect(document.relationships).toEqual([]);
  });

  test("internal imports require both endpoints in the reported file inventory", () => {
    const request = input();
    request.observations.files = ["src/a.ts"];
    request.observations.imports = [{ sourceFile: "src/a.ts", targetFile: "packages/core/entity.ts" }];
    expect(() => buildArchitectureDocument(request)).toThrow(/reported file inventory/i);
  });

  test("canonical IDs escape complete endpoints without creating intermediate components", () => {
    const request = input();
    request.components.push({ id: "src/ui #1", name: "UI", parent: "src" });
    request.observations.files = ["src/ui #1/panels/a.ts", "packages/core/deep/entity.ts"];
    request.observations.imports = [{ sourceFile: "src/ui #1/panels/a.ts", targetFile: "packages/core/deep/entity.ts" }];
    const document = buildArchitectureDocument(request);
    expect(document.relationships[0]?.id).toBe("imports:src%2Fui%20%231:packages%2Fcore");
    expect(document.components).toHaveLength(5);
  });

  test("observation order and repeated records do not change identity or mutate the request", () => {
    const request = input();
    request.observations.files = ["src/a.ts", "src/b.ts", "packages/core/entity.ts"];
    request.observations.imports = [
      { sourceFile: "src/a.ts", targetFile: "packages/core/entity.ts", typeOnly: true, dynamic: false },
      { sourceFile: "src/b.ts", targetFile: "packages/core/entity.ts" },
    ];
    const before = structuredClone(request);
    const reversed = structuredClone(request);
    reversed.components.reverse();
    reversed.observations.files.reverse();
    reversed.observations.imports.reverse();
    reversed.observations.imports.push({ dynamic: false, typeOnly: true, targetFile: "packages/core/entity.ts", sourceFile: "src/a.ts" });
    const document = buildArchitectureDocument(request);
    expect(buildArchitectureDocument(reversed)).toEqual(document);
    expect(request).toEqual(before);
    const root = request.components[0];
    if (!root) throw new Error("The test requires a root component");
    root.name = "Changed later";
    expect(document.components[0]?.name).toBe("Repository");
  });

  test("reported findings and reference-only records do not declare folders as components", () => {
    const request = input();
    request.observations.files = ["packages/core/model/entity.ts"];
    request.observations.diagnostics = [{
      code: "folder-finding", severity: "warning", message: "A reported folder finding", subjects: [
        { role: "source", kind: "folder", value: "src/components" },
        { role: "target", kind: "folder", value: "packages/core/model" },
      ],
    }];
    const document = buildArchitectureDocument(request);
    expect(document.components).toHaveLength(4);
    expect(document.components.find(({ id }) => id === "packages/core")?.reportedFiles).toBe(1);
    expect(document.diagnostics).toEqual(request.observations.diagnostics);
  });
});
