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
  nameCall?: behaviorEntryNameCall;
  sameValueMethods?: Array<behaviorEntryMethodName>;
}

export interface BehaviorEntryPackageBinRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "package-bin";
}

export type BehaviorEntryRule = BehaviorEntryCallRule | BehaviorEntrySettingsLiteralRule | BehaviorEntryPackageBinRule;

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

export interface ResourceAccessRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  resourceKind: resourceAccessKind;
  operation: resourceAccessOperation;
  importName: behaviorEntryModuleName;
  callPath: behaviorEntryCallPath;
  typePath: resourceAccessTypePath | null;
  nameCall: resourceAccessCall;
  nameArgument: behaviorEntryArgument;
}

export interface ResourceAccessRuleList {
  formatVersion: 1;
  rules: Array<ResourceAccessRule>;
}

export type behaviorEntryArgument = number;

export type behaviorEntryCallPath = string;

export type behaviorEntryFileGlob = string;

export type behaviorEntryKind = string;

export type behaviorEntryMethodName = string;

export type behaviorEntryModuleName = string;

export type behaviorEntryNameCall = number;

export type behaviorEntryPropertyPath = string;

export type behaviorEntryRuleId = string;

export type behaviorEntryRuleVersion = number;

export type behaviorEntryText = string;

export type resourceAccessCall = number;

export type resourceAccessKind = string;

export type resourceAccessOperation = string;

export type resourceAccessTypePath = string;
