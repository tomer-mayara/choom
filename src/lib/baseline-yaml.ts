import { baselineSchema } from "../domain/baseline.ts";
import { CodecProblem } from "./architecture-yaml/limits.ts";
import { readYamlData } from "./architecture-yaml/parse.ts";
import type { BaselineCodec, DecodeBaselineOutcome } from "./generated/contracts.ts";

export function decodeBaselineYaml(text: string): DecodeBaselineOutcome {
  const start = performance.now();
  try {
    const value = readYamlData(text);
    const version: unknown = typeof value === "object" && value !== null
      ? Object.getOwnPropertyDescriptor(value, "formatVersion")?.value : undefined;
    if (typeof version === "number" && version !== 1 && version !== 2) {
      throw new CodecProblem("unsupported-version", "The baseline format version is unsupported.");
    }
    if (typeof value === "object" && value !== null && !Object.hasOwn(value, "formatVersion")
      && Object.getOwnPropertyDescriptor(value, "schemaVersion")?.value === 1) {
      throw new CodecProblem("invalid-document", "Legacy diagrams are unsupported. Open a baseline with formatVersion: 1 or 2.");
    }
    const result = baselineSchema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join(".");
      const documentationIssue = issue?.path[0] === "interfaces"
        && (issue.path.length === 1 || issue.path[2] === "documentation")
        && (issue.code === "custom" || issue.code === "too_big");
      const detail = documentationIssue ? ` ${issue.message}` : "";
      throw new CodecProblem("invalid-document", path
        ? `The baseline is invalid at ${path}.${detail}`
        : "The baseline does not match the schema.");
    }
    return { status: "success", baseline: result.data, durationMs: performance.now() - start };
  } catch (error) {
    const problem = error instanceof CodecProblem
      ? error
      : new CodecProblem("invalid-encoding", "The file could not be read as baseline YAML.");
    return {
      status: "failure", stage: "decoding", code: problem.code, message: problem.message,
      durationMs: performance.now() - start,
    };
  }
}

export const baselineCodec = { decode: decodeBaselineYaml } satisfies BaselineCodec;
