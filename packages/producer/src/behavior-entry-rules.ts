import type * as Yaml from 'yaml';
import type { BehaviorEntryRule, BehaviorEntryRuleList } from './generated/contracts.ts';
import { assert, object } from './record-checks.ts';
import { checkPinnedRules, checkRuleFields, type FieldCheck, fieldChecks, listedRules, matching, readRules, ruleFolder,
  type RuleList, ruleMessage } from './rule-lists.ts';

// The pinned list of Choom behavior entry rules and its check against the contract
// in cookbook/interfaces/behavior-entry-rules.tsp. The list is one YAML file in the
// producer package. Stage 4 start saves a copy of it and its SHA-256, and Stage 4
// collect applies its rules. The check also refuses a repeated rule ID and a call
// rule that names one argument as both the name and the handler.
export const behaviorEntryRulesFile = 'behavior-entry-rules.yaml';
// The list in the tool checkout. The producer code record does not cover this
// folder, so Stage 4 start records the SHA-256 of the list itself.
export const behaviorEntryRulesPath = ruleFolder + behaviorEntryRulesFile;
const label = 'behavior entry';

const propertyPath = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const fileGlob = /^[^/\s\\][^\s\\]*$/;

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
};

// The fields of a rule of a known kind, each with its contract check.
function checkRule(rule: unknown, number: number, ids: Set<unknown>): void {
  const record = object(rule) ? rule : {};
  const message = ruleMessage(label, rule, number);
  const fields = Object.hasOwn(ruleFields, String(record.kind)) ? ruleFields[record.kind as BehaviorEntryRule['kind']] : undefined;
  assert(fields, message + 'kind must be call or settings-literal.');
  checkRuleFields(rule, message, fields, ids);
  assert(record.kind !== 'call' || record.nameArgument === null || record.nameArgument !== record.handlerArgument,
    message + 'the name argument and the handler argument are the same.');
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
