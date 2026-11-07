import { z } from "zod";

const encoder = new TextEncoder();
const MAX_REPORT_BYTES = 16 * 1024 * 1024;
const U64_MAX = 18_446_744_073_709_551_615n;
const boundedText = (limit: number) => z.string().min(1).max(limit).refine(
  (value) => value.length <= limit && encoder.encode(value).byteLength <= limit && !/[\x00-\x1f\x7f]/u.test(value),
);
const opaqueId = (prefix: string) => z.string().refine((value) => {
  const suffix = value.slice(prefix.length);
  return value.startsWith(prefix) && /^[1-9][0-9]{0,19}$/u.test(suffix) && BigInt(suffix) <= U64_MAX;
});
const canonicalPath = boundedText(4096).refine((value) => value === "."
  || (!/[\\:]/u.test(value) && value.split("/").every((part) => part !== "" && part !== "." && part !== "..")));
const inputPath = canonicalPath.refine((value) => !/[\*?\[\]{}()]/u.test(value) && !value.startsWith("-"));
const duration = z.number().finite().nonnegative();
const stage = z.enum(["setup", "analysis", "cleanup"]);
const job = z.strictObject({ jobId: opaqueId("analysis-") });
const failure = z.strictObject({
  status: z.literal("failure"),
  stage,
  code: z.enum([
    "invalid-request", "invalid-session", "invalid-job", "busy", "node-not-found", "unsupported-node",
    "analyzer-not-found", "unsupported-analyzer", "unsupported-config-path", "source-changed", "execution-failed",
    "timed-out", "output-limit", "report-missing", "report-invalid", "cleanup-failed", "unavailable", "invalid-response",
  ]),
  message: boundedText(2048),
  durationMs: duration,
});

export const analyzerContracts = {
  prepareDepCruiser: {
    request: z.strictObject({
      repositorySession: opaqueId("repository-"),
      config: canonicalPath.refine((value) => value !== "." && !value.startsWith("-")),
      inputs: z.array(inputPath).min(1).max(128),
      nodeExecutable: boundedText(4096).refine((value) => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(value)).optional(),
    }),
    outcome: z.union([z.strictObject({ status: z.literal("success"), value: job }), failure]),
  },
  runDepCruiser: {
    request: job,
    outcome: z.union([
      z.strictObject({
        status: z.literal("completed"),
        reportJson: z.string().min(1).max(MAX_REPORT_BYTES).refine((value) => value.length <= MAX_REPORT_BYTES && encoder.encode(value).byteLength <= MAX_REPORT_BYTES),
        version: z.literal("18.7.2"),
        workingDirectory: z.literal("."),
        completedAtMs: z.number().int().nonnegative().max(253_402_300_799_999),
        durationMs: duration,
      }),
      z.strictObject({ status: z.literal("cancelled"), durationMs: duration }),
      failure,
    ]),
  },
  cancelDepCruiser: {
    request: job,
    outcome: z.union([z.strictObject({ status: z.literal("success"), stopped: z.literal(true) }), failure]),
  },
  releaseDepCruiser: {
    request: job,
    outcome: z.union([z.strictObject({ status: z.literal("success"), released: z.literal(true) }), failure]),
  },
  progress: z.strictObject({ jobId: opaqueId("analysis-"), stage, elapsedMs: duration }),
};
