import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { isDesktop } from "./desktop.ts";
import type { DiagramDialogOperations } from "./generated/contracts.ts";

const MAX_FILENAME_BYTES = 255;
const encoder = new TextEncoder();
const destinationRequest = z.strictObject({
  fileName: z.string().min(1).max(MAX_FILENAME_BYTES).refine((value) =>
    value.length <= MAX_FILENAME_BYTES &&
    !/[\ud800-\udfff\x00-\x1f\x7f<>:"/\\|?*]/u.test(value) &&
    !/[. ]$/u.test(value) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value) &&
    encoder.encode(value).byteLength <= MAX_FILENAME_BYTES,
  ),
});
const fileSelection = z.string().min(1).nullable();

export async function selectDiagramFile(): Promise<ReturnType<DiagramDialogOperations["selectDiagramFile"]>> {
  if (!isDesktop()) return null;
  return runDialog(async () => fileSelection.parse(await open({
    directory: false,
    multiple: false,
    title: "Open Diagram",
    filters: [{ name: "Choom diagram", extensions: ["yaml", "yml"] }],
  })));
}

export async function selectDiagramDestination(
  request: Parameters<DiagramDialogOperations["selectDiagramDestination"]>[0],
): Promise<ReturnType<DiagramDialogOperations["selectDiagramDestination"]>> {
  if (!isDesktop()) return null;
  const parsed = destinationRequest.safeParse(request);
  if (!parsed.success) throw new Error("The export filename is invalid.");
  return runDialog(async () => fileSelection.parse(await save({
    title: "Export Diagram",
    defaultPath: parsed.data.fileName,
    filters: [{ name: "Choom diagram", extensions: ["yaml", "yml"] }],
  })));
}

export async function confirmDiagramReplacement(): Promise<ReturnType<DiagramDialogOperations["confirmDiagramReplacement"]>> {
  if (!isDesktop()) return false;
  return runDialog(() => confirm(
    "A file already exists at the selected destination. Replace it with this diagram?",
    { title: "Replace Diagram?", kind: "warning", okLabel: "Replace", cancelLabel: "Cancel" },
  ));
}

async function runDialog<Result>(action: () => Promise<Result>): Promise<Result> {
  try {
    return await action();
  } catch {
    throw new Error("The native diagram dialog is unavailable.");
  }
}
