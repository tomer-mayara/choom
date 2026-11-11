import { afterEach, expect, test } from "bun:test";
import { readBrowserBaseline, selectBrowserBaseline } from "../../../src/platform/browser-documents.ts";

afterEach(() => { document.body.replaceChildren(); });

test("browser selection returns only the chosen file and removes its input", async () => {
  const pending = selectBrowserBaseline(new AbortController().signal);
  const input = document.querySelector("input[type=file]");
  if (!(input instanceof HTMLInputElement)) throw new Error("The file picker must exist.");
  const file = new File(["baseline"], "saved.choom.yaml");
  Object.defineProperty(input, "files", { value: [file] });
  input.dispatchEvent(new Event("change"));
  expect(await pending).toBe(file);
  expect(document.querySelector("input")).toBeNull();
});

test("cancelling either the picker or the load releases the browser selection", async () => {
  for (const action of ["picker", "load"] as const) {
    const control = new AbortController();
    const pending = selectBrowserBaseline(control.signal);
    if (action === "load") control.abort();
    else document.querySelector("input")?.dispatchEvent(new Event("cancel"));
    expect(await pending).toBeNull();
    expect(document.querySelector("input")).toBeNull();
  }
});

test("browser reading identifies invalid UTF-8 and bounds bytes before and after reading", async () => {
  const signal = new AbortController().signal;
  expect(await readBrowserBaseline(new File([new Uint8Array([0xc3, 0x28])], "bad.yaml"), signal))
    .toMatchObject({ status: "failure", code: "invalid-utf8", message: expect.stringContaining("UTF-8") });
  let read = false;
  expect(await readBrowserBaseline({ size: 16 * 1024 * 1024 + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } }, signal))
    .toMatchObject({ status: "failure", code: "limit-exceeded", message: expect.stringContaining("16 MiB") });
  expect(read).toBe(false);
  expect(await readBrowserBaseline({ size: 0, arrayBuffer: async () => new ArrayBuffer(16 * 1024 * 1024 + 1) }, signal))
    .toMatchObject({ status: "failure", code: "limit-exceeded" });
  expect(await readBrowserBaseline(new File(["name: café\n"], "valid.yaml"), signal))
    .toMatchObject({ status: "success", text: "name: café\n" });
});

test("cancellation during browser reading rejects the eventual bytes", async () => {
  const control = new AbortController();
  let finish: (buffer: ArrayBuffer) => void = () => {};
  const pending = readBrowserBaseline({ size: 0, arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }) }, control.signal);
  control.abort();
  finish(new ArrayBuffer(0));
  await expect(pending).rejects.toThrow();
});

test("an unreadable selected File gives safe re-selection guidance", async () => {
  const file = new File(["formatVersion: 1"], "baseline.yaml");
  file.arrayBuffer = () => Promise.reject(new DOMException("Cannot read /private/secret", "NotReadableError"));
  const result = await readBrowserBaseline(file, new AbortController().signal);
  expect(result).toMatchObject({ status: "failure", code: "io-error", message: expect.stringContaining("Open Baseline and select the file again") });
  expect(JSON.stringify(result)).not.toContain("/private");
});
