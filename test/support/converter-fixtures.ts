import type { DepCruiserConversionRequest } from "../../src/architecture/dependency-cruiser/generated/contracts.ts";
import { MemoryRepository } from "./discovery-repository.ts";

interface TestCruiserDependency {
  module: string;
  resolved: string;
  dependencyTypes: string[];
  coreModule?: boolean;
  couldNotResolve?: boolean;
  typeOnly?: boolean;
  dynamic?: boolean;
  preCompilationOnly?: boolean;
  [field: string]: unknown;
}

export interface TestCruiserModule {
  source: string;
  dependencies: TestCruiserDependency[];
  coreModule?: boolean;
  couldNotResolve?: boolean;
  dependencyTypes?: string[];
  [field: string]: unknown;
}

interface TestCruiserViolation {
  type?: string;
  from: string;
  to: string;
  rule: { name: string; severity: string };
  cycle?: Array<{ name: string; dependencyTypes?: string[] }>;
  via?: Array<{ name: string; dependencyTypes?: string[] }>;
  metrics?: Record<string, Record<string, number>>;
  [field: string]: unknown;
}

interface TestCruiserReport {
  modules: TestCruiserModule[];
  folders?: Array<{ name: string; moduleCount: number; [field: string]: unknown }>;
  summary: {
    violations: TestCruiserViolation[];
    optionsUsed: Record<string, unknown>;
    environment: { version: string; issues?: Array<{ name: string; severity: string; description: string }> };
    ruleSetUsed?: { forbidden?: Array<Record<string, unknown>>; required?: Array<Record<string, unknown>>; allowed?: Array<Record<string, unknown>> };
    [field: string]: unknown;
  };
}

export function converterFixture() {
  const repository = new MemoryRepository();
  repository.activeSessions.add("repository-1");
  for (const file of [".dependency-cruiser.cjs", "src/components/panel.ts", "src/lib/format.ts", "packages/core/model/entity.ts"]) {
    repository.addFile(file);
  }
  const report: TestCruiserReport = {
    modules: [
      { source: "src/components/panel.ts", dependencies: [{ module: "@core/model/entity", resolved: "packages/core/model/entity.ts", dependencyTypes: ["local", "import"], dynamic: false }] },
      { source: "packages/core/model/entity.ts", dependencies: [] },
    ],
    summary: {
      violations: [],
      optionsUsed: { baseDir: ".", outputType: "json", outputTo: "-", cache: false },
      environment: { version: "18.7.2" },
      ruleSetUsed: { forbidden: [] },
    },
  };
  const input: DepCruiserConversionRequest = {
    request: {
      repositorySession: "repository-1",
      components: [{ id: ".", name: "Atlas" }, { id: "src", name: "workspace", parent: "." }, { id: "packages/core", name: "core", parent: "." }],
      analysis: { enforcer: "dependency-cruiser", config: ".dependency-cruiser.cjs", inputs: ["src/components", "src/lib"] },
    },
    completed: { json: JSON.stringify(report), version: "18.7.2", workingDirectory: ".", generatedAt: "2026-11-06T12:00:00Z" },
  };
  return { repository, input, report };
}

export function syncReport(fixture: Pick<ReturnType<typeof converterFixture>, "input" | "report">): void {
  fixture.input.completed.json = JSON.stringify(fixture.report);
}
