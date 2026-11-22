import "@typespec/json-schema";
import "./discovery-result.tsp";
import "./producer-boundary-intake.tsp";

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
// Stage 4 `collect` saves required-gaps.json with the gaps of its candidate
// records, with IDs <attempt>-behavior-entry-gap-NNN and
// <attempt>-resource-access-gap-NNN.
@extension("additionalProperties", false)
model RequiredGaps {
  formatVersion: 1;

  // Each gap is a discovery gap, so the review can copy it without a change.
  gaps: Choom.BaselineModel.DiscoveryGap[];
}

// The run manifest, run.yaml. Stage 1 `finish` writes it. Each later publisher
// writes it again, last, as the marker of its publication: it keeps the identity
// of the run and the snapshot, and it changes the progress, the summary and the
// registry. Stage 6 also adds the fixed records and the time of completion.
@extension("additionalProperties", false)
model RunManifest {
  formatVersion: 1;
  id: string;
  mode: "A";
  status: "in-progress" | "completed";

  // The project key and the frozen reference baseline that Stage 1 `start` selected.
  projectKey: Choom.BaselineModel.baselineText;

  referenceBaseline: FrozenBaselineReference | null;
  progress: RunProgress;
  snapshot: RunSnapshot;
  coverage: RunCoverage;

  // The saved records of the run, by artifact ID.
  artifacts: Record<RunArtifact>;

  // Stage 6 adds the IDs of the fixed baseline and discovery result, and the time
  // of completion from its receipt.
  baselineRef?: Choom.BaselineModel.baselineId;

  discoveryRef?: string;
  completedAt?: string;
}

// The progress of the run: the one place for the state of each stage. Each stage
// sets its key to complete when it publishes. A stage that has no key yet has not
// completed.
@extension("additionalProperties", false)
model RunProgress {
  inventory: "complete";
  entryAnalysis?: "complete";
  inspectionPriorities?: "pending" | "complete";
  componentRecovery?: "complete";
  remainingCode?: "complete";
  baselineRecovery: "pending" | "complete";
}

// The snapshot of the run and how Stage 1 captured it.
@extension("additionalProperties", false)
model RunSnapshot {
  id: string;
  root: "snapshot";
  inventoryRef: string;
  exclusions: "exclusions.txt";
  captureMethod: string;
  captureLimit: string;
  sourcePath: string;
  capturedAt: string;
}

// A saved record of the run: its path in the run folder and the SHA-256 of its
// bytes.
@extension("additionalProperties", false)
model RunArtifact {
  path: string;

  @pattern("^[a-f0-9]{64}$")
  sha256: string;
}

// The summary of the run (DB4). Each publisher writes a new summary from the
// records that it selects, in place of the summary of the earlier stage. The
// summary has three fields. It does not give the state of a stage, because
// `progress` has the state of each stage. Choom does not decide which question
// or gap is answered, so the summary gives record counts and no status.
@extension("additionalProperties", false)
model RunCoverage {
  // The number of regular files that the selected inventory lists.
  inventoried: string;

  // The selected review with the reviewed source ranges: the Stage 1 review or
  // the selected entry analysis. From Stage 4 also the selected code mapping.
  inspected: string;

  // The record counts of the questions and gaps, with history and linked notes.
  recorded: string;
}
