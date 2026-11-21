import type { BaselineV6 } from "@choom/baseline-model/contracts";

// An inventory with no units and no claimed coverage.
export function emptyReference(projectKey: string): BaselineV6 {
  return { formatVersion: 6, id: "baseline-ref", parentId: null, components: [], interfaces: [], resources: [], rules: [],
    boundaryReview: { status: "current",
      identity: { projectKey, snapshotRef: "snapshot-ref", inventoryDigest: "a".repeat(64), sourceKind: "snapshot",
        baseCommit: null, analysisRoots: ["."], mappingRef: "mapping-ref" },
      componentScopes: [], units: [], operations: [], accesses: [], rules: [], checks: [], callerSearches: [],
      sourceNotes: [], matches: [], limitations: ["No program files."] } };
}
