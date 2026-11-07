import type {
  ArchitectureBuildInput,
  ArchitectureDiagnostic,
  ArchitectureDocument,
} from "../../src/domain/generated/contracts.ts";

export function workspaceObservations(): ArchitectureBuildInput {
  return {
    name: "Atlas",
    analysis: {
      enforcer: "example",
      version: "1.0.0",
      config: "rules.json",
      inputs: ["src"],
      generatedAt: "2026-11-06T12:00:00Z",
      scopeNotes: [],
    },
    components: [
      { id: ".", name: "atlas" },
      { id: "src", name: "workspace", parent: "." },
    ],
    observations: {
      files: [],
      imports: [],
      diagnostics: [],
    },
  };
}

export function mixedImportObservations(): ArchitectureBuildInput {
  const input = workspaceObservations();
  input.components.push(
    { id: "src/ui", name: "interface", parent: "src" },
    { id: "src/core", name: "core", parent: "src" },
  );
  input.observations.files.push(
    "src/ui/components/b.ts",
    "src/core/model/entity.ts",
    "src/ui/components/a.ts",
  );
  input.observations.imports.push(
    {
      sourceFile: "src/ui/components/b.ts",
      targetFile: "src/core/model/entity.ts",
    },
    {
      sourceFile: "src/ui/components/a.ts",
      targetFile: "src/core/model/entity.ts",
      typeOnly: true,
      preCompilationOnly: true,
    },
    {
      sourceFile: "src/ui/components/a.ts",
      targetFile: "src/core/model/entity.ts",
      typeOnly: false,
      dynamic: true,
    },
    {
      sourceFile: "src/ui/components/a.ts",
      targetFile: "src/core/model/entity.ts",
      typeOnly: false,
      dynamic: true,
    },
  );
  return input;
}

export const folderFinding = {
  code: "folder-cycle",
  severity: "warning",
  message: "The two folders depend on each other.",
  rule: "avoid-cycles",
  subjects: [
    { role: "target", kind: "folder", value: "src/a" },
    { role: "source", kind: "folder", value: "src/z" },
  ],
  cycle: [
    { kind: "folder", value: "src/z" },
    { kind: "folder", value: "src/a" },
    { kind: "folder", value: "src/z" },
  ],
  via: [
    { kind: "file", value: "src/z/first.ts" },
    { kind: "file", value: "src/a/second.ts" },
  ],
  metrics: { "source.instability": 0.25, "target.instability": 0.75 },
} satisfies ArchitectureDiagnostic;

export function savedCycle(): ArchitectureDocument {
  return {
    schemaVersion: 1,
    name: "Atlas",
    analysis: workspaceObservations().analysis,
    components: [
      { id: "src/ui", name: "interface", parent: ".", reportedFiles: 1 },
      { id: ".", name: "atlas", reportedFiles: 0 },
      { id: "src/core", name: "core", parent: ".", reportedFiles: 1 },
    ],
    relationships: [
      {
        id: "imports:src%2Fui:src%2Fcore",
        source: "src/ui",
        target: "src/core",
        kind: "imports",
        evidence: [
          {
            sourceFile: "src/ui/components/a.ts",
            targetFile: "src/core/model/entity.ts",
            variants: [{ typeOnly: true }],
          },
        ],
      },
      {
        id: "imports:src%2Fcore:src%2Fui",
        source: "src/core",
        target: "src/ui",
        kind: "imports",
        evidence: [
          {
            sourceFile: "src/core/model/entity.ts",
            targetFile: "src/ui/components/a.ts",
            variants: [{ typeOnly: false }],
          },
        ],
      },
    ],
    diagnostics: [],
  };
}
