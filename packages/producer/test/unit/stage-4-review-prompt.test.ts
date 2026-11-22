import { expect, test } from "bun:test";
import { reviewPrompt } from "../../src/stage-4-review-prompt.ts";

const prefixes = ["s4-review-behavior-entry-gap-", "s4-review-resource-access-gap-"];
const noRequiredGaps = { ref: "s4-review-file@required-gaps.json", prefixes, gaps: [] };
const facts = { runRef: "run", snapshotRef: "snapshot", entryAnalysisRef: "entry", attemptId: "s4-review",
  work: "/work", attempt: "/work/evidence/s4-review", graph: { ref: "s4-review-file@graph-results.json", contexts: [] },
  requiredGaps: noRequiredGaps };

test("groups identical traversal roots in any order and keeps each pass's own traversal counts", () => {
  const roots = Object.freeze(["b.ts", "a.ts"]);
  const importPass = { id: "compile-import", scanned: 4, coverage: "partial", roots, edges: 2, reached: 3, stoppedEdges: 1 };
  const requirePass = { ...importPass, id: "compile-require", roots: roots.toReversed(), edges: 0, reached: 2, stoppedEdges: 0 };
  const otherPass = { ...requirePass, id: "other-import", roots: ["b.ts", "d.ts"] };
  const graph = { ref: "s4-review-file@graph-results.json", contexts: [importPass, requirePass, otherPass] };
  const prompt = reviewPrompt({ ...facts, graph });

  const groups = prompt.split("Passes with identical traversal root paths\n\n")[1]?.split("\n\n")[0];
  expect(groups).toBe("- `compile-import`, `compile-require`");
  expect(prompt).toContain("| `compile-import` | 4 | 2 | 3 | 1 | 2 | partial |");
  expect(prompt).toContain("| `compile-require` | 4 | 2 | 2 | 0 | 0 | partial |");
});

// DB5: the review copies each gap that the candidate records require, and the publisher refuses a packet that does not.
test("lists the required gaps of the candidate records, asks for their exact copy and names the reserved IDs", () => {
  const gaps = [{ id: "s4-review-resource-access-gap-001", kind: "tool-outcome", subjectRefs: ["snapshot"],
    reason: "The resource access candidates are partial: the record keeps the first 10000 candidates and leaves out 1.",
    evidenceRefs: ["s4-review-file@resource-access-candidates.json#/status"] }];
  const section = reviewPrompt({ ...facts, requiredGaps: { ...noRequiredGaps, gaps } }).split("Required gaps (")[1]?.split("\n```\n")[0];
  expect(section).toBe("s4-review-file@required-gaps.json): each gap that behavior-entry-candidates.json or " +
    "resource-access-candidates.json lists gives one required gap, and so does a record with status: partial. Copy each gap " +
    "below into the gaps of entry-analysis.yaml and discovery.proposed.yaml exactly, with the same id, kind, subjectRefs, " +
    "reason and evidenceRefs. The publisher refuses a packet that leaves out or changes a required gap, or that gives a " +
    "question or another gap an ID that starts with s4-review-behavior-entry-gap- or s4-review-resource-access-gap-.\n\n" +
    "```json\n" + JSON.stringify(gaps, null, 2));
});

test("says when the candidate records require no gap, and keeps their ID prefixes reserved", () => {
  expect(reviewPrompt(facts)).toContain("Required gaps (s4-review-file@required-gaps.json): none. The candidate records list no " +
    "gap and are complete. Do not give a question or gap an ID that starts with s4-review-behavior-entry-gap- or " +
    "s4-review-resource-access-gap-.\n\n");
});
