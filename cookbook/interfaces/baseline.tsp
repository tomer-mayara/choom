import "@typespec/json-schema";
import "./baseline-documentation.tsp";
import "./baseline-source-usage.tsp";
import "./baseline-system-entry-points.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.BaselineModel;

@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
scalar baselineId extends string;

@pattern("\\S")
scalar baselineText extends string;

// Runtime validation checks safe relative paths and the optional /** suffix.
scalar baselineSelector extends baselineText;

// Runtime validation checks one safe relative file path. A symbol path cannot
// name a subtree.
scalar baselineSymbolPath extends baselineText;

// Runtime validation checks a JavaScript identifier name. `default` names the
// default export.
scalar baselineSymbolName extends baselineText;

// Rule data is JSON-compatible saved data. The viewer does not run expressions.
union BaselineRuleValue {
  string,
  boolean,
  float64,
  null,
  BaselineRuleObject,
  BaselineRuleValue[],
}

model BaselineRuleObject is Record<BaselineRuleValue>;

@minItems(1)
model BaselineAccessPoints is baselineText[];

@minItems(1)
@uniqueItems
model BaselineConsumers is baselineId[];

@extension("additionalProperties", false)
model BaselineMembership {
  @minItems(1)
  paths: baselineSelector[];

  excludePaths?: baselineSelector[];
}

// Version 5 names one top-level symbol in one file.
@extension("additionalProperties", false)
model BaselineSymbolSelector {
  path: baselineSymbolPath;
  symbol: baselineSymbolName;
}

// Version 5 membership. `paths` can be empty when `symbols` is not. Runtime
// validation requires at least one path or symbol.
@extension("additionalProperties", false)
model BaselineMembershipV5 {
  paths: baselineSelector[];
  excludePaths?: baselineSelector[];

  @uniqueItems
  symbols?: BaselineSymbolSelector[];
}

@extension("additionalProperties", false)
model BaselinePromises {
  behavior: baselineText | null;
  data: baselineText | null;
  errors: baselineText | null;
  lifecycle: baselineText | null;
}

