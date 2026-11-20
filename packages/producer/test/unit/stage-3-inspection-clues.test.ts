import { expect, test } from "bun:test";
import { InspectionClues } from "../../src/stage-3-inspection-clues.ts";
const source = { id: "s3-range", path: "health.ts", sha256: "a".repeat(64), lines: [5, 12] };
const candidate = { id: "s2-candidate", path: "health.ts" };
const ranges = new Map([[source.id, source]]);
const priority = { subjectRefs: [candidate.id], evidenceRefs: [source.id],
  clue: { kind: "registration", context: "test", sourceRef: source.id, operation: "GET /health" } };

test("a registration clue connects that candidate with its reviewed source range", () => {
  const clues = new InspectionClues(ranges, [candidate]);
  expect(() => clues.validate(priority)).not.toThrow();
  expect(() => clues.validate({ ...priority, evidenceRefs: ["s3-all-files"] })).toThrow("reviewed range");
  expect(() => clues.validate({ ...priority, subjectRefs: ["other.ts"] })).toThrow("subject");
  expect(() => clues.validate({ ...priority, clue: { ...priority.clue, sourceRef: "missing" } })).toThrow("reviewed range");
});

test("an unresolved computed or literal import stays tied to the saved expression, digest and range", () => {
  const searchRef = "s3-a-file@loading-search.json";
  const matches = [{ ...source, kind: "import-literal", expression: "import('./plugin')", lines: [5, 5] },
    { ...source, kind: "import-computed", expression: "import(pluginName)", lines: [6, 6] }];
  const clues = new InspectionClues(ranges, [candidate], { ref: searchRef, matches });
  const review = (index: 0 | 1) => ({
    kind: "unresolved-loader", context: "unknown", sourceRef: source.id, matchRef: searchRef + "#/matches/" + index,
    expression: matches[index]?.expression, missingBinding: "The required binding was unavailable.",
  });
  const named = (clue: ReturnType<typeof review>) => ({ ...priority, evidenceRefs: [source.id, clue.matchRef], clue });
  for (const index of [0, 1] as const) expect(() => clues.validate(named(review(index)))).not.toThrow();
  expect(() => clues.validate(named({ ...review(1), matchRef: review(0).matchRef }))).toThrow("loading match");
  expect(() => clues.validate(named({ ...review(1), missingBinding: "" }))).toThrow("missing binding");
  const outside = new InspectionClues(ranges, [candidate], { ref: searchRef, matches: [{ ...matches[0], lines: [13, 13] }] });
  expect(() => outside.validate(named(review(0)))).toThrow("loading match");
});
