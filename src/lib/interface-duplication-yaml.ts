import type { Baseline } from "../domain/generated/contracts.ts";
import { duplicationReportSchema, matchesDuplicationBaseline, validateDuplicationBinding } from "../domain/interface-duplication.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { CodecProblem } from "./architecture-yaml/limits.ts";
import { readYamlData } from "./architecture-yaml/parse.ts";
import type { DecodeDuplicationReportOutcome, DuplicationReportCodec } from "./generated/contracts.ts";

export function decodeDuplicationReportYaml(text: string, baseline: ReadonlyData<Baseline>, baselineSha256: string): DecodeDuplicationReportOutcome {
  const started = performance.now();
  try {
    const value = readYamlData(text);
    const version: unknown = typeof value === "object" && value !== null
      ? Object.getOwnPropertyDescriptor(value, "formatVersion")?.value : undefined;
    if (typeof version === "number" && version !== 1) {
      throw new CodecProblem("unsupported-version", "The duplication report format version is unsupported.");
    }
    const parsed = duplicationReportSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const limit = issue?.code === "custom" && issue.params?.reportLimit === true
        || issue?.code === "too_big" && (issue.origin === "string" || issue.origin === "array");
      throw new CodecProblem(limit ? "limit-exceeded" : "invalid-document",
        `The duplication report is invalid at ${issue?.path.join(".") || "document"}.${limit ? ` ${issue?.message}` : ""}`);
    }
    if (!matchesDuplicationBaseline(parsed.data, baseline, baselineSha256)) {
      return {
        status: "failure", stage: "decoding", code: "baseline-mismatch",
        message: "The duplication report belongs to different baseline bytes or identity.", durationMs: performance.now() - started,
      };
    }
    const [issue] = validateDuplicationBinding(parsed.data, baseline, baselineSha256);
    if (issue) throw new CodecProblem("invalid-document", issue);
    return { status: "success", report: parsed.data, durationMs: performance.now() - started };
  } catch (error) {
    const problem = error instanceof CodecProblem
      ? error : new CodecProblem("invalid-encoding", "The file could not be read as duplication report YAML.");
    return { status: "failure", stage: "decoding", code: problem.code, message: problem.message, durationMs: performance.now() - started };
  }
}

export const duplicationReportCodec = { decode: decodeDuplicationReportYaml } satisfies DuplicationReportCodec;
