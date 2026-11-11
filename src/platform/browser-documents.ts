import type { ReadDocumentTextOutcome } from "./generated/contracts.ts";

const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;

/** The browser owns this selection; no repository or native capability is used. */
export function selectBrowserBaseline(signal: AbortSignal): Promise<File | null> {
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
      reject(new Error("The baseline file picker could not be opened."));
    }
  });
}

export async function readBrowserBaseline(file: Pick<File, "size" | "arrayBuffer">, signal: AbortSignal): Promise<ReadDocumentTextOutcome> {
  const started = performance.now();
  const failure = (code: "limit-exceeded" | "invalid-utf8" | "io-error", message: string): ReadDocumentTextOutcome => ({
    status: "failure", stage: "storage", code, message, durationMs: Math.max(0, performance.now() - started),
  });
  signal.throwIfAborted();
  if (file.size > MAX_DOCUMENT_BYTES) return failure("limit-exceeded", "The baseline exceeds 16 MiB.");
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); }
  catch {
    signal.throwIfAborted();
    return failure("io-error", "The selected baseline is no longer readable. Open Baseline and select the file again.");
  }
  signal.throwIfAborted();
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return failure("limit-exceeded", "The baseline exceeds 16 MiB.");
  try {
    return { status: "success", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), durationMs: Math.max(0, performance.now() - started) };
  } catch {
    return failure("invalid-utf8", "The baseline is not valid UTF-8 text.");
  }
}
