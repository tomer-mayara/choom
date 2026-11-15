import { z } from "zod";
import { baselineId, baselineText } from "./baseline-statements.ts";
import type { BaselineDecisions, BaselineDecisionValue } from "./generated/contracts.ts";
import { isJsonData } from "./json-data.ts";

// The decision file: human decisions that accept or correct statements of one
// saved baseline. TypeSpec owns the structure (baseline-decisions.tsp). This
// schema also checks the calendar date of the decision time and that each value
// is JSON data.
const decisionValue = z.custom<BaselineDecisionValue>(isJsonData, { message: "Expected JSON data." });
const statement = { itemId: baselineId, field: baselineText };

export const baselineDecisionsSchema = z.strictObject({
  formatVersion: z.literal(1),
  id: baselineId.max(128, "The decision record ID limit is 128 characters."),
  baselineRef: baselineId,
  baselineDigest: z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 of 64 lowercase hexadecimal digits."),
  decider: z.strictObject({ name: baselineText, kind: z.literal("human") }),
  decidedAt: z.iso.datetime("Expected an RFC 3339 time in UTC, such as 2026-11-15T10:30:00Z."),
  entries: z.array(z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("accept"), ...statement }),
    z.strictObject({ action: z.literal("correct"), ...statement, oldValue: decisionValue, newValue: decisionValue }),
  ])).min(1, "A decision file needs at least one entry."),
}) satisfies z.ZodType<BaselineDecisions>;
