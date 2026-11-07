const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;

/** The browser owns this selection; no repository or native capability is used. */
export function selectBrowserDiagram(signal: AbortSignal): Promise<File | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".yaml,.yml,application/yaml,text/yaml";
    input.hidden = true;
    const finish = (file: File | null) => {
      signal.removeEventListener("abort", cancel);
      input.remove();
      resolve(file);
    };
    const cancel = () => finish(null);
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", cancel, { once: true });
    signal.addEventListener("abort", cancel, { once: true });
    document.body.append(input);
    try {
      input.click();
    } catch {
      signal.removeEventListener("abort", cancel);
      input.remove();
      reject(new Error("The diagram file picker could not be opened."));
    }
  });
}

export async function readBrowserDiagram(file: Pick<File, "size" | "arrayBuffer">, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("The document exceeds 16 MiB.");
  const bytes = await file.arrayBuffer();
  signal.throwIfAborted();
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error("The document exceeds 16 MiB.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The document is not valid UTF-8 text.");
  }
}

export function downloadDiagram(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/yaml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "architecture.choom.yaml";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Let the browser consume the click before releasing the download URL.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
