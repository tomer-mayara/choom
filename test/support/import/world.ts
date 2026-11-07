import assert from "node:assert/strict";
import type { World } from "@cucumber/cucumber";
import type { Browser, Page } from "@playwright/test";
import type { Data, ImportFixture } from "./fixtures.ts";

export interface ImportView {
  componentIds: string[];
  componentCards: { id: string; text: string }[];
  edges: { source: string; target: string }[];
  text: string;
  alerts: string[];
  statuses: string[];
}

export interface ImportDriver {
  open(): Promise<void>;
  selectRepository(path: string | null): Promise<void>;
  loadRepository(path: string): Promise<void>;
  openDocument(path: string): Promise<void>;
  cancel(): Promise<void>;
  exportDocument(path: string): Promise<string>;
  actionEnabled(action: "Load Repo" | "Open Diagram" | "Export Diagram"): Promise<boolean>;
  view(): Promise<ImportView>;
}

export interface ImportWorld extends World {
  page?: Page;
  importFixture?: ImportFixture;
  importDriver?: ImportDriver;
  installedDriver?: ImportDriver;
  viewerBrowser?: Browser;
  desktopImport?: boolean;
  keyboardImport?: boolean;
  exportedPath?: string;
  actualDocument?: Data;
  previousDocument?: Data;
  selectedRepository?: string;
  requestedAction?: "Load Repo" | "Open Diagram";
  exportOperation?: Promise<PromiseSettledResult<string>>;
  exportSettled?: boolean;
  releaseDocumentSnapshots?: () => Promise<void>;
  stepKind?: string;
}

export function fixture(world: ImportWorld): ImportFixture {
  assert.ok(world.importFixture, "The scenario fixture must be initialized by its route hook");
  return world.importFixture;
}

export function driver(world: ImportWorld): ImportDriver {
  assert.ok(world.importDriver, "The browser or installed-product route must initialize its driver");
  return world.importDriver;
}
