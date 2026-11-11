import "@typespec/json-schema";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Domain;

@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
scalar baselineId extends string;

@pattern("\\S")
scalar baselineText extends string;

// Runtime validation checks safe relative paths and the optional /** suffix.
scalar baselineSelector extends baselineText;

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
model BaselineInterface {
  id: baselineId;
  name: baselineText;
  owner: BaselineComponentReferenceStatement;
  publicAccess: BaselineAccessPointsStatement;
  allowedConsumers: BaselineConsumersStatement;
  promises: BaselinePromisesStatement;
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
model Baseline {
  formatVersion: 1;
  id: baselineId;
  parentId: baselineText | null;
  components: BaselineComponent[];
  interfaces: BaselineInterface[];
  resources: BaselineResource[];
  rules: BaselineRule[];
}
