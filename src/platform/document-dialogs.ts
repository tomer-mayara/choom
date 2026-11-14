import { open } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { isDesktop } from "./desktop.ts";
import type { BaselineDialogOperations } from "./generated/contracts.ts";

const fileSelection = z.string().min(1).nullable();

export async function selectDuplicationReportFile(): Promise<ReturnType<BaselineDialogOperations["selectDuplicationReportFile"]>> {
  return selectDocumentFile("duplication report");
}

export async function selectBaselineFile(): Promise<ReturnType<BaselineDialogOperations["selectBaselineFile"]>> {
  return selectDocumentFile("baseline");
}

async function selectDocumentFile(purpose: "baseline" | "duplication report"): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    return fileSelection.parse(await open({
      directory: false, multiple: false, title: purpose === "baseline" ? "Open Baseline" : "Open duplication report",
      filters: [{ name: purpose === "baseline" ? "Architecture baseline" : "Duplication report", extensions: ["yaml", "yml"] }],
    }));
  } catch {
    throw new Error(`The native ${purpose} picker is unavailable.`);
  }
}
