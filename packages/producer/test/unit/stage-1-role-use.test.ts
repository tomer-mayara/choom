import { expect, test } from "bun:test";
import { validateUnitUseReview } from "../../src/stage-1-role-use.ts";

const testUse = { role: "test", evidenceRefs: ["test-site"] };
const partial = { unitScope: "unknown", basis: "partial-review", uses: [testUse],
  evidenceRefs: ["test-site"], limits: ["No production caller search."] };

test("a role assessment requires concrete evidence for an exclusive test scope", () => {
  expect(validateUnitUseReview(partial)).toEqual(["test-site"]);
  expect(() => validateUnitUseReview({ ...partial, unitScope: "test" })).toThrow("declaration or complete review");
  expect(() => validateUnitUseReview({ ...partial, limits: [] })).toThrow("partial review");
  expect(() => validateUnitUseReview({ ...partial, unitScope: "test", basis: "complete-review", limits: ["Skipped source"] }))
    .toThrow("complete review");
  expect(validateUnitUseReview({ ...partial, unitScope: "test", basis: "declaration", evidenceRefs: ["declaration"] }))
    .toEqual(["declaration", "test-site"]);
  expect(() => validateUnitUseReview({ ...partial, unitScope: "test", basis: "complete-review", limits: [],
    uses: [testUse, { role: "production", evidenceRefs: ["cli-site"] }] })).toThrow("conflicts");
});
