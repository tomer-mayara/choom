import { describe, expect, test } from "bun:test";
import { architectureDocumentSchema } from "../../../src/domain/architecture-document";
import type { ArchitectureDocument, ComponentRelationship } from "../../../src/domain/generated/contracts";

function document(): ArchitectureDocument {
  return {
    schemaVersion: 1,
    name: "Example",
    analysis: {
      enforcer: "example", version: "2", config: ".example.cjs", inputs: ["lib", "app"],
      generatedAt: "2026-11-06T10:00:00-07:00", scopeNotes: ["Some files were excluded"],
    },
    components: [
      { id: "lib", name: "Library", parent: ".", reportedFiles: 0 },
      { id: ".", name: "Example", reportedFiles: 0 },
      { id: "app", name: "Application", parent: ".", reportedFiles: 10 },
    ],
    relationships: [relationship()],
    diagnostics: [],
  };
}

function relationship(): ComponentRelationship {
  return {
    id: "imports:app:lib", kind: "imports", source: "app", target: "lib",
    evidence: [{ sourceFile: "app/main.ts", targetFile: "lib/core/entity.ts", variants: [{}] }],
  };
}

describe("strict portable architecture documents", () => {
  test("accepts saved counts without reconstructing them from import evidence", () => {
    const saved = architectureDocumentSchema.parse(document());
    expect(saved.components.map(({ id, reportedFiles }) => [id, reportedFiles])).toEqual([
      [".", 0], ["app", 10], ["lib", 0],
    ]);
    expect(saved.analysis.inputs).toEqual(["app", "lib"]);
  });

  test("keeps manifest parents independent of directory containment", () => {
    const saved = document();
    saved.components.push({ id: "plugins", name: "Plugins", parent: "lib", reportedFiles: 0 });
    expect(architectureDocumentSchema.parse(saved).components.find(({ id }) => id === "plugins")?.parent).toBe("lib");
  });

  test.each([
    ["missing root", [{ id: "app", name: "Application", reportedFiles: 0 }]],
    ["root with parent", [{ id: ".", name: "Root", parent: ".", reportedFiles: 0 }]],
    ["duplicate component ID", [{ id: ".", name: "Root", reportedFiles: 0 }, { id: ".", name: "Other", reportedFiles: 0 }]],
    ["duplicate name", [{ id: ".", name: "Root", reportedFiles: 0 }, { id: "app", name: "Root", parent: ".", reportedFiles: 0 }]],
    ["missing parent", [{ id: ".", name: "Root", reportedFiles: 0 }, { id: "app", name: "App", reportedFiles: 0 }]],
    ["unknown parent", [{ id: ".", name: "Root", reportedFiles: 0 }, { id: "app", name: "App", parent: "absent", reportedFiles: 0 }]],
    ["parent cycle", [
      { id: ".", name: "Root", reportedFiles: 0 },
      { id: "app", name: "App", parent: "lib", reportedFiles: 0 },
      { id: "lib", name: "Lib", parent: "app", reportedFiles: 0 },
    ]],
  ])("rejects %s", (_label, components) => {
    const saved = { ...document(), components, relationships: [] };
    expect(architectureDocumentSchema.safeParse(saved).success).toBe(false);
  });

  test.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects a reported file count of %s", (reportedFiles) => {
      const saved = document();
      saved.components = [{ id: ".", name: "Root", reportedFiles }];
      saved.relationships = [];
      expect(architectureDocumentSchema.safeParse(saved).success).toBe(false);
    },
  );

  test.each(["/tmp/app", "C:/work/app", "C:app", "app\\core", "./app", "app/../lib", "app/./core", "app/", "app//core"])(
    "rejects noncanonical component paths: %s", (id) => {
      const saved = document();
      saved.components.push({ id, name: "Bad path", parent: ".", reportedFiles: 0 });
      expect(architectureDocumentSchema.safeParse(saved).success).toBe(false);
    },
  );

  test("checks canonical config, input and evidence paths", () => {
    const saved = document();
    expect(architectureDocumentSchema.safeParse({ ...saved, analysis: { ...saved.analysis, config: "../outside.cjs" } }).success).toBe(false);
    expect(architectureDocumentSchema.safeParse({ ...saved, analysis: { ...saved.analysis, inputs: ["/src"] } }).success).toBe(false);
    const edge = relationship();
    edge.evidence = [{ sourceFile: ".", targetFile: "lib/core.ts", variants: [{}] }];
    expect(architectureDocumentSchema.safeParse({ ...saved, relationships: [edge] }).success).toBe(false);
  });

  test.each(["not-a-date", "2026-02-30T10:00:00Z", "2026-11-06T10:00:00", "2026-11-06"])(
    "rejects an invalid provenance timestamp: %s", (generatedAt) => {
      const saved = document();
      saved.analysis.generatedAt = generatedAt;
      expect(architectureDocumentSchema.safeParse(saved).success).toBe(false);
    },
  );

  test("rejects unsupported versions and unknown fields throughout the document", () => {
    const saved = document();
    const badDocuments = [
      { ...saved, schemaVersion: 2 }, { ...saved, positions: {} },
      { ...saved, analysis: { ...saved.analysis, repositoryRoot: "/home/example" } },
      { ...saved, components: [{ id: ".", name: "Example", reportedFiles: 0, label: "Root" }] },
      { ...saved, relationships: [{ ...relationship(), weight: 1 }] },
      { ...saved, relationships: [{ ...relationship(), evidence: [{ sourceFile: "app/main.ts", targetFile: "lib/core.ts", variants: [{ typeOnly: true, flag: false }] }] }] },
    ];
    for (const candidate of badDocuments) expect(architectureDocumentSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("portable relationship integrity", () => {
  test.each([
    { id: "incorrect" }, { source: "missing" }, { target: "missing" },
    { id: "imports:app:app", target: "app" }, { evidence: [] },
    { evidence: [{ sourceFile: "app/main.ts", targetFile: "lib/core.ts", variants: [] }] },
    { evidence: [{ sourceFile: "app/main.ts", targetFile: "lib/core.ts", variants: [{}, {}] }] },
    { evidence: [{ sourceFile: "app/main.ts", targetFile: "lib/core.ts", variants: [{ typeOnly: true, dynamic: false }, { dynamic: false, typeOnly: true }] }] },
    { evidence: [{ sourceFile: "lib/core.ts", targetFile: "app/main.ts", variants: [{}] }] },
    { evidence: [{ sourceFile: "app/node_modules/pkg/a.js", targetFile: "lib/core.ts", variants: [{}] }] },
  ])("rejects invalid aggregated evidence %j", (changes) => {
    const saved = document();
    expect(architectureDocumentSchema.safeParse({ ...saved, relationships: [{ ...relationship(), ...changes }] }).success).toBe(false);
  });

  test("rejects repeated relationships and repeated evidence pairs", () => {
    const saved = document();
    saved.relationships.push(relationship());
    expect(architectureDocumentSchema.safeParse(saved).success).toBe(false);
    const edge = relationship();
    edge.evidence.push({ sourceFile: "app/main.ts", targetFile: "lib/core/entity.ts", variants: [{ dynamic: true }] });
    saved.relationships = [edge];
    expect(architectureDocumentSchema.safeParse(saved).success).toBe(false);
  });

  test("accepts cycles between declared components", () => {
    const saved = document();
    saved.relationships.push({
      id: "imports:lib:app", kind: "imports", source: "lib", target: "app",
      evidence: [{ sourceFile: "lib/core.ts", targetFile: "app/main.ts", variants: [{ dynamic: false }] }],
    });
    expect(architectureDocumentSchema.parse(saved).relationships).toHaveLength(2);
  });

  test("uses deepest ownership to validate relationship endpoints", () => {
    const saved = document();
    saved.components.push({ id: "lib/core", name: "Core", parent: "lib", reportedFiles: 0 });
    expect(architectureDocumentSchema.safeParse(saved).success).toBe(false);
  });
});

describe("portable diagnostic meaning and canonical ordering", () => {
  test("preserves finite metrics with reserved property names as own data properties", () => {
    const metrics: Record<string, number> = JSON.parse('{"ordinary":3,"constructor":2,"__proto__":1,"prototype":4,"toString":5}');
    const saved = document();
    saved.diagnostics = [{ code: "metrics", severity: "info", message: "Metrics", subjects: [], metrics }];
    const parsed = architectureDocumentSchema.parse(saved).diagnostics[0]?.metrics;
    expect(Object.keys(parsed ?? {})).toEqual(["__proto__", "constructor", "ordinary", "prototype", "toString"]);
    expect(Object.getOwnPropertyDescriptor(parsed, "__proto__")?.value).toBe(1);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(JSON.stringify(parsed)).toBe('{"__proto__":1,"constructor":2,"ordinary":3,"prototype":4,"toString":5}');
    expect(Object.keys(metrics)).toEqual(["ordinary", "constructor", "__proto__", "prototype", "toString"]);
  });

  test("accepts a null-prototype metrics dictionary", () => {
    const metrics: Record<string, number> = Object.create(null);
    metrics["__proto__"] = 0.5;
    const saved = document();
    saved.diagnostics = [{ code: "metrics", severity: "info", message: "Metrics", subjects: [], metrics }];
    expect(architectureDocumentSchema.parse(saved).diagnostics[0]?.metrics?.["__proto__"]).toBe(0.5);
  });

  test.each(["__proto__", "constructor", "prototype"])("rejects invalid metrics under the key %s", (key) => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "1", null, true, {}, undefined]) {
      const diagnostic = { code: "metrics", severity: "info", message: "Metrics", subjects: [], metrics: Object.fromEntries([[key, value]]) };
      expect(architectureDocumentSchema.safeParse({ ...document(), diagnostics: [diagnostic] }).success).toBe(false);
    }
  });

  test("rejects metrics that are not records", () => {
    for (const metrics of [[], new Map(), new Set(), new Date(), /metric/, Object.create({ inherited: 1 }), 1, "value", null]) {
      const diagnostic = { code: "metrics", severity: "info", message: "Metrics", subjects: [], metrics };
      expect(architectureDocumentSchema.safeParse({ ...document(), diagnostics: [diagnostic] }).success).toBe(false);
    }
  });

  test("retains roles, ordered paths and metrics without declaring referenced folders", () => {
    const saved = document();
    saved.diagnostics = [{
      code: "folder-cycle", severity: "ignored", message: "A folder cycle was reported", rule: "acyclic-folders",
      subjects: [{ role: "target", kind: "folder", value: "lib/core" }, { role: "source", kind: "folder", value: "app/views" }],
      cycle: [{ kind: "folder", value: "lib/core" }, { kind: "folder", value: "app/views" }, { kind: "folder", value: "lib/core" }],
      via: [{ kind: "builtin", value: "node:fs" }, { kind: "package", value: "@example/shared" }],
      metrics: { z: 3, a: 0.25 },
    }];
    const before = structuredClone(saved);
    const parsed = architectureDocumentSchema.parse(saved);
    expect(parsed.components).toHaveLength(3);
    expect(parsed.diagnostics[0]?.subjects).toEqual([
      { role: "source", kind: "folder", value: "app/views" }, { role: "target", kind: "folder", value: "lib/core" },
    ]);
    expect(parsed.diagnostics[0]?.cycle).toEqual(saved.diagnostics[0]?.cycle);
    expect(parsed.diagnostics[0]?.via).toEqual(saved.diagnostics[0]?.via);
    expect(Object.keys(parsed.diagnostics[0]?.metrics ?? {})).toEqual(["a", "z"]);
    expect(saved).toEqual(before);
  });

  test.each([
    { subjects: [{ role: "left", kind: "file", value: "app/main.ts" }] },
    { subjects: [{ role: "subject", kind: "directory", value: "app" }] },
    { subjects: [{ role: "subject", kind: "file", value: "/tmp/app.ts" }] },
    { subjects: [{ role: "subject", kind: "folder", value: "../app" }] },
    { subjects: [{ role: "subject", kind: "outside-root", value: "C:/work/app.ts" }] },
    { subjects: [{ role: "subject", kind: "outside-root", value: "/home/user/app.ts" }] },
    { metrics: { instability: Number.POSITIVE_INFINITY } }, { metrics: { instability: Number.NaN } },
    { unknownField: "raw report" },
  ])("rejects invalid diagnostic data %j", (changes) => {
    const saved = document();
    const diagnostic = { code: "finding", severity: "warning", message: "Finding", subjects: [], ...changes };
    expect(architectureDocumentSchema.safeParse({ ...saved, diagnostics: [diagnostic] }).success).toBe(false);
  });

  test("canonicalizes equivalent objects independently of key and collection insertion order", () => {
    const left = document();
    const right = structuredClone(left);
    left.diagnostics = [{ code: "b", message: "Second", severity: "error", subjects: [], metrics: { second: 2, first: 1 } },
      { code: "a", message: "First", severity: "info", subjects: [] }];
    right.diagnostics = [{ severity: "info", subjects: [], message: "First", code: "a" },
      { metrics: { first: 1, second: 2 }, subjects: [], severity: "error", message: "Second", code: "b" }];
    right.components.reverse();
    right.analysis.inputs.reverse();
    expect(JSON.stringify(architectureDocumentSchema.parse(right))).toBe(JSON.stringify(architectureDocumentSchema.parse(left)));
  });
});
