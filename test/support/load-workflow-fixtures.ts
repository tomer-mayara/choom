import type { ArchitecturalLayer } from "../../src/domain/architectural-layer.ts";
import type { ArchitectureDocument } from "../../src/domain/generated/contracts.ts";
import type { DiscoveredRepository } from "../../src/architecture/generated/contracts.ts";
import type { LoadWorkflowDependencies } from "../../src/architecture/load-workflow.ts";
import { DocumentFiles } from "../../src/documents/document-files.ts";
import { encodeArchitectureYaml } from "../../src/lib/architecture-yaml.ts";
import { architectureDocumentFixture } from "./document-fixtures.ts";
import { MemoryDocumentAccess, pendingDocumentOperation } from "./document-storage-fixtures.ts";

export { pendingDocumentOperation };

export function workflowDependencies(): LoadWorkflowDependencies & { access: MemoryDocumentAccess } {
  const access = new MemoryDocumentAccess();
  return {
    access,
    documents: new DocumentFiles(access),
    selectRepository: async (): Promise<string | null> => null,
    selectDocument: async () => null,
    discover: async () => ({
      status: "failure" as const, stage: "discovery" as const,
      code: "manifest-unreadable" as const, message: "The root manifest could not be read.", durationMs: 0,
    }),
    createLayer: (): ArchitecturalLayer => ({ analyze: async () => ({ status: "cancelled" }) }),
    closeRepository: async () => ({ status: "success" as const, value: { closed: true as const } }),
    layout: async (document: ArchitectureDocument) => ({
      nodes: document.components.map(({ id }, index) => ({ id, position: { x: index * 250, y: 0 } })),
    }),
  };
}

export function discoveredWorkflowRepository(document = architectureDocumentFixture()): DiscoveredRepository {
  return {
    repositorySession: "repository-session",
    name: document.name,
    components: document.components.map(({ id, name, parent }) => ({ id, name, ...(parent ? { parent } : {}) })),
    analysis: { enforcer: "dependency-cruiser", config: ".dependency-cruiser.cjs", inputs: ["src", "packages/core"] },
  };
}

export function repositoryWorkflowDependencies(document = architectureDocumentFixture()) {
  const dependencies = workflowDependencies();
  dependencies.selectRepository = async () => "/selected";
  dependencies.discover = async () => ({ status: "success", repository: discoveredWorkflowRepository(document), durationMs: 0 });
  dependencies.createLayer = () => ({ analyze: async () => ({ status: "success", document }) });
  return dependencies;
}

export function workflowDocumentText(document = architectureDocumentFixture()): string {
  const encoded = encodeArchitectureYaml(document);
  if (encoded.status !== "success") throw new Error(encoded.message);
  return encoded.text;
}

export function browserWorkflowDocument(document = architectureDocumentFixture()) {
  return { kind: "browser" as const, readText: async () => workflowDocumentText(document) };
}
