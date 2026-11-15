import { z } from "zod";

export const baselineText = z.string().regex(/\S/, "Expected nonblank text.");
export const baselineId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase ID with optional hyphens.");

export function baselineStatement<Value extends z.ZodType>(value: Value, reference = baselineText) {
  return z.discriminatedUnion("status", [
    z.strictObject({ value, status: z.literal("proposed"), evidenceRefs: z.array(reference).min(1) }),
    z.strictObject({ value, status: z.literal("accepted"), evidenceRefs: z.array(reference).min(1), acceptanceRef: reference }),
  ]);
}
