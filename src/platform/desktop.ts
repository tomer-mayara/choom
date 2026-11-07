import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { DesktopOperations } from "./generated/contracts";

export function isDesktop(): ReturnType<DesktopOperations["isDesktop"]> {
  return isTauri();
}

export async function selectProjectDirectory(): Promise<
  ReturnType<DesktopOperations["selectProjectDirectory"]>
> {
  if (!isDesktop()) return null;
  return open({
    directory: true,
    multiple: false,
    title: "Choose a project directory",
  });
}
