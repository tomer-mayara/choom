import { expect, test } from "bun:test";
import { baselineSchema } from "../../src/baseline.ts";
import { boundaryFixture } from "../../../../test/support/boundary-baseline.ts";

function issuePaths(input: unknown): string[] {
  const parsed = baselineSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  return parsed.error?.issues.map(issue => issue.path.join(".")) ?? [];
}

test("the source identity, roles, and source location identify what was reviewed", () => {
  const input = boundaryFixture();
  expect(baselineSchema.parse(input)).toEqual(input);
  const { identity, sourceNotes, componentScopes } = input.boundaryReview;
  identity.projectKey = " ";
  identity.baseCommit = "not-a-commit";
  if (!sourceNotes[0] || !componentScopes[0]) throw new Error("Incomplete fixture");
  sourceNotes[0].location.lines = [2, 1];
  Object.assign(componentScopes[0], { roles: ["runtime-ish"] });
  expect(issuePaths(input)).toEqual(expect.arrayContaining([
    "boundaryReview.identity.projectKey", "boundaryReview.identity.baseCommit",
    "boundaryReview.sourceNotes.0.location.lines", "boundaryReview.componentScopes.0.roles.0",
  ]));
});

type Review = ReturnType<typeof boundaryFixture>["boundaryReview"];
const item = <T,>(records: T[], index = 0): T => {
  const value = records[index];
  if (value === undefined) throw new Error("Incomplete fixture");
  return value;
};

test.each<[string, (review: Review) => void]>([
  ["identity.mappingRef", review => review.identity.mappingRef = "wrong-map"],
  ["units.0.ownerId", review => item(review.units).ownerId = "missing"],
  ["units.0.path", review => item(review.units).path = "../src/cli.ts"],
  ["accesses.0.callerRef", review => item(review.accesses).callerRef = "not-in-snapshot"],
  ["accesses.0.member", review => item(review.accesses).member = "different"],
  ["accesses.0.sourceUse", review => { item(review.accesses).sourceUse = { interfaceId: "config-api", useId: "different" }; }],
  ["accesses.0.sourceUse", review => { delete item(review.accesses).sourceUse; }],
  ["accesses.0.sourceUse", review => item(review.accesses).callerUnitId = "history"],
  ["accesses.0.sourceUse", review => { item(review.accesses).callerRef = "cli-import"; item(review.accesses).evidenceRefs = ["cli-import"]; }],
  ["accesses.5", review => review.accesses.push({ ...item(review.accesses), id: "repeated-call" })],
  ["componentScopes.3.basis", review => item(review.componentScopes, 3).basis = "observed"],
  ["checks.0.result", review => { item(review.rules).authority = "proposed"; }],
  ["checks.0.accessIds", review => { item(review.accesses, 3).context = "other-conditions"; }],
  ["checks.0.coverage", review => { item(review.checks).coverage.missingRoots.push("src/missing"); }],
  ["matches.0.referenceDigest", review => review.matches.push({
    unitId: "loader", oldPath: "src/old.ts", evidenceRefs: ["declare-configuration"], referenceDigest: "b".repeat(64),
  })],
])("integrity failure identifies boundaryReview.%s", (path, change) => {
  const input = boundaryFixture();
  change(input.boundaryReview);
  expect(issuePaths(input).some(value => value === `boundaryReview.${path}` || value.startsWith(`boundaryReview.${path}.`))).toBe(true);
});

test("existing evidence is referenced once, with consistent source digest and range", () => {
  const input = boundaryFixture();
  const existing = input.sourceUsage?.assessments[0]?.sourceNotes[0];
  if (!existing?.location) throw new Error("Missing linked site");
  const notes = input.boundaryReview.sourceNotes;
  notes.push({ evidenceRef: existing.evidenceRef, description: existing.description, location: existing.location });
  expect(issuePaths(input)).toContain(`boundaryReview.sourceNotes.${notes.length - 1}.evidenceRef`);
  notes.pop();
  item(notes).location.sha256 = "f".repeat(64);
  expect(issuePaths(input).some(path => path.includes("location.sha256"))).toBe(true);
});

test("accepts exactly two MiB of compact UTF-8 JSON and refuses one byte more", () => {
  const baseline = boundaryFixture();
  const review = baseline.boundaryReview;
  const text = "é".repeat(4000);
  while (Buffer.byteLength(JSON.stringify(review)) + Buffer.byteLength(text) + 4 < 2 * 1024 * 1024) review.limitations.push(text);
  review.limitations.push("x");
  const remaining = 2 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(review));
  review.limitations[review.limitations.length - 1] += "x".repeat(remaining);
  expect(Buffer.byteLength(JSON.stringify(review))).toBe(2 * 1024 * 1024);
  expect(baselineSchema.safeParse(baseline).success).toBe(true);
  review.limitations[review.limitations.length - 1] += "x";
  expect(issuePaths(baseline)).toContain("boundaryReview");
});
