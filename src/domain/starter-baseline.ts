import type { Baseline } from "./generated/contracts.ts";

function proposed<Value>(value: Value) {
  return { value, status: "proposed" as const, evidenceRefs: ["starter-example"] };
}

/** A recorded example uses the same format and viewer as an opened baseline. */
export const starterBaseline: Baseline = {
  formatVersion: 1, id: "example-baseline", parentId: null,
  components: [
    { id: "workspace", name: "Workspace", purpose: proposed("Display a saved architecture baseline"),
      membership: proposed({ paths: ["src/**"] }), groupingReason: proposed("The user explores the model here") },
    { id: "architecture-model", name: "Architecture model", purpose: proposed("Validate recorded architecture statements"),
      membership: proposed({ paths: ["src/domain/**"] }), groupingReason: proposed("Model rules belong together") },
    { id: "desktop-adapter", name: "Platform adapter", purpose: proposed("Select and read a baseline file"),
      membership: proposed({ paths: ["src/platform/**"] }), groupingReason: proposed("File access depends on the host") },
  ],
  interfaces: [], resources: [], rules: [],
};
