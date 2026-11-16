import { behaviorEntryRuleList } from './behavior-entry-rules.ts';
import { resourceAccessRuleList } from './resource-access-rules.ts';
import type { RuleList } from './rule-lists.ts';

// The rule lists of the tool checkout that Stage 4 start checks against their
// contracts and saves with their SHA-256, and that each later Stage 4 action pins:
// it refuses a tool checkout whose list differs from the saved copy.
export const stageFourRuleLists: readonly RuleList<unknown>[] = [behaviorEntryRuleList, resourceAccessRuleList];
