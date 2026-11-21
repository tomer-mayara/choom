import type { Baseline } from "@choom/baseline-model/contracts";

function proposed<Value>(value: Value) {
  return { value, status: "proposed" as const, evidenceRefs: ["starter-example"] };
}

/** A recorded example uses the same format and viewer as an opened baseline. */
export const starterBaseline: Baseline = {
  formatVersion: 1, id: "example-baseline", parentId: null,
  components: [
    // A parent does not own the files of its children: the workspace excludes them.
    { id: "workspace", name: "Workspace", purpose: proposed("Display a saved architecture baseline"),
      membership: proposed({ paths: ["src/**"], excludePaths: ["src/domain/**", "src/platform/**"] }),
      groupingReason: proposed("The user explores the model here") },
    { id: "architecture-model", name: "Architecture model", parent: proposed("workspace"),
      purpose: proposed("Validate recorded architecture statements"),
      membership: proposed({ paths: ["src/domain/**"] }), groupingReason: proposed("Model rules belong together") },
    { id: "desktop-adapter", name: "Platform adapter", parent: proposed("workspace"),
      purpose: proposed("Select and read a baseline file"),
      membership: proposed({ paths: ["src/platform/**"] }), groupingReason: proposed("File access depends on the host") },
  ],
  interfaces: [], resources: [], rules: [],
};
