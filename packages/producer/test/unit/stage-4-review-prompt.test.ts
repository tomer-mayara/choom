import { expect, test } from "bun:test";
import { reviewPrompt } from "../../src/stage-4-review-prompt.ts";

test("groups identical traversal roots in any order and keeps each pass's own traversal counts", () => {
  const roots = Object.freeze(["b.ts", "a.ts"]);
  const importPass = { id: "compile-import", scanned: 4, coverage: "partial", roots, edges: 2, reached: 3, stoppedEdges: 1 };
  const requirePass = { ...importPass, id: "compile-require", roots: roots.toReversed(), edges: 0, reached: 2, stoppedEdges: 0 };
  const otherPass = { ...requirePass, id: "other-import", roots: ["b.ts", "d.ts"] };
  const graph = { ref: "s4-review-file@graph-results.json", contexts: [importPass, requirePass, otherPass] };
  const facts = { runRef: "run", snapshotRef: "snapshot", entryAnalysisRef: "entry", attemptId: "s4-review",
    work: "/work", attempt: "/work/evidence/s4-review", graph };
  const prompt = reviewPrompt(facts);

  const groups = prompt.split("Passes with identical traversal root paths\n\n")[1]?.split("\n\n")[0];
  expect(groups).toBe("- `compile-import`, `compile-require`");
  expect(prompt).toContain("| `compile-import` | 4 | 2 | 3 | 1 | 2 | partial |");
  expect(prompt).toContain("| `compile-require` | 4 | 2 | 2 | 0 | 0 | partial |");
});