@extension("additionalProperties", false)
model ProposedTextStatement {
  value: baselineText;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedTextStatement {
  value: baselineText;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineTextStatement {
  ProposedTextStatement,
  AcceptedTextStatement,
}

@extension("additionalProperties", false)
model ProposedNullableTextStatement {
  value: baselineText | null;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedNullableTextStatement {
  value: baselineText | null;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineNullableTextStatement {
  ProposedNullableTextStatement,
  AcceptedNullableTextStatement,
}

@extension("additionalProperties", false)
model ProposedComponentReferenceStatement {
  value: baselineId | null;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedComponentReferenceStatement {
  value: baselineId | null;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineComponentReferenceStatement {
  ProposedComponentReferenceStatement,
  AcceptedComponentReferenceStatement,
}

@extension("additionalProperties", false)
model ProposedMembershipStatement {
  value: BaselineMembership;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedMembershipStatement {
  value: BaselineMembership;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineMembershipStatement {
  ProposedMembershipStatement,
  AcceptedMembershipStatement,
}

@extension("additionalProperties", false)
model ProposedMembershipV5Statement {
  value: BaselineMembershipV5;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedMembershipV5Statement {
  value: BaselineMembershipV5;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineMembershipV5Statement {
  ProposedMembershipV5Statement,
  AcceptedMembershipV5Statement,
}

@extension("additionalProperties", false)
model ProposedAccessPointsStatement {
  value: BaselineAccessPoints | null;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedAccessPointsStatement {
  value: BaselineAccessPoints | null;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineAccessPointsStatement {
  ProposedAccessPointsStatement,
  AcceptedAccessPointsStatement,
}

@extension("additionalProperties", false)
model ProposedConsumersStatement {
  value: BaselineConsumers | null;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedConsumersStatement {
  value: BaselineConsumers | null;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineConsumersStatement {
  ProposedConsumersStatement,
  AcceptedConsumersStatement,
}

@extension("additionalProperties", false)
model ProposedPromisesStatement {
  value: BaselinePromises | null;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedPromisesStatement {
  value: BaselinePromises | null;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselinePromisesStatement {
  ProposedPromisesStatement,
  AcceptedPromisesStatement,
}

@extension("additionalProperties", false)
model ProposedRuleObjectStatement {
  value: BaselineRuleObject | null;
  status: "proposed";

  @minItems(1)
  evidenceRefs: baselineText[];
}

@extension("additionalProperties", false)
model AcceptedRuleObjectStatement {
  value: BaselineRuleObject | null;
  status: "accepted";

  @minItems(1)
  evidenceRefs: baselineText[];

  acceptanceRef: baselineText;
}

union BaselineRuleObjectStatement {
  ProposedRuleObjectStatement,
  AcceptedRuleObjectStatement,
}

@extension("additionalProperties", false)
model BaselineComponent {
  id: baselineId;
  name: baselineText;
  purpose: BaselineTextStatement;
  membership: BaselineMembershipStatement;
  groupingReason: BaselineTextStatement;
  parent?: BaselineComponentReferenceStatement;
}

@extension("additionalProperties", false)
model BaselineComponentV5 {
  id: baselineId;
  name: baselineText;
  purpose: BaselineTextStatement;
  membership: BaselineMembershipV5Statement;
  groupingReason: BaselineTextStatement;
  parent?: BaselineComponentReferenceStatement;
}

@extension("additionalProperties", false)
model BaselineInterfaceV1 {
  id: baselineId;
  name: baselineText;
  owner: BaselineComponentReferenceStatement;
  publicAccess: BaselineAccessPointsStatement;
  allowedConsumers: BaselineConsumersStatement;
  promises: BaselinePromisesStatement;
}

@extension("additionalProperties", false)
model BaselineInterface {
  id: baselineId;
  name: baselineText;
  owner: BaselineComponentReferenceStatement;
  publicAccess: BaselineAccessPointsStatement;
  allowedConsumers: BaselineConsumersStatement;
  promises: BaselinePromisesStatement;
  documentation?: BaselineDocumentation;
}

@extension("additionalProperties", false)
model BaselineResource {
  id: baselineId;
  name: baselineText;
  identity: BaselineNullableTextStatement;
  owner: BaselineComponentReferenceStatement;
  accessRules: BaselineNullableTextStatement;
}

@extension("additionalProperties", false)
model BaselineRule {
  id: baselineId;
  name: baselineText;
  subject: BaselineRuleObjectStatement;
  expected: BaselineRuleObjectStatement;
  check: BaselineRuleObjectStatement;
}

// Runtime validation enforces unique item IDs, component references and an
// acyclic parent hierarchy. References to other records remain opaque.
@extension("additionalProperties", false)
model BaselineV1 {
  formatVersion: 1;
  id: baselineId;
  parentId: baselineText | null;
  components: BaselineComponent[];
  interfaces: BaselineInterfaceV1[];
  resources: BaselineResource[];
  rules: BaselineRule[];
}

@extension("additionalProperties", false)
model BaselineV2 {
  formatVersion: 2;
  id: baselineId;
  parentId: baselineText | null;
  components: BaselineComponent[];
  interfaces: BaselineInterface[];
  resources: BaselineResource[];
  rules: BaselineRule[];
}

@extension("additionalProperties", false)
model BaselineV3 {
  formatVersion: 3;
  id: baselineId;
  parentId: baselineText | null;
  components: BaselineComponent[];
  interfaces: BaselineInterface[];
  resources: BaselineResource[];
  rules: BaselineRule[];
  sourceUsage?: BaselineSourceUsage;
}

@extension("additionalProperties", false)
model BaselineV4 {
  formatVersion: 4;
  id: baselineId;
  parentId: baselineText | null;
  components: BaselineComponent[];
  interfaces: BaselineInterface[];
  resources: BaselineResource[];
  rules: BaselineRule[];
  sourceUsage?: BaselineSourceUsage;
  systemEntryPoints?: BaselineSystemEntryPoints;
}

// Version 5 is version 4 plus symbol selectors in component membership.
@extension("additionalProperties", false)
model BaselineV5 {
  formatVersion: 5;
  id: baselineId;
  parentId: baselineText | null;
  components: BaselineComponentV5[];
  interfaces: BaselineInterface[];
  resources: BaselineResource[];
  rules: BaselineRule[];
  sourceUsage?: BaselineSourceUsage;
  systemEntryPoints?: BaselineSystemEntryPoints;
}

union Baseline {
  BaselineV1,
  BaselineV2,
  BaselineV3,
  BaselineV4,
  BaselineV5,
}
