import assert from "node:assert/strict";
import { After, Before, Given, Then, When, type World } from "@cucumber/cucumber";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  confirmDiagramReplacement,
  selectDiagramDestination,
  selectDiagramFile,
} from "../../src/platform/document-dialogs.ts";

interface DiagramDialogWorld extends World {
  originalWindow: PropertyDescriptor | undefined;
  originalTauriFlag: PropertyDescriptor | undefined;
  requests: { command: string; payload: unknown }[];
  nativeResult: string | null;
  nativeFailure: Error | undefined;
  selected: string | null | undefined;
  confirmed: boolean | undefined;
  browserResults: unknown[];
  caught: unknown;
}

Before({ tags: "@desktop-dialogs" }, function (this: DiagramDialogWorld) {
  this.originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  this.originalTauriFlag = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
  this.requests = [];
  this.nativeResult = null;
  this.nativeFailure = undefined;
  this.selected = undefined;
  this.confirmed = undefined;
  this.browserResults = [];
  this.caught = undefined;
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  mockIPC((command, payload) => {
    this.requests.push({ command, payload });
    if (this.nativeFailure) throw this.nativeFailure;
    return this.nativeResult;
  });
});

After({ tags: "@desktop-dialogs" }, function (this: DiagramDialogWorld) {
  clearMocks();
  if (this.originalWindow) {
    Object.defineProperty(globalThis, "window", this.originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  if (this.originalTauriFlag) {
    Object.defineProperty(globalThis, "isTauri", this.originalTauriFlag);
  } else {
    Reflect.deleteProperty(globalThis, "isTauri");
  }
});

Given("the diagram file chooser is running in a browser", function () {
  Object.defineProperty(globalThis, "isTauri", { value: false, configurable: true });
});

Given(/^the desktop (?:diagram|export) chooser selects "([^"]*)"$/, function (this: DiagramDialogWorld, path: string) {
  this.nativeResult = path;
});

Given(/^the desktop (?:diagram|export) chooser is cancelled$/, function (this: DiagramDialogWorld) {
  this.nativeResult = null;
});

Given("the desktop export chooser is available", function (this: DiagramDialogWorld) {
  this.nativeResult = null;
});

Given("the desktop user chooses {string} when replacement is requested", function (this: DiagramDialogWorld, choice: string) {
  this.nativeResult = choice;
});

Given("the desktop diagram dialog fails", function (this: DiagramDialogWorld) {
  this.nativeFailure = new Error("Cannot open /private/user/secret.choom.yaml");
});

When("native diagram file actions are requested", async function (this: DiagramDialogWorld) {
  this.browserResults = await Promise.all([
    selectDiagramFile(),
    selectDiagramDestination({ fileName: "Atlas.choom.yaml" }),
    confirmDiagramReplacement(),
  ]);
});

When("a saved diagram is requested", async function (this: DiagramDialogWorld) {
  this.selected = await selectDiagramFile();
});

When("an export destination is requested for {string}", async function (this: DiagramDialogWorld, fileName: string) {
  try {
    this.selected = await selectDiagramDestination({ fileName });
  } catch (error) {
    this.caught = error;
  }
});

When("consent to replace a diagram is requested", async function (this: DiagramDialogWorld) {
  this.confirmed = await confirmDiagramReplacement();
});

When("the {string} diagram file action is requested", async function (this: DiagramDialogWorld, action: string) {
  try {
    if (action === "open") this.selected = await selectDiagramFile();
    else if (action === "save") this.selected = await selectDiagramDestination({ fileName: "Atlas.choom.yaml" });
    else if (action === "replace") this.confirmed = await confirmDiagramReplacement();
    else throw new Error(`Unknown diagram action: ${action}`);
  } catch (error) {
    this.caught = error;
  }
});

Then("no native diagram file action is available", function (this: DiagramDialogWorld) {
  assert.deepEqual(this.browserResults, [null, null, false]);
});

Then("no native dialog is requested", function (this: DiagramDialogWorld) {
  assert.deepEqual(this.requests, []);
});

Then("the selected diagram is {string}", function (this: DiagramDialogWorld, path: string) {
  assert.equal(this.caught, undefined);
  assert.equal(this.selected, path);
});

Then("the chooser accepts one YAML file", function (this: DiagramDialogWorld) {
  assert.deepEqual(this.requests, [{
    command: "plugin:dialog|open",
    payload: { options: {
      directory: false,
      multiple: false,
      title: "Open Diagram",
      filters: [{ name: "Choom diagram", extensions: ["yaml", "yml"] }],
    } },
  }]);
});

Then("no diagram file is selected", function (this: DiagramDialogWorld) {
  assert.equal(this.caught, undefined);
  assert.equal(this.selected, null);
});

Then("the export chooser suggests {string} as a YAML file", function (this: DiagramDialogWorld, fileName: string) {
  assert.deepEqual(this.requests, [{
    command: "plugin:dialog|save",
    payload: { options: {
      title: "Export Diagram",
      defaultPath: fileName,
      filters: [{ name: "Choom diagram", extensions: ["yaml", "yml"] }],
    } },
  }]);
});

Then(/^replacement is (permitted|not allowed)$/, function (this: DiagramDialogWorld, outcome: string) {
  assert.equal(this.confirmed, outcome === "permitted");
  assert.deepEqual(this.requests, [{
    command: "plugin:dialog|message",
    payload: {
      message: "A file already exists at the selected destination. Replace it with this diagram?",
      title: "Replace Diagram?",
      kind: "warning",
      buttons: { OkCancelCustom: ["Replace", "Cancel"] },
    },
  }]);
});

Then("the export filename is refused", function (this: DiagramDialogWorld) {
  assert.ok(this.caught instanceof Error);
  assert.equal(this.caught.message, "The export filename is invalid.");
  assert.equal(this.selected, undefined);
});

Then("the caller receives a safe diagram dialog failure", function (this: DiagramDialogWorld) {
  assert.ok(this.caught instanceof Error);
  assert.equal(this.caught.message, "The native diagram dialog is unavailable.");
  assert.equal(this.requests.length, 1);
  assert.equal(this.selected, undefined);
  assert.equal(this.confirmed, undefined);
});
