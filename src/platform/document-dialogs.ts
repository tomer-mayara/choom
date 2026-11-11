import { open } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { isDesktop } from "./desktop.ts";
import type { DiagramDialogOperations } from "./generated/contracts.ts";

const fileSelection = z.string().min(1).nullable();

export async function selectBaselineFile(): Promise<ReturnType<DiagramDialogOperations["selectDiagramFile"]>> {
  if (!isDesktop()) return null;
  try {
    return fileSelection.parse(await open({
      directory: false, multiple: false, title: "Open Baseline",
      filters: [{ name: "Architecture baseline", extensions: ["yaml", "yml"] }],
    }));
  } catch {
    throw new Error("The native baseline picker is unavailable.");
  }
}
