import type { layoutBaseline } from "../lib/architecture-layout.ts";
import { readBrowserBaseline, selectBrowserBaseline } from "../platform/browser-documents.ts";
import { isDesktop } from "../platform/desktop.ts";
import { selectBaselineFile, selectDiscoveryResultFile, selectDuplicationReportFile } from "../platform/document-dialogs.ts";
import { DesktopDocumentAccess } from "../platform/documents.ts";
import { LoadWorkflow, type SelectedBaseline } from "./load-workflow.ts";
import type { WorkspaceBinding } from "./workspace-view.ts";

// Each kind of file has its own desktop picker title; all use the same read-only document command.
const desktopPickers = {
  baseline: selectBaselineFile, "duplication report": selectDuplicationReportFile, "discovery result": selectDiscoveryResultFile,
};

/** Composition has no startup effects. Both hosts use the same decoder and viewer. */
export function createWorkspace(options: { layout?: typeof layoutBaseline } = {}): WorkspaceBinding {
  const files = new DesktopDocumentAccess();
  async function selectDocument(signal: AbortSignal, purpose: keyof typeof desktopPickers): Promise<SelectedBaseline | null> {
    if (isDesktop()) {
      const path = await desktopPickers[purpose]();
      return path === null ? null : { read: () => files.readDocumentFile({ path }) };
    }
    const file = await selectBrowserBaseline(signal);
    return file === null ? null : { read: (readSignal) => readBrowserBaseline(file, readSignal, purpose) };
  }
  return { workflow: new LoadWorkflow({
    selectBaseline: (signal) => selectDocument(signal, "baseline"),
    selectDuplicationReport: (signal) => selectDocument(signal, "duplication report"),
    selectDiscoveryResult: (signal) => selectDocument(signal, "discovery result"),
    layout: options.layout ?? (async (baseline) => (await import("../lib/architecture-layout.ts")).layoutBaseline(baseline)),
  }) };
}

// One owner per workspace, outside React render and StrictMode effect replay.
export const workspace = createWorkspace();
