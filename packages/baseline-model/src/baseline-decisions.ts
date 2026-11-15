import { z } from "zod";
import { baselineSchema } from "./baseline.ts";
import { baselineId, baselineText } from "./baseline-statements.ts";
import type {
  Baseline, BaselineCorrectDecision, BaselineDecision, BaselineDecisions, BaselineDecisionValue, BaselineDocumentation,
} from "./generated/contracts.ts";
import { isJsonData, sameJsonData } from "./json-data.ts";
import type { ReadonlyData } from "./readonly-data.ts";

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

// The parts of a statement that the decision checks read.
interface StatementState {
  readonly value: unknown;
  readonly status: "proposed" | "accepted";
  readonly acceptanceRef?: string;
}

/** One statement of a baseline: an item field with a value, a status and evidence. */
export interface BaselineStatement {
  /** The ID of the component, interface, resource or rule. */
  readonly itemId: string;
  /** The path of the statement in the item, such as `purpose` or `documentation.entries.decode.kind`. */
  readonly field: string;
  readonly statement: StatementState;
}

/** A baseline that the shared baseline rules accept, and the SHA-256 of its saved file bytes. */
export interface SavedBaseline {
  readonly baseline: ReadonlyData<Baseline>;
  /** 64 lowercase hexadecimal digits. */
  readonly sha256: string;
}

export type DecisionsCheck =
  | { readonly status: "valid"; readonly decisions: BaselineDecisions }
  | { readonly status: "invalid"; readonly problems: readonly string[] };

type AddStatement = (itemId: string, field: string, statement: StatementState | undefined) => void;

// The item fields that hold one statement each. `parent` is optional.
const statementFields = {
  components: ["purpose", "membership", "groupingReason", "parent"],
  interfaces: ["owner", "publicAccess", "allowedConsumers", "promises"],
  resources: ["identity", "owner", "accessRules"],
  rules: ["subject", "expected", "check"],
} as const;

// The statements of version 2 to 5 interface documentation, with the field paths
// that discovery questions and gaps also use.
function addDocumentationStatements(itemId: string, documentation: ReadonlyData<BaselineDocumentation>, add: AddStatement): void {
  add(itemId, "documentation.summary", documentation.summary);
  for (const entry of documentation.entries) {
    const path = `documentation.entries.${entry.id}`;
    add(itemId, `${path}.kind`, entry.kind);
    add(itemId, `${path}.description`, entry.description);
    add(itemId, `${path}.signature`, entry.signature);
    add(itemId, `${path}.interaction`, entry.interaction);
    for (const example of entry.examples) add(itemId, `${path}.examples.${example.id}.content`, example.content);
  }
}

/** Every statement of the baseline, in the order of the baseline. */
export function baselineStatements(baseline: ReadonlyData<Baseline>): BaselineStatement[] {
  const statements: BaselineStatement[] = [];
  const add: AddStatement = (itemId, field, statement) => {
    if (statement !== undefined) statements.push({ itemId, field, statement });
  };
  for (const item of baseline.components) for (const field of statementFields.components) add(item.id, field, item[field]);
  for (const item of baseline.interfaces) {
    for (const field of statementFields.interfaces) add(item.id, field, item[field]);
    if ("documentation" in item && item.documentation) addDocumentationStatements(item.id, item.documentation, add);
  }
  for (const item of baseline.resources) for (const field of statementFields.resources) add(item.id, field, item[field]);
  for (const item of baseline.rules) for (const field of statementFields.rules) add(item.id, field, item[field]);
  return statements;
}

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

// The new values keep the baseline valid under the shared baseline rules, also
// together, as the next baseline version will have them.
function correctedBaselineProblems({ entries }: BaselineDecisions, baseline: ReadonlyData<Baseline>): string[] {
  const corrections = entries.filter(isCorrection);
  if (corrections.length === 0) return [];
  const corrected = structuredClone(baseline);
  const statements = new Map(baselineStatements(corrected).map((item) => [statementName(item), item.statement]));
  // The copy belongs to this check, so the check can change its statements.
  for (const entry of corrections) Object.assign(statements.get(statementName(entry)) ?? {}, { value: entry.newValue });
  const result = baselineSchema.safeParse(corrected);
  return result.success ? [] : result.error.issues.map((issue) => correctedProblem(corrected, issue));
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
 * Checks a decision file against one saved baseline. It reads no file and knows
 * no run, so the viewer and the producer can both use it. It returns the typed
 * decisions, or every problem that it found. The checks stop after a problem of
 * the shape or of the baseline binding. The new values are checked together
 * when every entry names a proposed statement with its current value.
 */
export function validateDecisions(input: unknown, saved: SavedBaseline): DecisionsCheck {
  const parsed = baselineDecisionsSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", problems: parsed.error.issues.map(shapeProblem) };
  const decisions = parsed.data;
  const problems = bindingProblems(decisions, saved);
  if (problems.length === 0) problems.push(...entryProblems(decisions, saved.baseline));
  if (problems.length === 0) problems.push(...correctedBaselineProblems(decisions, saved.baseline));
  return problems.length > 0 ? { status: "invalid", problems } : { status: "valid", decisions };
}
