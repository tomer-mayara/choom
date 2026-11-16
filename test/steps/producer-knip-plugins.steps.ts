import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { removeScratch } from "../../packages/producer/test/support/commands.ts";
import { type EntryAnalysisRun, runEntryAnalysis } from "../../packages/producer/test/support/entry-analysis-run.ts";
import { computedEntry, type KnipProject, nextPage, nextProject, probeMarker, probeMessage, settingsEntry, viteProject }
  from "../../packages/producer/test/support/knip-plugin-projects.ts";

// The scenarios run the entry analysis of a small frontend project through the
// command line: Stage 2 runs Knip 6.44.1 in the pinned tool image with Docker, with
// no network and a read-only file system, and Stage 4 collect saves the behavior
// entry candidates. They run only in the docker profile.
type Json = Record<string, unknown>;
interface Issue { file?: unknown; files?: unknown[] }
interface Candidate { found?: unknown; path?: unknown; name?: unknown; ruleId?: unknown; plugin?: unknown }

interface KnipPluginsWorld extends World {
  knipProject?: KnipProject;
  knipRun?: EntryAnalysisRun;
}

function savedRun(world: KnipPluginsWorld): EntryAnalysisRun {
  assert.ok(world.knipRun, "Run the entry analysis first.");
  return world.knipRun;
}

// A JSON file of the Stage 2 attempt.
function stageTwoJson(world: KnipPluginsWorld, name: string): Json {
  return JSON.parse(readFileSync(join(savedRun(world).stageTwo.folder, name), "utf8")) as Json;
}

// The completed Knip runs of both modes, with the files that each report lists as unused.
function knipRuns(world: KnipPluginsWorld): { mode: unknown; stderr: string; unused: unknown[] }[] {
  const runs = stageTwoJson(world, "knip-runs.json").runs as Json[];
  assert.deepEqual(runs.map(({ mode, status }) => ({ mode, status })),
    [{ mode: "normal", status: "completed" }, { mode: "production", status: "completed" }]);
  const text = (name: unknown): string => readFileSync(join(savedRun(world).stageTwo.folder, String(name)), "utf8");
  return runs.map(({ mode, stdout, stderr }) => ({ mode, stderr: text(stderr),
    unused: ((JSON.parse(text(stdout)) as { issues: Issue[] }).issues).filter((issue) => issue.files?.length)
      .map((issue) => issue.file) }));
}

function candidatesRecord(world: KnipPluginsWorld): { candidates: Candidate[]; gaps: Json[] } {
  return JSON.parse(readFileSync(join(savedRun(world).stageFour.attempt, "behavior-entry-candidates.json"), "utf8")) as
    { candidates: Candidate[]; gaps: Json[] };
}

After({ tags: "@docker" }, function (this: KnipPluginsWorld) {
  if (this.knipRun) removeScratch(this.knipRun.root);
});

Given("a saved snapshot of a frontend project whose entry file follows the framework's naming pattern",
  function (this: KnipPluginsWorld) {
    this.knipProject = nextProject;
  });

Given("a saved snapshot whose framework settings file is a script", function (this: KnipPluginsWorld) {
  this.knipProject = viteProject;
});

When("the operator runs entry analysis", { timeout: 45 * 60_000 }, function (this: KnipPluginsWorld) {
  assert.ok(this.knipProject, "Prepare a saved snapshot first.");
  this.knipRun = runEntryAnalysis(this.knipProject);
});

Then("Knip does not report the entry file as unused", function (this: KnipPluginsWorld) {
  for (const run of knipRuns(this)) assert.ok(!run.unused.includes(nextPage), `${String(run.mode)} reports ${nextPage}`);
});

// The Next.js plugin of Knip 6.44.1 has the production pattern of the special files
// of the app folder. The profile copies it with the form of a production entry.
Then("the entry is a candidate that names the plugin and the dependency as its source", function (this: KnipPluginsWorld) {
  const found = candidatesRecord(this).candidates.filter((candidate) => candidate.path === nextPage) as Json[];
  assert.equal(found.length, 1);
  const { sha256, patternRef, ...candidate } = found[0] as Json;
  const page = nextProject.snapshot.find(({ path }) => path === nextPage);
  assert.equal(sha256, createHash("sha256").update(page?.text ?? "").digest("hex"));
  assert.deepEqual(candidate, { found: "knip-plugin-pattern", role: "unknown", roleRef: null, path: nextPage,
    workspace: ".", manifest: "package.json", plugin: "next", dependency: "next", field: "production",
    pattern: "{,src/}app/**/{layout,page,route,template}.{js,jsx,ts,tsx}!" });
  // patternRef names the copied pattern in the profile record that Stage 2 finish registered.
  const [, index] = /^s2-check-preflight#\/pluginEntryPatterns\/(\d+)$/.exec(String(patternRef)) ?? [];
  const patterns = stageTwoJson(this, "preflight.json").pluginEntryPatterns as Json[];
  assert.equal(patterns[Number(index)]?.pattern, candidate.pattern);
});

// The profile turns every plugin off, so no Knip run loads the probe settings file:
// it would write its message to the saved stderr, and its marker next to itself.
Then("the settings file is not loaded", function (this: KnipPluginsWorld) {
  const profile = stageTwoJson(this, "knip-profile.json");
  const plugins = stageTwoJson(this, "preflight.json").disabledPlugins as string[];
  assert.deepEqual(plugins.filter((name) => profile[name] !== false), []);
  for (const run of knipRuns(this)) assert.ok(!run.stderr.includes(probeMessage), `${String(run.mode)} ran the settings file`);
  const markers = readdirSync(savedRun(this).root, { recursive: true }).map(String).filter((name) => name.endsWith(probeMarker));
  assert.deepEqual(markers, []);
});

Then("the profile names the framework plugin as found by its dependency but not copied, with the reason",
  function (this: KnipPluginsWorld) {
    const notCopied = stageTwoJson(this, "preflight.json").pluginsNotCopied as Json[];
    assert.deepEqual(notCopied.filter(({ plugin }) => plugin === "vite"), [{ workspace: ".", manifest: "package.json",
      plugin: "vite", dependency: "vite", reason: "Knip 6.44.1 gives this plugin no static entry or production " +
        "patterns: its entries come from its settings file or from its own code, which this profile does not run." }]);
  });

// Knip did not take the entries that only the settings file names, so both reports
// list them as unused. The settings rule of the Vite input finds the literal entry,
// the computed entry is a gap, and no plugin pattern names either file.
Then("an entry named only in that file comes from the settings rules or is a gap", function (this: KnipPluginsWorld) {
  for (const run of knipRuns(this))
    assert.deepEqual([settingsEntry, computedEntry].filter((path) => !run.unused.includes(path)), [], String(run.mode));
  const { candidates, gaps } = candidatesRecord(this);
  assert.deepEqual(candidates.filter(({ found }) => found === "syntax-rule").map(({ ruleId, path, name }) =>
    ({ ruleId, path, name })), [{ ruleId: "vite-build-rollup-options-input", path: "vite.config.js", name: settingsEntry }]);
  assert.deepEqual(gaps.map(({ kind, ruleId, path, expression }) => ({ kind, ruleId, path, expression })),
    [{ kind: "unknown-settings-value", ruleId: "vite-build-rollup-options-input", path: "vite.config.js",
      expression: "'src/' + 'admin.ts'" }]);
  assert.deepEqual(candidates.filter(({ path }) => path === settingsEntry || path === computedEntry), []);
});
