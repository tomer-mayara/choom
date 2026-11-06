import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export function isDesktop(): boolean {
  return isTauri();
}

export async function selectProjectDirectory(): Promise<string | null> {
  if (!isDesktop()) return null;
  return open({
    directory: true,
    multiple: false,
    title: "Choose a project directory",
  });
}
