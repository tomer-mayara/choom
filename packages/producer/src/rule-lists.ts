import type * as Yaml from 'yaml';
import { assert, exact, object } from './record-checks.ts';

// The parts that the pinned rule lists of Stage 4 share: the behavior entry rules and
// the resource access rules. Each list is one YAML file in packages/producer/rules of
// the tool checkout, and the producer code record does not cover that folder. So
// Stage 4 start checks each list against its contract, saves a copy and records its
// SHA-256, and each later Stage 4 action refuses a tool checkout whose list differs
// from that copy. The messages name a list by its label, such as behavior entry.
export type FieldCheck = (value: unknown) => boolean;
// A pinned rule list: its label, the name of its saved copy, its path in the tool checkout, and its contract check.
export interface RuleList<List> { label: string; file: string; path: string; check(value: unknown): List }

// The folder of the rule lists in the tool checkout.
export const ruleFolder = 'packages/producer/rules/';
const words = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const moduleName = /^(?:node:)?(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9._~-]+)*$/;
const callPathSyntax = /^(?:new )?[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\(\))*\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

// A JSON Schema maxLength counts Unicode code points.
export const matching = (pattern: RegExp, maxLength = Infinity): FieldCheck => value =>
  typeof value === 'string' && [...value].length <= maxLength && pattern.test(value);
const integerIn = (min: number, max: number): FieldCheck => value =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
// The checks of the fields that the contracts of both lists give in the same form.
export const fieldChecks = {
  id: matching(words, 128), version: integerIn(1, 1000000), library: matching(/\S/, 200),
  // Lowercase words that single hyphens join, such as http-route or database-table.
  kind: matching(words, 64),
  importName: matching(moduleName), callPath: matching(callPathSyntax),
  // The zero-based position of an argument, or the position of a call.
  position: integerIn(0, 255),
};

// The start of each message about a rule: its list, its number and its ID.
export function ruleMessage(label: string, rule: unknown, number: number): string {
  const id = object(rule) ? rule.id : undefined;
  return 'Invalid ' + label + ' rule ' + number + (typeof id === 'string' ? ' (' + id + ')' : '') + ': ';
}

// Exactly the fields of the contract, each with its check, and an ID that no earlier rule of the list uses.
export function checkRuleFields(rule: unknown, message: string, fields: Record<string, FieldCheck>, ids: Set<unknown>): void {
  const record = object(rule) ? rule : {};
  assert(exact(rule, Object.keys(fields)), message + 'use exactly the fields ' + Object.keys(fields).join(', ') + '.');
  for (const [field, check] of Object.entries(fields)) assert(check(record[field]), message + 'the field ' + field +
    ' does not follow the contract.');
  assert(!ids.has(record.id), message + 'the ID is already used.');
  ids.add(record.id);
}

// The rules of a list with formatVersion 1, at least one rule and no other field.
export function listedRules(value: unknown, label: string): unknown[] {
  assert(exact(value, ['formatVersion', 'rules']) && value.formatVersion === 1 && Array.isArray(value.rules) &&
    value.rules.length > 0, 'Invalid ' + label + ' rule list: use formatVersion: 1 and a list of rules, with no other field.');
  return value.rules;
}

// Reads a rule list from its YAML bytes: UTF-8 text with one YAML document, unique
// keys and no aliases. The list is producer data, so the bounded profile of the saved
// run records does not apply; that profile also needs the baseline rules, which a
// helper outside the tool checkout cannot load before it refuses to run.
export function readRules<List>(list: RuleList<List>, bytes: Buffer, yaml: typeof Yaml): List {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text).equals(bytes), 'The ' + list.label + ' rule list must use UTF-8.');
  const document = yaml.parseDocument(text, { uniqueKeys: true, merge: false, prettyErrors: false });
  assert(!document.errors.length && !document.warnings.length, 'The ' + list.label + ' rule list must contain valid YAML: ' +
    [...document.errors, ...document.warnings].map(problem => problem.message).join(' '));
  return list.check(document.toJS({ maxAliasCount: 0 }));
}

// Refuses a tool checkout whose rule list differs from the copy that Stage 4 start saved.
export function checkPinnedRules(list: RuleList<unknown>, savedCopy: Buffer, checkout: Buffer): void {
  assert(savedCopy.equals(checkout), 'The ' + list.label + ' rule list changed since Stage 4 start: ' + list.path +
    '. Restore it or start a new attempt.');
}
