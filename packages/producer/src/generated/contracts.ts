// Generated from TypeSpec by bun run contracts:generate. Do not edit.

export interface BehaviorEntryCallRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "call";
  importName: behaviorEntryModuleName;
  callPath: behaviorEntryCallPath;
  nameArgument: behaviorEntryArgument | null;
  handlerArgument: behaviorEntryArgument | "last" | null;
}

export type BehaviorEntryRule = BehaviorEntryCallRule | BehaviorEntrySettingsLiteralRule;

export interface BehaviorEntryRuleList {
  formatVersion: 1;
  rules: Array<BehaviorEntryRule>;
}

export interface BehaviorEntrySettingsLiteralRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "settings-literal";
  fileGlob: behaviorEntryFileGlob;
  propertyPath: behaviorEntryPropertyPath;
}

export type behaviorEntryArgument = number;

export type behaviorEntryCallPath = string;

export type behaviorEntryFileGlob = string;

export type behaviorEntryKind = string;

export type behaviorEntryModuleName = string;

export type behaviorEntryPropertyPath = string;

export type behaviorEntryRuleId = string;

export type behaviorEntryRuleVersion = number;

export type behaviorEntryText = string;
