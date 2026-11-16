import "@typespec/json-schema";
import "./baseline.tsp";

using TypeSpec.JsonSchema;

namespace Choom.BaselineModel;

// The decision record names its file in a run folder, so its ID is short.
@maxLength(128)
scalar baselineDecisionsId extends baselineId;

// The SHA-256 of the saved baseline file bytes, as 64 lowercase hexadecimal digits.
@pattern("^[a-f0-9]{64}$")
scalar baselineFileDigest extends string;

// An RFC 3339 time in UTC, such as 2026-11-15T10:30:00Z. Runtime validation also
// checks the calendar date and the time of day.
@pattern("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z$")
scalar baselineDecisionTime extends string;

// The value of a statement as JSON data. Runtime validation also refuses values
// that are not JSON data.
union BaselineDecisionValue {
  string,
  boolean,
  float64,
  null,
  BaselineDecisionObject,
  BaselineDecisionValue[],
}

model BaselineDecisionObject is Record<BaselineDecisionValue>;

// The person who made the decisions. A producer check refuses a name that is a
// model in the run's LLM call records. That check is a process rule; it does not
// prove that a person decided.
@extension("additionalProperties", false)
model BaselineDecider {
  name: baselineText;
  kind: "human";
}

// Accept one statement with its current value.
@extension("additionalProperties", false)
model BaselineAcceptDecision {
  action: "accept";
  itemId: baselineId;
  field: baselineText;
}

// Replace the value of one statement. `oldValue` is its current value.
@extension("additionalProperties", false)
model BaselineCorrectDecision {
  action: "correct";
  itemId: baselineId;
  field: baselineText;
  oldValue: BaselineDecisionValue;
  newValue: BaselineDecisionValue;
}

// There is no reject action: a statement without a decision stays proposed.
union BaselineDecision {
  BaselineAcceptDecision,
  BaselineCorrectDecision,
}

// Human decisions about the statements of one saved baseline. Runtime validation
// checks the baseline ID and digest, that each entry names one proposed statement
// of that baseline, and the old value of each correction.
@extension("additionalProperties", false)
model BaselineDecisions {
  formatVersion: 1;
  id: baselineDecisionsId;
  baselineRef: baselineId;
  baselineDigest: baselineFileDigest;
  decider: BaselineDecider;
  decidedAt: baselineDecisionTime;

  @minItems(1)
  entries: BaselineDecision[];
}
