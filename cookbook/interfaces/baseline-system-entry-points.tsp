import "@typespec/json-schema";

using TypeSpec.JsonSchema;

namespace Choom.BaselineModel;

// Runtime validation checks byte limits, safe paths, and local references.
@extension("additionalProperties", false)
model BaselineSystemEntrySource {
  evidenceRef: baselineText;
  location: BaselineSourceLocation;
}

@extension("additionalProperties", false)
model BaselineSystemEntryPoint {
  id: baselineId;
  kind: "startup" | "external";
  label: baselineText;
  path: baselineText;
  componentId: baselineId;

  @minItems(1)
  @uniqueItems
  evidenceRefs: baselineText[];

  source?: BaselineSystemEntrySource;
  interfaceId?: baselineId;
  entryId?: baselineId;
}

@extension("additionalProperties", false)
model BaselineSystemEntryPoints {
  snapshotRef: baselineText;
  mappingRef: baselineText;
  scope: baselineText;

  @minItems(1)
  @uniqueItems
  evidenceRefs: baselineText[];

  limitations: baselineText[];

  @maxItems(2000)
  entries: BaselineSystemEntryPoint[];
}
