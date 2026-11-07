import { DocumentFiles } from "../documents/document-files.ts";
import type { ArchitectureDocument } from "../domain/generated/contracts.ts";
import type { layoutArchitectureDocument } from "../lib/architecture-layout.ts";
import { encodeArchitectureYaml } from "../lib/architecture-yaml.ts";
import { downloadDiagram, readBrowserDiagram, selectBrowserDiagram } from "../platform/browser-documents.ts";
import { isDesktop, selectProjectDirectory } from "../platform/desktop.ts";
import { confirmDiagramReplacement, selectDiagramDestination, selectDiagramFile } from "../platform/document-dialogs.ts";
import { DesktopDocumentAccess } from "../platform/documents.ts";
import { DesktopRepositoryAccess } from "../platform/repository.ts";
import { createArchitecturalLayer } from "./create-architectural-layer.ts";
import { LoadWorkflow } from "./load-workflow.ts";
import { RepositoryDiscovery } from "./repository-discovery.ts";

export type WorkspaceExportOutcome = Awaited<ReturnType<DocumentFiles["exportDocument"]>>;

export interface WorkspaceBinding {
  workflow: LoadWorkflow;
  exportDocument(document: ArchitectureDocument): Promise<WorkspaceExportOutcome>;
}

/** Composition has no startup effects. Only a repository load creates an analyzer. */
export function createWorkspace(options: { layout?: typeof layoutArchitectureDocument } = {}): WorkspaceBinding {
  const documents = new DocumentFiles(new DesktopDocumentAccess());
  const repository = new DesktopRepositoryAccess();
  const discovery = new RepositoryDiscovery(repository);
  const workflow = new LoadWorkflow({
    documents,
    selectRepository: selectProjectDirectory,
    selectDocument: async (signal) => {
      if (isDesktop()) {
        const path = await selectDiagramFile();
        return path === null ? null : { kind: "desktop", path };
      }
      const file = await selectBrowserDiagram(signal);
      return file === null ? null : { kind: "browser", readText: (readSignal) => readBrowserDiagram(file, readSignal) };
    },
    discover: discovery.discover,
    createLayer: createArchitecturalLayer,
    closeRepository: (request) => repository.closeRepository(request),
    layout: options.layout ?? (async (document) => (await import("../lib/architecture-layout.ts")).layoutArchitectureDocument(document)),
  });

  return {
    workflow,
    exportDocument: async (document) => {
      if (isDesktop()) {
        const outcome = await documents.exportDocument(document, async () => {
          const path = await selectDiagramDestination({ fileName: "architecture.choom.yaml" });
          return path === null ? null : { path, overwrite: false };
        }, confirmDiagramReplacement);
        if (outcome.status === "failure" && outcome.stage === "cleanup") workflow.documentCleanupFailed();
        return outcome;
      }
      const started = performance.now();
      const encoded = encodeArchitectureYaml(document);
      if (encoded.status === "failure") return encoded;
      try {
        downloadDiagram(encoded.text);
        return { status: "success", exported: true, durationMs: Math.max(0, performance.now() - started) };
      } catch {
        return {
          status: "failure", stage: "export", code: "unavailable",
          message: "The browser could not download the diagram.", durationMs: Math.max(0, performance.now() - started),
        };
      }
    },
  };
}

// One owner per workspace, outside React render and StrictMode effect replay.
export const workspace = createWorkspace();
