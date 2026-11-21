import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { starterBaseline } from "../../../../../src/domain/starter-baseline.ts";
import { pathOwners } from "../../../src/code-units.ts";
import { toolsRoot } from "../../support/commands.ts";

// The built-in example of the viewer describes the source folder of the app. The
// code mapping check of the producer gives a file the components whose path
// selectors select it, less their excluded paths, and accepts at most one: a parent
// does not own the files of its children. The example of the viewer and that rule of
// the producer run together, so this is an integration suite.
const memberships = new Map(starterBaseline.components.map(({ id, membership }) => [id, membership.value]));

// The files of the app source in the checkout, as paths from the checkout root.
function appSourceFiles(): string[] {
  const folder = join(toolsRoot, "src");
  return readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => relative(toolsRoot, join(entry.parentPath, entry.name))).sort();
}

describe("the built-in example of the viewer", () => {
  test("gives each file of the app source at most one direct owner", () => {
    const files = appSourceFiles();
    const shared = files.map((path) => ({ path, owners: pathOwners(path, memberships) }))
      .filter(({ owners }) => owners.length > 1);
    expect(files.length).toBeGreaterThan(0);
    expect(shared).toEqual([]);
  });
});
