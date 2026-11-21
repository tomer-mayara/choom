import { open } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { isDesktop } from "./desktop.ts";
import type { BaselineDialogOperations } from "./generated/contracts.ts";

const fileSelection = z.string().min(1).nullable();

export async function selectDuplicationReportFile(): Promise<ReturnType<BaselineDialogOperations["selectDuplicationReportFile"]>> {
  return selectDocumentFile("duplication report");
}

export async function selectEarlierBaselineFile(): Promise<ReturnType<BaselineDialogOperations["selectEarlierBaselineFile"]>> {
  return selectDocumentFile("earlier baseline");
}

export async function selectBaselineFile(): Promise<ReturnType<BaselineDialogOperations["selectBaselineFile"]>> {
  return selectDocumentFile("baseline");
}

export async function selectDiscoveryResultFile(): Promise<ReturnType<BaselineDialogOperations["selectDiscoveryResultFile"]>> {
  return selectDocumentFile("discovery result");
}

// Every kind of file uses the same single-file picker; the app then reads it with the read-only document command.
const pickers = {
  "earlier baseline": { title: "Compare with earlier baseline", filter: "Architecture baseline" },
  baseline: { title: "Open Baseline", filter: "Architecture baseline" },
  "duplication report": { title: "Open duplication report", filter: "Duplication report" },
  "discovery result": { title: "Open discovery result", filter: "Discovery result" },
} as const;

async function selectDocumentFile(purpose: keyof typeof pickers): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    return fileSelection.parse(await open({
      directory: false, multiple: false, title: pickers[purpose].title,
      filters: [{ name: pickers[purpose].filter, extensions: ["yaml", "yml"] }],
    }));
  } catch {
    throw new Error(`The native ${purpose} picker is unavailable.`);
  }
}
