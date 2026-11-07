import { z } from "zod";

const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_PATH_BYTES = 4096;
const U64_MAX = 18_446_744_073_709_551_615n;
const encoder = new TextEncoder();
const text = z.string().max(MAX_TEXT_BYTES).refine(
  (value) => value.length <= MAX_TEXT_BYTES && !/[\ud800-\udfff]/u.test(value) && encoder.encode(value).byteLength <= MAX_TEXT_BYTES,
  "Document text must fit its UTF-8 byte limit",
);
const path = z.string().min(1).max(MAX_PATH_BYTES).refine(
  (value) => value.length <= MAX_PATH_BYTES && !/[\ud800-\udfff\x00-\x1f\x7f]/u.test(value) &&
    encoder.encode(value).byteLength <= MAX_PATH_BYTES && /^(?:\/|[a-z]:[\\/]|\\\\)/iu.test(value),
  "Expected a bounded absolute document path",
);
const snapshotId = z.string().refine((value) => {
  const counter = /^document-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-([1-9][0-9]{0,19})$/u.exec(value)?.[1];
  return counter !== undefined && BigInt(counter) <= U64_MAX;
}, "Expected an opaque document snapshot identity");
const duration = z.number().finite().nonnegative();
const failure = z.strictObject({
  status: z.literal("failure"),
  stage: z.enum(["storage", "export", "cleanup"]),
  code: z.enum([
    "invalid-request", "invalid-snapshot", "snapshot-limit", "not-found", "not-file", "limit-exceeded",
    "invalid-utf8", "destination-exists", "source-changed", "cleanup-failed", "io-error", "unavailable", "invalid-response",
  ]),
  message: z.string().min(1).max(2048),
  durationMs: duration,
});
const snapshotRequest = z.strictObject({ snapshotId });
const readOutcome = z.union([z.strictObject({ status: z.literal("success"), text, durationMs: duration }), failure]);

export const documentContracts = {
  createDocumentSnapshot: {
    request: z.strictObject({ text }),
    outcome: z.union([z.strictObject({ status: z.literal("success"), snapshotId, durationMs: duration }), failure]),
  },
  readDocumentSnapshot: { request: snapshotRequest, outcome: readOutcome },
  releaseDocumentSnapshot: {
    request: snapshotRequest,
    outcome: z.union([z.strictObject({ status: z.literal("success"), released: z.literal(true), durationMs: duration }), failure]),
  },
  readDocumentFile: { request: z.strictObject({ path }), outcome: readOutcome },
  exportDocument: {
    request: z.strictObject({ path, text, overwrite: z.boolean() }),
    outcome: z.union([z.strictObject({ status: z.literal("success"), exported: z.literal(true), durationMs: duration }), failure]),
  },
  retryDocumentCleanup: {
    request: z.strictObject({}),
    outcome: z.union([z.strictObject({ status: z.literal("success"), cleaned: z.literal(true), durationMs: duration }), failure]),
  },
};
