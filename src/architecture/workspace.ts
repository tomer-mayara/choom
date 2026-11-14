import type { layoutBaseline } from "../lib/architecture-layout.ts";
import { readBrowserBaseline, selectBrowserBaseline } from "../platform/browser-documents.ts";
import { isDesktop } from "../platform/desktop.ts";
import { selectBaselineFile, selectDuplicationReportFile } from "../platform/document-dialogs.ts";
import { DesktopDocumentAccess } from "../platform/documents.ts";
import { LoadWorkflow, type SelectedBaseline } from "./load-workflow.ts";
import type { WorkspaceBinding } from "./workspace-view.ts";

/** Composition has no startup effects. Both hosts use the same decoder and viewer. */
export function createWorkspace(options: { layout?: typeof layoutBaseline } = {}): WorkspaceBinding {
  const files = new DesktopDocumentAccess();
  async function selectDocument(signal: AbortSignal, purpose: "baseline" | "duplication report"): Promise<SelectedBaseline | null> {
    if (isDesktop()) {
      const path = await (purpose === "baseline" ? selectBaselineFile() : selectDuplicationReportFile());
      return path === null ? null : { read: () => files.readDocumentFile({ path }) };
    }
    const file = await selectBrowserBaseline(signal);
    return file === null ? null : { read: (readSignal) => readBrowserBaseline(file, readSignal, purpose) };
  }
  return { workflow: new LoadWorkflow({
    selectBaseline: (signal) => selectDocument(signal, "baseline"),
    selectDuplicationReport: (signal) => selectDocument(signal, "duplication report"),
    layout: options.layout ?? (async (baseline) => (await import("../lib/architecture-layout.ts")).layoutBaseline(baseline)),
  }) };
}

// One owner per workspace, outside React render and StrictMode effect replay.
export const workspace = createWorkspace();
