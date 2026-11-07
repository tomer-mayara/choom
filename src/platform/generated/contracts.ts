// Generated from TypeSpec by bun run contracts:generate. Do not edit.

export type DesktopAvailability = boolean;

export interface DesktopOperations {
  isDesktop(): DesktopAvailability;
  selectProjectDirectory(): DirectorySelection;
}

export type DirectorySelection = string | null;
