import { describe, expect, test } from "bun:test";
import { testRoles } from "../../src/stage-4-behavior-entries.ts";

// The role of a behavior entry candidate comes from the role records of the Stage 1
// review (review-001), the rule of the run for the roles of its files. The Stage 1
// cookbook asks for exact file or directory selectors and the role name tests. So a
// record whose roles include tests makes a file a test file when its selector is the
// exact path of the file or a folder that holds the file. A glob selector, a selector
// that is not an exact snapshot path and another role name give no test role.
const record = (selector: unknown, roles: unknown) => ({ selector, roles, basis: "observed", evidenceRefs: ["inventory-001"] });
const review = { roles: [
  record("src", ["source"]),
  record("test/", ["tests"]),
  record("**/*.spec.ts", ["source", "tests"]),
  record("e2e", ["test"]),
  record("src/fixtures/app.ts", ["tests"]),
  record("./lib", ["tests"]),
  record(7, ["tests"]),
  record("scripts", "tests"),
  record("integration", ["generated", "tests"]),
] };

describe("testRoles", () => {
  const roleOf = testRoles(review, "review-001");

  test.each([
    ["a file in a selected folder", "test/server.ts", 1],
    ["a file below a selected folder", "test/unit/deep/server.ts", 1],
    ["an exact file", "src/fixtures/app.ts", 4],
    ["a file of a folder with several roles", "integration/flow.ts", 8],
  ])("gives %s the role test and names the first role record that selects it", (_name, path, index) => {
    expect(roleOf(path)).toEqual({ role: "test", roleRef: `review-001#/roles/${index}` });
  });

  test.each([
    ["a source file", "src/server.ts"],
    ["a file in a folder whose name only starts with test", "testing/server.ts"],
    ["a file that only a glob selector selects", "src/server.spec.ts"],
    ["a file of a folder whose record names the role test, not tests", "e2e/app.ts"],
    ["a file below a selector that starts with ./", "lib/helpers.ts"],
    ["a file that only a record with an invalid selector or roles selects", "scripts/build.ts"],
  ])("gives %s the role unknown", (_name, path) => {
    expect(roleOf(path)).toEqual({ role: "unknown", roleRef: null });
  });

  test("gives every file the role unknown when the review has no role records", () => {
    expect(testRoles({}, "review-001")("test/server.ts")).toEqual({ role: "unknown", roleRef: null });
  });
});
