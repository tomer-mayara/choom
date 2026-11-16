import type { ResourceAccessRule, ResourceAccessRuleList } from './generated/contracts.ts';
import { assert } from './record-checks.ts';
import { callCount, callPathParts, checkRuleFields, type FieldCheck, fieldChecks, listedRules, matching, ruleFolder,
  type RuleList, ruleMessage } from './rule-lists.ts';

// The pinned list of Choom resource access rules and its check against the contract
// in cookbook/interfaces/resource-access-rules.tsp. The list is one YAML file in the
// producer package. Stage 4 start saves a copy of it and its SHA-256, and Stage 4
// collect applies its rules. The check also refuses a repeated rule ID, a name call
// that the call path or the type path does not have, and a type path that does not
// end with the last steps of the call path: the type stands for the value of the
// steps before them.
export const resourceAccessRulesFile = 'resource-access-rules.yaml';
const label = 'resource access';
const typePathSyntax = /^[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\(\))*\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

// The fields of a rule, in the order of the contract.
const ruleFields: Record<string, FieldCheck> = {
  id: fieldChecks.id, version: fieldChecks.version, library: fieldChecks.library, resourceKind: fieldChecks.kind,
  operation: fieldChecks.kind, importName: fieldChecks.importName, callPath: fieldChecks.callPath,
  typePath: value => value === null || matching(typePathSyntax)(value), nameCall: fieldChecks.position,
  nameArgument: fieldChecks.position,
};

function checkRule(rule: unknown, number: number, ids: Set<unknown>): void {
  const message = ruleMessage(label, rule, number);
  checkRuleFields(rule, message, ruleFields, ids);
  const { callPath, typePath, nameCall } = rule as ResourceAccessRule;
  const { steps } = callPathParts(callPath);
  assert(nameCall <= callCount(steps), message + 'the call path has no call at the name call ' + nameCall + '.');
  if (typePath === null) return;
  const typed = callPathParts(typePath).steps;
  const last = steps.slice(steps.length - typed.length);
  assert(typed.length <= steps.length && typed.every((step, index) => step === last[index]),
    message + 'the type path does not end with the last steps of the call path.');
  assert(nameCall <= callCount(typed), message + 'the type path has no call at the name call ' + nameCall + '.');
}

// The rule list, after the check of each rule.
export function checkResourceRuleList(value: unknown): ResourceAccessRuleList {
  const ids = new Set<unknown>();
  listedRules(value, label).forEach((rule, index) => checkRule(rule, index + 1, ids));
  return value as ResourceAccessRuleList;
}

// The list in the tool checkout. The producer code record does not cover this
// folder, so Stage 4 start records the SHA-256 of the list itself.
export const resourceAccessRuleList: RuleList<ResourceAccessRuleList> = { label, file: resourceAccessRulesFile,
  path: ruleFolder + resourceAccessRulesFile, check: checkResourceRuleList };
