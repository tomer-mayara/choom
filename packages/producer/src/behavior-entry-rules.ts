import type * as Yaml from 'yaml';
import type { BehaviorEntryCallRule, BehaviorEntryRule, BehaviorEntryRuleList } from './generated/contracts.ts';
import { assert, object } from './record-checks.ts';
import { callCount, calledMethods, callPathParts, checkPinnedRules, checkRuleFields, type FieldCheck, fieldChecks, listedRules,
  matching, readRules, ruleFolder, type RuleList, ruleMessage } from './rule-lists.ts';

// The pinned list of Choom behavior entry rules and its check against the contract
// in cookbook/interfaces/behavior-entry-rules.tsp. The list is one YAML file in the
// producer package. Stage 4 start saves a copy of it and its SHA-256, and Stage 4
// collect applies its rules. The check also refuses a repeated rule ID, a call rule
// that names one argument of one call as both the name and the handler, a name call
// that the call path does not have or that names no name argument, and a call path
// that calls a method of its sameValueMethods: such a rule finds no call.
export const behaviorEntryRulesFile = 'behavior-entry-rules.yaml';
// The list in the tool checkout. The producer code record does not cover this
// folder, so Stage 4 start records the SHA-256 of the list itself.
export const behaviorEntryRulesPath = ruleFolder + behaviorEntryRulesFile;
const label = 'behavior entry';

const propertyPath = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const fileGlob = /^[^/\s\\][^\s\\]*$/;
const methodName = matching(/^[A-Za-z_$][A-Za-z0-9_$]*$/, 128);

const shared: Record<string, FieldCheck> = {
  id: fieldChecks.id, version: fieldChecks.version, library: fieldChecks.library, entryKind: fieldChecks.kind,
};
// The fields of each kind of rule, in the order of the contract.
const ruleFields: Record<BehaviorEntryRule['kind'], Record<string, FieldCheck>> = {
  'call': { ...shared, kind: value => value === 'call', importName: fieldChecks.importName, callPath: fieldChecks.callPath,
    nameArgument: value => value === null || fieldChecks.position(value),
    handlerArgument: value => value === null || value === 'last' || fieldChecks.position(value) },
  'settings-literal': { ...shared, kind: value => value === 'settings-literal', fileGlob: matching(fileGlob, 200),
    propertyPath: matching(propertyPath, 200) },
  'package-bin': { ...shared, kind: value => value === 'package-bin' },
};
// The optional fields of a call rule: a list of names has at least one name and no name twice.
const optionalCallFields: Record<string, FieldCheck> = {
  nameCall: fieldChecks.position,
  sameValueMethods: value => Array.isArray(value) && value.length > 0 && new Set(value).size === value.length &&
    value.every(methodName),
};

// The name, the handler, the name call and the same value methods of a call rule.
function checkCallRule(rule: BehaviorEntryCallRule, message: string): void {
  const { importName, callPath, nameArgument, handlerArgument, nameCall = 0, sameValueMethods = [] } = rule;
  assert(nameCall !== 0 || nameArgument === null || nameArgument !== handlerArgument,
    message + 'the name argument and the handler argument are the same.');
  assert(nameCall <= callCount(callPathParts(callPath).steps), message + 'the call path has no call at the name call ' +
    nameCall + '.');
  assert(rule.nameCall === undefined || nameArgument !== null, message + 'the rule names a name call but no name argument.');
  const called = calledMethods(importName, callPath).find(method => sameValueMethods.includes(method));
  assert(called === undefined, message + 'the call path calls ' + called + ', a method of sameValueMethods, so the rule ' +
    'finds no call.');
}

// The fields of a rule of a known kind, each with its contract check.
function checkRule(rule: unknown, number: number, ids: Set<unknown>): void {
  const record = object(rule) ? rule : {};
  const message = ruleMessage(label, rule, number);
  const fields = Object.hasOwn(ruleFields, String(record.kind)) ? ruleFields[record.kind as BehaviorEntryRule['kind']] : undefined;
  assert(fields, message + 'kind must be call, settings-literal or package-bin.');
  checkRuleFields(rule, message, fields, ids, record.kind === 'call' ? optionalCallFields : {});
  if (record.kind === 'call') checkCallRule(rule as BehaviorEntryCallRule, message);
}

// The rule list, after the check of each field.
export function checkRuleList(value: unknown): BehaviorEntryRuleList {
  const ids = new Set<unknown>();
  listedRules(value, label).forEach((rule, index) => checkRule(rule, index + 1, ids));
  return value as BehaviorEntryRuleList;
}

export const behaviorEntryRuleList: RuleList<BehaviorEntryRuleList> = { label, file: behaviorEntryRulesFile,
  path: behaviorEntryRulesPath, check: checkRuleList };

// Reads the rule list from its YAML bytes, with the checks of every pinned rule list.
export function readRuleList(bytes: Buffer, yaml: typeof Yaml): BehaviorEntryRuleList {
  return readRules(behaviorEntryRuleList, bytes, yaml);
}

// Refuses a tool checkout whose rule list differs from the copy that Stage 4 start saved.
export function checkPinnedRuleList(savedCopy: Buffer, checkout: Buffer): void {
  checkPinnedRules(behaviorEntryRuleList, savedCopy, checkout);
}
