import type { BaselineDecodeFailureCode } from "../generated/contracts.ts";

const MAX_YAML_BYTES = 16 * 1024 * 1024;
export const MAX_YAML_DEPTH = 32;
export const MAX_YAML_NODES = 250_000;

const utf8 = new TextEncoder();

export class CodecProblem extends Error {
  readonly code: BaselineDecodeFailureCode;

  constructor(code: BaselineDecodeFailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function invalidEncoding(message: string): never {
  throw new CodecProblem("invalid-encoding", message);
}

export function structureLimit(): never {
  throw new CodecProblem("limit-exceeded", "The architecture document exceeds the structure limit.");
}

export function utf8Bytes(text: string, remaining = MAX_YAML_BYTES): number {
  const bytes = text.length <= remaining ? utf8.encode(text).byteLength : remaining + 1;
  if (bytes > remaining) {
    throw new CodecProblem("limit-exceeded", "The architecture document exceeds the UTF-8 byte limit.");
  }
  return bytes;
}
