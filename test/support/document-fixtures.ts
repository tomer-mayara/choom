import type { ArchitectureDocument } from "../../src/domain/generated/contracts.ts";
import { workspaceObservations } from "./domain-model-fixtures.ts";

export function architectureDocumentFixture(name = "Atlas"): ArchitectureDocument {
  return {
    schemaVersion: 1,
    name,
    analysis: workspaceObservations().analysis,
    components: [
      { id: ".", name, reportedFiles: 0 },
      { id: "packages/core", name: "Core", parent: ".", reportedFiles: 1 },
      { id: "src", name: "Workspace", parent: ".", reportedFiles: 3 },
    ],
    relationships: [{
      id: "imports:src:packages%2Fcore",
      kind: "imports",
      source: "src",
      target: "packages/core",
      evidence: [
        { sourceFile: "src/components/panel.ts", targetFile: "packages/core/model/entity.ts", variants: [{}] },
        { sourceFile: "src/lib/format.ts", targetFile: "packages/core/model/entity.ts", variants: [{ typeOnly: true }] },
      ],
    }],
    diagnostics: [{
      code: "folder-cycle",
      severity: "warning",
      message: "The two folders depend on each other.",
      subjects: [
        { role: "source", kind: "folder", value: "src/components" },
        { role: "target", kind: "folder", value: "packages/core/model" },
      ],
      cycle: [
        { kind: "folder", value: "src/components" },
        { kind: "folder", value: "packages/core/model" },
        { kind: "folder", value: "src/components" },
      ],
      via: [
        { kind: "file", value: "src/components/panel.ts" },
        { kind: "file", value: "packages/core/model/entity.ts" },
      ],
      metrics: Object.fromEntries([["<<", 1], ["__proto__", 2], ["constructor", 3]]),
    }],
  };
}
