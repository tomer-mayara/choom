import assert from "node:assert/strict";
import { After, Before, Given, Then, When, type World } from "@cucumber/cucumber";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  isDesktop,
  selectProjectDirectory,
} from "../../src/platform/desktop.ts";

interface DesktopWorld extends World {
  originalWindow: PropertyDescriptor | undefined;
  originalTauriFlag: PropertyDescriptor | undefined;
  requests: { command: string; payload: unknown }[];
  nativeResult: string | null;
  nativeFailure: Error | undefined;
  selected: string | null | undefined;
  caught: unknown;
}

Before({ tags: "@desktop-adapter" }, function (this: DesktopWorld) {
  this.originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  this.originalTauriFlag = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
  this.requests = [];
  this.nativeResult = null;
  this.nativeFailure = undefined;
  this.selected = undefined;
  this.caught = undefined;
  // Tauri's IPC mock needs a window object, but these steps need no DOM runtime.
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "isTauri", { value: false, configurable: true });
  mockIPC((command, payload) => {
    this.requests.push({ command, payload });
    assert.equal(command, "plugin:dialog|open");
    if (this.nativeFailure) throw this.nativeFailure;
    return this.nativeResult;
  });
});

After({ tags: "@desktop-adapter" }, function (this: DesktopWorld) {
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

Given("the directory adapter runs outside Tauri", function () {
  Object.defineProperty(globalThis, "isTauri", { value: false, configurable: true });
});

Given("the native directory picker returns {string}", function (this: DesktopWorld, path: string) {
  Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  this.nativeResult = path;
});

Given("the native directory picker is cancelled", function (this: DesktopWorld) {
  Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  this.nativeResult = null;
});

Given("the native directory picker fails", function (this: DesktopWorld) {
  Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  this.nativeFailure = new Error("Native picker unavailable");
});

When("a caller requests a project directory", async function (this: DesktopWorld) {
  try {
    this.selected = await selectProjectDirectory();
  } catch (error) {
    this.caught = error;
  }
});

Then("the adapter reports a browser environment", function () {
  assert.equal(isDesktop(), false);
});

Then("the adapter reports a desktop environment", function () {
  assert.equal(isDesktop(), true);
});

Then("no directory is selected", function (this: DesktopWorld) {
  assert.equal(this.caught, undefined);
  assert.equal(this.selected, null);
});

Then("no native directory request is sent", function (this: DesktopWorld) {
  assert.deepEqual(this.requests, []);
});

Then("one single-directory request is sent", function (this: DesktopWorld) {
  assert.deepEqual(this.requests, [{
    command: "plugin:dialog|open",
    payload: {
      options: {
        directory: true,
        multiple: false,
        title: "Choose a project directory",
      },
    },
  }]);
});

Then("the selected directory is {string}", function (this: DesktopWorld, path: string) {
  assert.equal(this.caught, undefined);
  assert.equal(this.selected, path);
});

Then("the caller receives the native picker failure", function (this: DesktopWorld) {
  assert.ok(this.nativeFailure);
  assert.equal(this.caught, this.nativeFailure);
  assert.equal(this.selected, undefined);
});
