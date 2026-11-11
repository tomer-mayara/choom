import { isTauri } from "@tauri-apps/api/core";
import type { DesktopOperations } from "./generated/contracts.ts";

export function isDesktop(): ReturnType<DesktopOperations["isDesktop"]> {
  return isTauri();
}
