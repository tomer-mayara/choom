import { z } from "zod";

const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_PATH_BYTES = 4096;
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
const duration = z.number().finite().nonnegative();
const sha256 = z.string().length(64).regex(/^[a-f0-9]{64}$/);
const failure = z.strictObject({
  status: z.literal("failure"),
  stage: z.literal("storage"),
  code: z.enum([
    "invalid-request", "not-found", "not-file", "limit-exceeded",
    "invalid-utf8", "source-changed", "io-error", "unavailable", "invalid-response",
  ]),
  message: z.string().min(1).max(2048),
  durationMs: duration,
});
const readOutcome = z.union([z.strictObject({ status: z.literal("success"), text, sha256, durationMs: duration }), failure]);

export const documentContracts = {
  readDocumentFile: { request: z.strictObject({ path }), outcome: readOutcome },
};
