import { z } from "zod";
import { baselineId, baselineText } from "./baseline-statements.ts";
import type { Baseline, BaselineDecisions, BaselineDecisionValue, BaselineDocumentation } from "./generated/contracts.ts";
import { isJsonData } from "./json-data.ts";
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

function shapeProblem({ path, message }: z.core.$ZodIssue): string {
  return path.length > 0 ? `The decision file is invalid at ${path.map(String).join(".")}: ${message}`
    : `The decision file is invalid: ${message}`;
}

function bindingProblems(decisions: BaselineDecisions, { baseline, sha256 }: SavedBaseline): string[] {
  const problems: string[] = [];
  if (decisions.baselineRef !== baseline.id)
    problems.push(`The decision file is for baseline ${decisions.baselineRef}, but the saved baseline is ${baseline.id}.`);
  if (decisions.baselineDigest !== sha256) problems.push(`The decision file gives the baseline digest ${decisions.baselineDigest}, ` +
    `but the SHA-256 of the saved baseline file is ${sha256}.`);
  return problems;
}

// Each entry names one proposed statement of the baseline, and no other entry names it.
function entryProblems({ entries }: BaselineDecisions, baseline: ReadonlyData<Baseline>): string[] {
  const statements = new Map(baselineStatements(baseline).map((item) => [statementName(item), item.statement]));
  const decided = new Map<string, number>();
  const problems: string[] = [];
  entries.forEach((entry, index) => {
    const name = statementName(entry);
    const statement = statements.get(name);
    const first = decided.get(name);
    if (first === undefined) decided.set(name, index);
    if (statement === undefined) problems.push(`entries.${index}: ${name} is not a statement of baseline ${baseline.id}.`);
    else if (first !== undefined)
      problems.push(`entries.${index}: ${name} already has a decision in entries.${first}. Give one entry for each statement.`);
    else if (statement.status !== "proposed") problems.push(`entries.${index}: ${name} is accepted already ` +
      `(acceptanceRef ${statement.acceptanceRef}). Only a proposed statement can be decided.`);
  });
  return problems;
}

/**
 * Checks a decision file against one saved baseline. It reads no file and knows
 * no run, so the viewer and the producer can both use it. It returns the typed
 * decisions, or every problem that it found.
 */
export function validateDecisions(input: unknown, saved: SavedBaseline): DecisionsCheck {
  const parsed = baselineDecisionsSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", problems: parsed.error.issues.map(shapeProblem) };
  const decisions = parsed.data;
  const problems = bindingProblems(decisions, saved);
  if (problems.length === 0) problems.push(...entryProblems(decisions, saved.baseline));
  return problems.length > 0 ? { status: "invalid", problems } : { status: "valid", decisions };
}
