import { describe, expect, test } from "bun:test";
import { type CaptureExclusions, captureExclusionRules, defaultCaptureExclusions, readCaptureExclusions }
  from "../../src/stage-1-exclusions.ts";

// Each path is a file path relative to the target folder, as rsync sees it.
function excludedPaths(exclusions: CaptureExclusions, paths: string[]): string[] {
  if (!exclusions.readable) throw new Error("Choom does not read the rule " + exclusions.rule);
  return paths.filter((path) => exclusions.excludes(path));
}

describe("the capture exclusions of a Stage 1 run", () => {
  test("by default leave out hidden folders, Git files, dependencies, credential files and the root output folders", () => {
    const excluded = [".github/workflows/ci.yml", "src/.cache/build.js", ".git", "lib/vendor/.git",
      "node_modules/react/index.js", "packages/app/node_modules/x/index.js", ".env", "config/.env.local", ".npmrc",
      ".yarnrc.yml", "certs/server.pem", "deploy/id.key", "dist/app.js", "coverage/lcov.info", "reports/a.txt",
      "test-results/b.txt", "target/c.txt", "src-tauri/target/debug/app"];
    const kept = [".gitignore", ".bun-version", "src/app.ts", "src/dist/app.js", "packages/app/coverage/x.txt",
      "src/.environment", "src-tauri/src/main.rs", "docs/key.md"];
    expect(excludedPaths(readCaptureExclusions(defaultCaptureExclusions), [...excluded, ...kept])).toEqual(excluded);
  });

  test("read a '- ' prefix, anchored and folder rules, the ? wildcard, comments and blank lines", () => {
    const rules = "# The run area\n; another comment\n\n- /work-choom/\nsrc-tauri/target/\nnotes?.txt\n";
    const excluded = ["work-choom/run-001/run.yaml", "src-tauri/target/a", "app/src-tauri/target/b", "notes1.txt",
      "docs/notesA.txt"];
    const kept = ["app/work-choom/x.txt", "src-tauri/target", "notes12.txt", "notes.txt", "# The run area"];
    expect(excludedPaths(readCaptureExclusions(rules), [...excluded, ...kept])).toEqual(excluded);
  });

  test("list their rule lines as written, without blank and comment lines", () => {
    expect(captureExclusionRules("# The run area\n; another comment\n\n- /work-choom/\nnode_modules\n.env\n"))
      .toEqual(["- /work-choom/", "node_modules", ".env"]);
  });

  test("name the first rule form that Choom does not read", () => {
    for (const rule of ["+ src/keep.ts", "!", "[abc].ts", "src/**/generated", "a\\*.ts", "dist\r", "/", "- "])
      expect({ rule, exclusions: readCaptureExclusions("node_modules\n" + rule + "\n.env\n") })
        .toEqual({ rule, exclusions: { readable: false, rule } });
  });
});
