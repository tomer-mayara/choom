import { afterEach, beforeEach, expect, expectTypeOf, test } from "bun:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import Ajv2020 from "ajv/dist/2020.js";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import * as dialogs from "../../../src/platform/document-dialogs.ts";
import type { BaselineDialogOperations } from "../../../src/platform/generated/contracts.ts";

const schemas = new Ajv2020({ schemas: [contracts] });

let originalWindow: PropertyDescriptor | undefined;
let originalTauriFlag: PropertyDescriptor | undefined;
let requests: { command: string; payload: unknown }[];

beforeEach(() => {
  originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  originalTauriFlag = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
  requests = [];
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "isTauri", { value: true, configurable: true });
  mockIPC((command, payload) => {
    requests.push({ command, payload });
    return null;
  });
});

afterEach(() => {
  clearMocks();
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalTauriFlag) Object.defineProperty(globalThis, "isTauri", originalTauriFlag);
  else Reflect.deleteProperty(globalThis, "isTauri");
});

test("baseline selection binds the retained file-selection contract", () => {
  expectTypeOf<ReturnType<typeof dialogs.selectBaselineFile>>()
    .toEqualTypeOf<Promise<ReturnType<BaselineDialogOperations["selectBaselineFile"]>>>();
});

test("the desktop opens a single baseline file and a browser opens no native dialog", async () => {
  const validateSelection = schemas.compile({ $ref: "BaselineFileSelection.json" });
  expect(validateSelection(await dialogs.selectBaselineFile())).toBe(true);
  expect(requests).toEqual([{ command: "plugin:dialog|open", payload: { options: {
    directory: false, multiple: false, title: "Open Baseline",
    filters: [{ name: "Architecture baseline", extensions: ["yaml", "yml"] }],
  } } }]);
  Object.defineProperty(globalThis, "isTauri", { value: false, configurable: true });
  expect(await dialogs.selectBaselineFile()).toBeNull();
  expect(requests.length).toBe(1);
});

test("dialog rejection and malformed selections preserve a safe picker failure", async () => {
  for (const result of [42, ["/first.yaml", "/second.yaml"], ""]) {
    mockIPC(() => result);
    await expect(dialogs.selectBaselineFile()).rejects.toThrow("The native baseline picker is unavailable.");
  }
  mockIPC(() => { throw new Error("/private/picker"); });
  await expect(dialogs.selectBaselineFile()).rejects.toThrow("The native baseline picker is unavailable.");
});
