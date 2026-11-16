import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { testRoles } from "../../src/stage-4-behavior-entries.ts";
import type { Picomatch } from "../../src/stage-4-graph-profile.ts";

// The role of a behavior entry candidate comes from the role records of the Stage 1
// review (review-001), the rule of the run for the roles of its files. A record whose
// roles name tests or test makes each file that it selects a test file.
const picomatch = createRequire(import.meta.url)("picomatch") as Picomatch;
const record = (selector: unknown, roles: unknown) => ({ selector, roles, basis: "observed", evidenceRefs: ["inventory-001"] });
const review = { roles: [
  record("src", ["source"]),
  record("test/", ["tests"]),
  record("**/*.spec.ts", ["source", "tests"]),
  record("./e2e/**", ["test"]),
  record("src/fixtures/app.ts", ["tests"]),
  record("docs", ["documentation", "test"]),
  record(7, ["tests"]),
  record("scripts", "tests"),
] };

describe("testRoles", () => {
  const roleOf = testRoles(review, "review-001", picomatch);

  test.each([
    ["a file in a selected folder", "test/server.ts", 1],
    ["a file that a glob selects", "src/server.spec.ts", 2],
    ["a file below a folder glob that starts with ./", "e2e/app.ts", 3],
    ["an exact file", "src/fixtures/app.ts", 4],
  ])("gives %s the role test and names the first role record that selects it", (_name, path, index) => {
    expect(roleOf(path)).toEqual({ role: "test", roleRef: `review-001#/roles/${index}` });
  });

  test.each([
    ["a source file", "src/server.ts"],
    ["a file in a folder whose name only starts with test", "testing/server.ts"],
    ["a file that only a record with an invalid selector or roles selects", "scripts/build.ts"],
  ])("gives %s the role unknown", (_name, path) => {
    expect(roleOf(path)).toEqual({ role: "unknown", roleRef: null });
  });

  test("gives every file the role unknown when the review has no role records", () => {
    expect(testRoles({}, "review-001", picomatch)("test/server.ts")).toEqual({ role: "unknown", roleRef: null });
  });
});
