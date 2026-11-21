import { z } from "zod";
import { baselineSchema } from "./baseline.ts";
import { baselineId, baselineText } from "./baseline-statements.ts";
import type {
  Baseline, BaselineCorrectDecision, BaselineDecision, BaselineDecisions, BaselineDecisionValue,
} from "./generated/contracts.ts";
import { baselineStatements } from "./item-statements.ts";
import { isJsonData, sameJsonData } from "./json-data.ts";
import type { ReadonlyData } from "./readonly-data.ts";

// The decision file: human decisions that accept or correct statements of one
// saved baseline. TypeSpec owns the structure (baseline-decisions.tsp). This
// schema also checks the calendar date of the decision time and that each value
// is JSON data.
const decisionValue = z.custom<BaselineDecisionValue>(isJsonData, { message: "Expected JSON data." });
const statement = { itemId: baselineId, field: baselineText };

/** The SHA-256 of the saved baseline file bytes, as a decision file and a discovery result give it. */
export const baselineFileDigestSchema = z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 of 64 lowercase hexadecimal digits.");

export const baselineDecisionsSchema = z.strictObject({
  formatVersion: z.literal(1),
  id: baselineId.max(128, "The decision record ID limit is 128 characters."),
  baselineRef: baselineId,
  baselineDigest: baselineFileDigestSchema,
  decider: z.strictObject({ name: baselineText, kind: z.literal("human") }),
  decidedAt: z.iso.datetime("Expected an RFC 3339 time in UTC, such as 2026-11-15T10:30:00Z."),
  entries: z.array(z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("accept"), ...statement }),
    z.strictObject({ action: z.literal("correct"), ...statement, oldValue: decisionValue, newValue: decisionValue }),
  ])).min(1, "A decision file needs at least one entry."),
}) satisfies z.ZodType<BaselineDecisions>;

/** A baseline that the shared baseline rules accept, and the SHA-256 of its saved file bytes. */
export interface SavedBaseline {
  readonly baseline: ReadonlyData<Baseline>;
  /** 64 lowercase hexadecimal digits. */
  readonly sha256: string;
}

export type DecisionsCheck =
  | { readonly status: "valid"; readonly decisions: BaselineDecisions }
  | { readonly status: "invalid"; readonly problems: readonly string[] };

/** The next baseline version that a decision file makes, with the checked decisions, or every problem that the checks found. */
export type NextVersion =
  | { readonly status: "valid"; readonly baseline: Baseline; readonly decisions: BaselineDecisions }
  | { readonly status: "invalid"; readonly problems: readonly string[] };

const statementName = ({ itemId, field }: { itemId: string; field: string }): string => `${itemId}.${field}`;
const isCorrection = (entry: BaselineDecision): entry is BaselineCorrectDecision => entry.action === "correct";
const itemKinds: Readonly<Record<string, string>> = { components: "component", interfaces: "interface", resources: "resource",
  rules: "rule" };
const shownLength = 200;

// A value as JSON text for a message, shortened after 200 characters.
function shown(value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return "(a value that cannot be shown)";
  }
  return text === undefined ? String(value) : text.length > shownLength ? text.slice(0, shownLength) + "..." : text;
}

function shapeProblem({ path, message }: z.core.$ZodIssue): string {
  return path.length > 0 ? `The decision file is invalid at ${path.map(String).join(".")}: ${message}`
    : `The decision file is invalid: ${message}`;
}

function collectionItems(baseline: ReadonlyData<Baseline>, collection: PropertyKey | undefined): readonly { readonly id: string }[] {
  switch (collection) {
    case "components": return baseline.components;
    case "interfaces": return baseline.interfaces;
    case "resources": return baseline.resources;
    case "rules": return baseline.rules;
    default: return [];
  }
}

// A problem of the corrected baseline: the path, the item that it is in, and the rule.
function correctedProblem(baseline: ReadonlyData<Baseline>, { path, message }: z.core.$ZodIssue): string {
  const [collection, index] = path;
  const item = typeof index === "number" ? collectionItems(baseline, collection)[index] : undefined;
  const place = path.map(String).join(".") + (item ? ` (${itemKinds[String(collection)]} ${item.id})` : "");
  return place ? `After the corrections, the baseline is invalid at ${place}: ${message}`
    : `After the corrections, the baseline is invalid: ${message}`;
}

// A correction names the current value as its old value, and changes it.
function correctionProblem(at: string, name: string, { oldValue, newValue }: BaselineCorrectDecision, current: unknown): string[] {
  if (!sameJsonData(oldValue, current)) return [`${at}: the old value of ${name} is not the current value. ` +
    `Expected oldValue: ${shown(current)}. Given oldValue: ${shown(oldValue)}.`];
  if (sameJsonData(newValue, oldValue))
    return [`${at}: the correction of ${name} gives the current value as the new value. Use accept to keep a value.`];
  return [];
}

// These statements directly control an owner, a public entry or a checked policy.
// Reviewers can also cite other input statements, for example a purpose used to assign a role.
const boundaryFields = new Set(["membership", "owner", "publicAccess", "allowedConsumers", "accessRules", "subject", "expected", "check"]);

