import { z } from "zod";
import { baselineFileDigestSchema } from "./baseline-decisions.ts";
import { baselineId, baselineText } from "./baseline-statements.ts";
import type { DiscoveryResult } from "./generated/contracts.ts";
import { utf8Bounded, utf8Length } from "./utf8-limits.ts";

// The part of a fixed discovery result that the viewer reads (CR-004). TypeSpec
// owns the structure (discovery-result.tsp). This schema also checks the UTF-8
// byte limits, the limit of questions and gaps together, the text budget and the
// unique IDs. An issue of a limit has the code too_big or the params of `limit`.

const recordLimit = 5_000;
const textBudget = 4 * 1024 * 1024;
const shownLength = 200;
const limit = { limit: true };

const reference = utf8Bounded(baselineText, 4 * 1024, limit);
const text = utf8Bounded(baselineText, 16 * 1024, limit);
const subjectRefs = z.array(reference).min(1, "Expected at least one subject reference.")
  .max(100, "The limit is 100 subject references for each question or gap.");
const evidenceRefs = z.array(reference).min(1, "Expected at least one evidence reference.");
const records = <Item extends z.ZodType>(item: Item) => z.array(item).max(recordLimit, `The limit is ${recordLimit} questions and gaps together.`);
const question = z.strictObject({ id: reference, subjectRefs, text, evidenceRefs });
const gap = z.strictObject({ id: reference, kind: reference, subjectRefs, reason: text, evidenceRefs });

/** Why a discovery result cannot be shown with a saved baseline. */
export type DiscoveryProblemCode = "unsupported-version" | "invalid-document" | "limit-exceeded" | "baseline-mismatch";

/** The saved baseline file that a discovery result must name: the baseline ID and the SHA-256 of the file bytes. */
export interface DiscoveryBaseline {
  readonly baseline: { readonly id: string };
  readonly sha256: string;
}

/** The checked discovery result, or the first problem that the checks found. */
export type DiscoveryCheck =
  | { readonly status: "valid"; readonly result: DiscoveryResult }
  | { readonly status: "invalid"; readonly code: DiscoveryProblemCode; readonly message: string };

/** A value in a message, shortened after 200 characters. */
function shownValue(value: string): string {
  return value.length > shownLength ? `${value.slice(0, shownLength)}...` : value;
}

// All string values of the result, also those of the fields that the viewer does
// not read, counted as for the duplication report: the UTF-8 bytes of each value
// that occurs, and no keys. The walk uses a list, so deep data cannot exhaust the
// call stack, and it stops at the budget.
function withinTextBudget(value: unknown): boolean {
  const pending: unknown[] = [value];
  let bytes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") bytes += utf8Length(current);
    else if (current !== null && typeof current === "object") for (const child of Object.values(current)) pending.push(child);
    if (bytes > textBudget) return false;
  }
  return true;
}

function checkRecords(result: DiscoveryResult, context: z.RefinementCtx): void {
  const count = result.questions.length + result.gaps.length;
  if (count > recordLimit) context.addIssue({ code: "custom", params: limit,
    message: `The discovery result has ${count} questions and gaps. The limit is ${recordLimit} together.` });
  const ids = new Set<string>();
  for (const key of ["questions", "gaps"] as const) {
    result[key].forEach(({ id }, index) => {
      if (ids.has(id)) context.addIssue({ code: "custom", path: [key, index, "id"],
        message: `The ID ${shownValue(id)} is used more than once. Each question and gap needs its own ID.` });
      ids.add(id);
    });
  }
  if (!withinTextBudget(result)) context.addIssue({ code: "custom", params: limit,
    message: `The text values of the discovery result are more than ${textBudget} UTF-8 bytes (4 MiB) together.` });
}

