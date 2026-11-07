import { afterEach, beforeEach, expect, expectTypeOf, test } from "bun:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import Ajv2020 from "ajv/dist/2020.js";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import * as dialogs from "../../../src/platform/document-dialogs.ts";
import type { DiagramDialogOperations } from "../../../src/platform/generated/contracts.ts";

type RuntimeOperations = {
  [Name in keyof typeof dialogs]: (typeof dialogs)[Name] extends (
    ...args: infer Parameters
  ) => infer Result
    ? (...args: Parameters) => Awaited<Result>
    : never;
};
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

test("diagram dialog names, requests, and asynchronous results match TypeSpec", () => {
  expectTypeOf<RuntimeOperations>().toEqualTypeOf<DiagramDialogOperations>();
});

test("browser absence and closed destination requests satisfy the emitted schemas", async () => {
  Object.defineProperty(globalThis, "isTauri", { value: false, configurable: true });
  const validateSelection = schemas.compile({ $ref: "DiagramFileSelection.json" });
  expect(validateSelection(await dialogs.selectDiagramFile())).toBe(true);
  expect(validateSelection(await dialogs.selectDiagramDestination({ fileName: "Atlas.choom.yaml" }))).toBe(true);
  expect(await dialogs.confirmDiagramReplacement()).toBe(false);
  expect(requests).toEqual([]);

  const validateRequest = schemas.compile({ $ref: "DiagramDestinationRequest.json" });
  expect(validateRequest({ fileName: "Atlas.choom.yaml" })).toBe(true);
  for (const invalid of [null, {}, { fileName: "" }, { fileName: "a".repeat(256) }, { fileName: "Atlas.yaml", extra: true }]) {
    expect(validateRequest(invalid)).toBe(false);
  }
});

test("export suggestions accept literal basenames up to 255 UTF-8 bytes", async () => {
  const fileNames = ["Atlas.choom.yaml", "合同.choom.yaml", "😀.choom.yaml", "a".repeat(255), "é".repeat(127) + "a"];
  for (const fileName of fileNames) {
    expect(await dialogs.selectDiagramDestination({ fileName })).toBeNull();
  }
  expect(requests).toEqual(fileNames.map((fileName) => ({
    command: "plugin:dialog|save",
    payload: { options: {
      title: "Export Diagram",
      defaultPath: fileName,
      filters: [{ name: "Choom diagram", extensions: ["yaml", "yml"] }],
    } },
  })));
});

test("invalid or unbounded export suggestions are refused before native selection", async () => {
  const invalidRequests: unknown[] = [
    null, {}, { fileName: 7 }, { fileName: "valid.yaml", extra: true },
    ...[
      "", ".", "..", "../Atlas.yaml", "sub/Atlas.yaml", "sub\\Atlas.yaml", "C:Atlas.yaml",
      "bad\nname.yaml", "bad\u007fname.yaml", "broken\ud800.yaml", "Atlas?.yaml", "Atlas*.yaml",
      "Atlas<.yaml", "Atlas>.yaml", "Atlas|.yaml", 'Atlas".yaml', "Atlas.", "Atlas ",
      "CON", "con.yaml", "PRN.txt", "AUX.yaml", "nul.yaml", "COM1.yaml", "LPT9.yaml",
      "a".repeat(256), "é".repeat(128),
    ].map((fileName) => ({ fileName })),
  ];
  for (const request of invalidRequests) {
    await expect(dialogs.selectDiagramDestination(
      request as Parameters<typeof dialogs.selectDiagramDestination>[0],
    )).rejects.toThrow("The export filename is invalid.");
  }
  expect(requests).toEqual([]);
});
