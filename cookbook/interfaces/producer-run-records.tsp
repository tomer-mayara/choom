import "@typespec/json-schema";
import "./discovery-result.tsp";

using TypeSpec.JsonSchema;

// The records that the producer saves in a run and that only the producer reads.
// The ticket that first adds or changes such a record adds its model here, and
// docs/design/app-a/record-format.md describes it.
namespace Choom.Producer;

// The gaps that the outcomes of the tool records of one action require. The
// action saves them with its tool records. Each gap cites the record that gives
// it, and its ID has a form that the stage reserves for these gaps. The review
// copies each gap exactly into the entry analysis. The publishing action refuses
// a review that leaves out or changes a required gap, or that gives the reserved
// form of ID to another question or gap. Stage 2 `run` saves required-gaps.json
// with the gaps of the Knip preflight and runs, with IDs <attempt>-knip-gap-NNN.
// Stage 3 `collect` saves required-gaps.json with the gap of its symbol mentions,
// with the ID <attempt>-symbol-mentions-gap-001, and each Stage 3 `exports` request
// saves exports-NNN.required-gaps.json with the gaps of its exports record, with IDs
// <attempt>-exports-NNN-gap-MMM.
@extension("additionalProperties", false)
model RequiredGaps {
  formatVersion: 1;

  // Each gap is a discovery gap, so the review can copy it without a change.
  gaps: Choom.BaselineModel.DiscoveryGap[];
}
