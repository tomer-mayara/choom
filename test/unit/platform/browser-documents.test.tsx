import { afterEach, expect, test } from "bun:test";
import { downloadDiagram, readBrowserDiagram, selectBrowserDiagram } from "../../../src/platform/browser-documents.ts";

afterEach(() => { document.body.replaceChildren(); });

test("browser selection returns only the chosen file and removes its input", async () => {
  const pending = selectBrowserDiagram(new AbortController().signal);
  const input = document.querySelector("input[type=file]");
  if (!(input instanceof HTMLInputElement)) throw new Error("The file picker must exist.");
  const file = new File(["diagram"], "saved.yaml");
  Object.defineProperty(input, "files", { value: [file] });
  input.dispatchEvent(new Event("change"));
  expect(await pending).toBe(file);
  expect(document.querySelector("input")).toBeNull();
});

test("cancelling either the picker or the load releases the browser selection", async () => {
  for (const action of ["picker", "load"] as const) {
    const control = new AbortController();
    const pending = selectBrowserDiagram(control.signal);
    if (action === "load") control.abort();
    else document.querySelector("input")?.dispatchEvent(new Event("cancel"));
    expect(await pending).toBeNull();
    expect(document.querySelector("input")).toBeNull();
  }
});

test("browser reading rejects invalid UTF-8 and oversized files before decoding", async () => {
  const signal = new AbortController().signal;
  await expect(readBrowserDiagram(new File([new Uint8Array([0xc3, 0x28])], "bad.yaml"), signal)).rejects.toThrow("UTF-8");
  let read = false;
  await expect(readBrowserDiagram({ size: 16 * 1024 * 1024 + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } }, signal)).rejects.toThrow("16 MiB");
  expect(read).toBe(false);
  expect(await readBrowserDiagram(new File(["name: café\n"], "valid.yaml"), signal)).toBe("name: café\n");
});

test("cancellation during browser reading rejects the eventual bytes", async () => {
  const control = new AbortController();
  let finish: (buffer: ArrayBuffer) => void = () => {};
  const pending = readBrowserDiagram({ size: 0, arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }) }, control.signal);
  control.abort();
  finish(new ArrayBuffer(0));
  await expect(pending).rejects.toThrow();
});

test("browser export downloads the supplied bytes and removes its link", () => {
  const click = HTMLAnchorElement.prototype.click;
  let name = "";
  let url = "";
  HTMLAnchorElement.prototype.click = function () { name = this.download; url = this.href; };
  try {
    downloadDiagram("name: Atlas\n");
    expect(name).toBe("architecture.choom.yaml");
    expect(url.startsWith("blob:")).toBe(true);
    expect(document.querySelector("a")).toBeNull();
  } finally {
    HTMLAnchorElement.prototype.click = click;
  }
});