export const discoveryResultSchema = z.strictObject({
  formatVersion: z.literal(2),
  kind: z.literal("architecture-discovery"),
  baselineRef: baselineId,
  baselineDigest: baselineFileDigestSchema,
  runRef: z.unknown(),
  entryAnalysisRef: z.unknown(),
  codeMappingRef: z.unknown(),
  dependenciesRef: z.unknown(),
  resourceAccessRef: z.unknown(),
  overview: z.unknown(),
  inspectedPaths: z.unknown(),
  questions: records(question),
  gaps: records(gap),
}).superRefine(checkRecords) satisfies z.ZodType<DiscoveryResult>;

const invalid = (code: DiscoveryProblemCode, message: string): DiscoveryCheck => ({ status: "invalid", code, message });
const notDiscovery = "The file is not a discovery result.";
const reopen = "Open the discovery result of the run that saved this baseline file.";

// An own data field of an unchecked value, without running a getter.
function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}

function kindProblem(kind: unknown): DiscoveryCheck | undefined {
  if (kind === "architecture-discovery") return undefined;
  return invalid("invalid-document", typeof kind === "string"
    ? `${notDiscovery} Its kind is ${shownValue(kind)}; a discovery result has kind: architecture-discovery.`
    : `${notDiscovery} A discovery result has kind: architecture-discovery.`);
}

// Decision D20: version 1 names the baseline by its ID only, and IDs repeat across runs.
function versionProblem(version: unknown): DiscoveryCheck | undefined {
  if (typeof version !== "number" || version === 2) return undefined;
  return invalid("unsupported-version", version === 1 ? "The discovery result has formatVersion: 1. Version 1 gives no " +
    "baseline digest, so the viewer cannot bind it to the open baseline file. Open the version 2 discovery result of a new run."
    : `The discovery result format version ${version} is unsupported. The viewer opens version 2.`);
}

function shapeProblem(issue: z.core.$ZodIssue | undefined): DiscoveryCheck {
  const isLimit = issue?.code === "too_big" || (issue?.code === "custom" && issue.params?.limit === true);
  const path = issue?.path.map(String).join(".") ?? "";
  const message = issue?.message ?? "The discovery result does not match its contract.";
  if (isLimit) return invalid("limit-exceeded", path ? `The discovery result exceeds a limit at ${path}: ${message}` : message);
  return invalid("invalid-document", path ? `The discovery result is invalid at ${path}: ${message}`
    : `The discovery result is invalid: ${message}`);
}

function bindingProblem({ baselineRef, baselineDigest }: DiscoveryResult, { baseline, sha256 }: DiscoveryBaseline): DiscoveryCheck | undefined {
  if (baselineRef !== baseline.id) return invalid("baseline-mismatch", "The discovery result is for baseline " +
    `${shownValue(baselineRef)}, but the open baseline is ${shownValue(baseline.id)}. ${reopen}`);
  if (baselineDigest !== sha256) return invalid("baseline-mismatch", "The discovery result is for the baseline file with " +
    `SHA-256 ${baselineDigest}, but the open baseline file has SHA-256 ${shownValue(sha256)}. ${reopen}`);
  return undefined;
}

/**
 * Checks a discovery result against one saved baseline file. It reads no file,
 * so the viewer and the producer can both use it. The checks run in this order:
 * the kind, the format version (version 1 has no baseline digest, decision
 * D20), the shape with its limits and unique IDs, and then the baseline ID and
 * the SHA-256 of the baseline file. The result keeps every record in its saved
 * order; a limit refuses the file and never drops a record.
 */
export function validateDiscoveryResult(input: unknown, saved: DiscoveryBaseline): DiscoveryCheck {
  const early = kindProblem(field(input, "kind")) ?? versionProblem(field(input, "formatVersion"));
  if (early) return early;
  const parsed = discoveryResultSchema.safeParse(input);
  if (!parsed.success) return shapeProblem(parsed.error.issues[0]);
  return bindingProblem(parsed.data, saved) ?? { status: "valid", result: parsed.data };
}
