import type * as Yaml from 'yaml';
import type { BehaviorEntryRule, BehaviorEntryRuleList } from './generated/contracts.ts';
import { assert, exact, object } from './record-checks.ts';

// The pinned list of Choom behavior entry rules and its check against the contract
// in cookbook/interfaces/behavior-entry-rules.tsp. The list is one YAML file in the
// producer package. Stage 4 start saves a copy of it and its SHA-256, and Stage 4
// collect applies its rules. The check also refuses a repeated rule ID and a call
// rule that names one argument as both the name and the handler.
type FieldCheck = (value: unknown) => boolean;

export const behaviorEntryRulesFile = 'behavior-entry-rules.yaml';
// The list in the tool checkout. The producer code record does not cover this
// folder, so Stage 4 start records the SHA-256 of the list itself.
export const behaviorEntryRulesPath = 'packages/producer/rules/' + behaviorEntryRulesFile;

const words = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const moduleName = /^(?:node:)?(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9._~-]+)*$/;
export const callPathSyntax = /^(?:new )?[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\(\))*\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const propertyPath = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const fileGlob = /^[^/\s\\][^\s\\]*$/;

// A JSON Schema maxLength counts Unicode code points.
const matching = (pattern: RegExp, maxLength = Infinity): FieldCheck => value =>
  typeof value === 'string' && [...value].length <= maxLength && pattern.test(value);
const integerIn = (min: number, max: number): FieldCheck => value =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const argument = integerIn(0, 255);
const shared: Record<string, FieldCheck> = {
  id: matching(words, 128), version: integerIn(1, 1000000), library: matching(/\S/, 200), entryKind: matching(words, 64),
};
// The fields of each kind of rule, in the order of the contract.
const ruleFields: Record<BehaviorEntryRule['kind'], Record<string, FieldCheck>> = {
  'call': { ...shared, kind: value => value === 'call', importName: matching(moduleName), callPath: matching(callPathSyntax),
    nameArgument: value => value === null || argument(value),
    handlerArgument: value => value === null || value === 'last' || argument(value) },
  'settings-literal': { ...shared, kind: value => value === 'settings-literal', fileGlob: matching(fileGlob, 200),
    propertyPath: matching(propertyPath, 200) },
};

// The fields of a rule of a known kind, each with its contract check.
function checkRule(rule: unknown, number: number, ids: Set<unknown>): void {
  const record = object(rule) ? rule : {};
  const label = 'Invalid behavior entry rule ' + number + (typeof record.id === 'string' ? ' (' + record.id + ')' : '') + ': ';
  const fields = Object.hasOwn(ruleFields, String(record.kind)) ? ruleFields[record.kind as BehaviorEntryRule['kind']] : undefined;
  assert(fields, label + 'kind must be call or settings-literal.');
  assert(exact(rule, Object.keys(fields)), label + 'use exactly the fields ' + Object.keys(fields).join(', ') + '.');
  for (const [field, check] of Object.entries(fields)) assert(check(record[field]), label + 'the field ' + field +
    ' does not follow the contract.');
  assert(!ids.has(record.id), label + 'the ID is already used.');
  ids.add(record.id);
  assert(record.kind !== 'call' || record.nameArgument === null || record.nameArgument !== record.handlerArgument,
    label + 'the name argument and the handler argument are the same.');
}

// The rule list, after the check of each field.
export function checkRuleList(value: unknown): BehaviorEntryRuleList {
  assert(exact(value, ['formatVersion', 'rules']) && value.formatVersion === 1 && Array.isArray(value.rules) &&
    value.rules.length > 0, 'Invalid behavior entry rule list: use formatVersion: 1 and a list of rules, with no other field.');
  const ids = new Set<unknown>();
  value.rules.forEach((rule, index) => checkRule(rule, index + 1, ids));
  return value as unknown as BehaviorEntryRuleList;
}

// Reads a rule list from its YAML bytes: UTF-8 text with one YAML document, unique
// keys and no aliases. The list is producer data, so the bounded profile of the saved
// run records does not apply; that profile also needs the baseline rules, which a
// helper outside the tool checkout cannot load before it refuses to run.
export function readRuleList(bytes: Buffer, yaml: typeof Yaml): BehaviorEntryRuleList {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text).equals(bytes), 'The behavior entry rule list must use UTF-8.');
  const document = yaml.parseDocument(text, { uniqueKeys: true, merge: false, prettyErrors: false });
  assert(!document.errors.length && !document.warnings.length, 'The behavior entry rule list must contain valid YAML: ' +
    [...document.errors, ...document.warnings].map(problem => problem.message).join(' '));
  return checkRuleList(document.toJS({ maxAliasCount: 0 }));
}

// Refuses a tool checkout whose rule list differs from the copy that Stage 4 start saved.
export function checkPinnedRuleList(savedCopy: Buffer, checkout: Buffer): void {
  assert(savedCopy.equals(checkout), 'The behavior entry rule list changed since Stage 4 start: ' + behaviorEntryRulesPath +
    '. Restore it or start a new attempt.');
}