// The baseline as the decisions change it, before the shared rules check it. The
// ID of the next version is the ID of the baseline, a hyphen and the ID of the
// decision record. Both are lowercase IDs with hyphens, so the new ID is one too,
// and it is longer than the ID of its parent. Each decided statement is accepted
// with the ID of the decision record as its acceptance reference, and a
// correction also replaces its value. All other values stay the same.
function decidedCopy(baseline: ReadonlyData<Baseline>, decisions: BaselineDecisions): ReadonlyData<Baseline> {
  const copy = structuredClone(baseline);
  // The copy belongs to this function, so it can change its fields and statements.
  Object.assign(copy, { id: `${baseline.id}-${decisions.id}`, parentId: baseline.id });
  const statements = new Map(baselineStatements(copy).map((item) => [statementName(item), item.statement]));
  if (copy.formatVersion === 6) {
    const review = copy.boundaryReview;
    const inputs = new Set([...review.statementRefs ?? [], ...review.rules.flatMap(rule => rule.statementRef ? [rule.statementRef] : [])]);
    if (decisions.entries.some(entry => boundaryFields.has(entry.field) || inputs.has(statementName(entry)))) {
      Object.assign(review, { status: "needs-refresh" });
    }
  }
  for (const entry of decisions.entries) {
    const value = isCorrection(entry) ? { value: entry.newValue } : {};
    Object.assign(statements.get(statementName(entry)) ?? {}, value, { status: "accepted", acceptanceRef: decisions.id });
  }
  return copy;
}

function bindingProblems(decisions: BaselineDecisions, { baseline, sha256 }: SavedBaseline): string[] {
  const problems: string[] = [];
  if (decisions.baselineRef !== baseline.id)
    problems.push(`The decision file is for baseline ${decisions.baselineRef}, but the saved baseline is ${baseline.id}.`);
  if (decisions.baselineDigest !== sha256) problems.push(`The decision file gives the baseline digest ${decisions.baselineDigest}, ` +
    `but the SHA-256 of the saved baseline file is ${sha256}.`);
  return problems;
}

// Each entry names one proposed statement of the baseline, and no other entry
// names it. A correction names the current value and changes it.
function entryProblems({ entries }: BaselineDecisions, baseline: ReadonlyData<Baseline>): string[] {
  const statements = new Map(baselineStatements(baseline).map((item) => [statementName(item), item.statement]));
  const decided = new Map<string, number>();
  const problems: string[] = [];
  entries.forEach((entry, index) => {
    const [at, name] = [`entries.${index}`, statementName(entry)];
    const statement = statements.get(name);
    const first = decided.get(name);
    if (first === undefined) decided.set(name, index);
    if (statement === undefined) problems.push(`${at}: ${name} is not a statement of baseline ${baseline.id}.`);
    else if (first !== undefined)
      problems.push(`${at}: ${name} already has a decision in entries.${first}. Give one entry for each statement.`);
    else if (statement.status !== "proposed") problems.push(`${at}: ${name} is accepted already ` +
      `(acceptanceRef ${statement.acceptanceRef}). Only a proposed statement can be decided.`);
    else if (isCorrection(entry)) problems.push(...correctionProblem(at, name, entry, statement.value));
  });
  return problems;
}

/**
 * Makes the next version of a saved baseline from a decision file. It reads no
 * file and changes neither the parent nor the decision file. First it checks the
 * decision file, with the problems that validateDecisions gives: the shape, the
 * baseline binding, the entries, and then the new values together in the next
 * version under the shared baseline rules. It returns the version only when all
 * checks pass.
 *
 * The version has the ID `<parent ID>-<decision record ID>` and names the parent
 * in `parentId`. Each decided statement is `accepted`, with the decision record
 * ID as its `acceptanceRef`, and a correction also replaces its value. All other
 * statements stay as in the parent. Boundary-affecting decisions mark a v6 review
 * as needing refresh. The review keeps its evidence, with its items and entries
 * in the same order. The version shares no object with the parent or the file.
 */
export function nextBaselineVersion(parent: SavedBaseline, input: unknown): NextVersion {
  const parsed = baselineDecisionsSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", problems: parsed.error.issues.map(shapeProblem) };
  const decisions = parsed.data;
  const problems = bindingProblems(decisions, parent);
  if (problems.length === 0) problems.push(...entryProblems(decisions, parent.baseline));
  if (problems.length > 0) return { status: "invalid", problems };
  // The new values keep the baseline valid under the shared baseline rules, also together.
  const copy = decidedCopy(parent.baseline, decisions);
  const result = baselineSchema.safeParse(copy);
  return result.success ? { status: "valid", baseline: result.data, decisions }
    : { status: "invalid", problems: result.error.issues.map((issue) => correctedProblem(copy, issue)) };
}

/**
 * Checks a decision file against one saved baseline. It reads no file and knows
 * no run, so the viewer and the producer can both use it. It returns the typed
 * decisions, or every problem that it found. These are the checks of
 * nextBaselineVersion: the checks stop after a problem of the shape or of the
 * baseline binding, and the new values are checked together when every entry
 * names a proposed statement with its current value.
 */
export function validateDecisions(input: unknown, saved: SavedBaseline): DecisionsCheck {
  const next = nextBaselineVersion(saved, input);
  return next.status === "valid" ? { status: "valid", decisions: next.decisions } : next;
}
