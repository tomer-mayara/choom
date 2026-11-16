import type { Baseline } from "@choom/baseline-model/contracts";
import { validateDiscoveryResult } from "@choom/baseline-model/discovery-result";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import { CodecProblem } from "./architecture-yaml/limits.ts";
import { readYamlData } from "./architecture-yaml/parse.ts";
import type { DecodeDiscoveryResultOutcome, DiscoveryDecodeFailureCode, DiscoveryResultCodec } from "./generated/contracts.ts";

const messageLimit = 2048;

/**
 * Reads one discovery result with the bounded YAML reader of a baseline, and
 * checks it against the open baseline file: its ID and the SHA-256 of its bytes.
 * It reads no other file. A failure changes nothing.
 */
export function decodeDiscoveryResultYaml(text: string, baseline: ReadonlyData<Baseline>, baselineSha256: string): DecodeDiscoveryResultOutcome {
  const started = performance.now();
  const failure = (code: DiscoveryDecodeFailureCode, message: string): DecodeDiscoveryResultOutcome => ({
    status: "failure", stage: "decoding", code, durationMs: performance.now() - started,
    message: message.length > messageLimit ? `${message.slice(0, messageLimit - 3)}...` : message,
  });
  let value: unknown;
  try {
    value = readYamlData(text);
  } catch (error) {
    const problem = error instanceof CodecProblem
      ? error : new CodecProblem("invalid-encoding", "The file could not be read as discovery result YAML.");
    return failure(problem.code, problem.message);
  }
  const checked = validateDiscoveryResult(value, { baseline, sha256: baselineSha256 });
  return checked.status === "valid" ? { status: "success", result: checked.result, durationMs: performance.now() - started }
    : failure(checked.code, checked.message);
}

export const discoveryResultCodec = { decode: decodeDiscoveryResultYaml } satisfies DiscoveryResultCodec;
