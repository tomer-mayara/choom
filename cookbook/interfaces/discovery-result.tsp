import "@typespec/json-schema";
import "./baseline.tsp";
import "./baseline-decisions.tsp";

using TypeSpec.JsonSchema;

namespace Choom.BaselineModel;

// A question text or a gap reason. Runtime validation also limits it to 16 KiB
// of UTF-8 bytes.
@pattern("\\S")
@maxLength(16384)
scalar discoveryText extends string;

// An ID, a gap kind, a subject reference or an evidence reference. Runtime
// validation also limits it to 4 KiB of UTF-8 bytes.
@pattern("\\S")
@maxLength(4096)
scalar discoveryReference extends string;

// A question about intent or ownership that the run recorded. A later note can
// answer it; the record stays.
@extension("additionalProperties", false)
model DiscoveryQuestion {
  id: discoveryReference;

  @minItems(1)
  @maxItems(100)
  subjectRefs: discoveryReference[];

  text: discoveryText;

  @minItems(1)
  evidenceRefs: discoveryReference[];
}

// A gap that the run recorded, such as a missing input or a deferred area. The
// viewer keeps a kind that it does not know, with its recorded reason.
@extension("additionalProperties", false)
model DiscoveryGap {
  id: discoveryReference;
  kind: discoveryReference;

  @minItems(1)
  @maxItems(100)
  subjectRefs: discoveryReference[];

  reason: discoveryText;

  @minItems(1)
  evidenceRefs: discoveryReference[];
}

// The part of a fixed discovery result, format version 2, that the viewer
// reads. The other top-level fields of the record format are checked by name
// only: the viewer does not read their values or the files that they name.
// Runtime validation also checks that the IDs of the questions and gaps are
// unique, that there are at most 5,000 questions and gaps together, and that all
// text values together are at most 4 MiB of UTF-8 bytes.
@extension("additionalProperties", false)
model DiscoveryResult {
  formatVersion: 2;
  kind: "architecture-discovery";
  baselineRef: baselineId;

  // The SHA-256 of the fixed baseline file bytes. Version 1 has no digest.
  baselineDigest: baselineFileDigest;

  runRef: unknown;
  entryAnalysisRef: unknown;
  codeMappingRef: unknown;
  dependenciesRef: unknown;
  resourceAccessRef: unknown;
  overview: unknown;
  inspectedPaths: unknown;

  @maxItems(5000)
  questions: DiscoveryQuestion[];

  @maxItems(5000)
  gaps: DiscoveryGap[];
}
