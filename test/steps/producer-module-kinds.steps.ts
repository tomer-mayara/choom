import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { commonJsTypeScript, esModulePackage, type ModuleKindPackage, nodeNextPackage }
  from "../../packages/producer/test/fixtures/module-kinds/packages.ts";
import { packageGraph, type SavedGraph } from "../../packages/producer/test/support/module-kind-graph.ts";

// The scenarios build the Stage 4 graph of a small saved package with the
// checkout's dependency-cruiser: Stage 4 start, then the graph helper on the saved
// snapshot. They check the edges from one file to "#dep". The package imports
// field maps "#dep" to dep/index.mjs for the import condition and to
// dep/index.cjs for the require condition.
type Edge = SavedGraph["contexts"][number]["edges"][number];

interface ModuleKindWorld extends World {
  kindPackage?: ModuleKindPackage;
  kindFile?: string;
  withoutTypeField?: boolean;
  kindGraph?: SavedGraph;
}

const importTarget = "dep/index.mjs";
const requireTarget = "dep/index.cjs";
// The packages without a type field, by the compiler module setting of their TypeScript.
const compiledPackages: Record<string, { fixture: ModuleKindPackage; module: number }> = {
  commonjs: { fixture: commonJsTypeScript, module: 1 },
  nodenext: { fixture: nodeNextPackage, module: 199 },
};

function choose(world: ModuleKindWorld, fixture: ModuleKindPackage, file: string): void {
  assert.ok(fixture.snapshot.some(({ path }) => path === file), `The package has no file ${file}.`);
  world.kindPackage = fixture;
  world.kindFile = file;
}

function packageType(fixture: ModuleKindPackage): unknown {
  const manifest = fixture.snapshot.find(({ path }) => path === "package.json");
  assert.ok(manifest, "The package has no package.json.");
  return (JSON.parse(String(manifest.text)) as { type?: unknown }).type;
}

// The edges from the chosen file to "#dep" in every context of the saved graph.
function dependencyEdges(world: ModuleKindWorld): Edge[] {
  const graph = world.kindGraph;
  assert.ok(graph, "Build the dependency graph first.");
  assert.equal(graph.status, "completed");
  const edges = graph.contexts.flatMap(({ edges: contextEdges }) => contextEdges)
    .filter(({ from, specifier }) => from === world.kindFile && specifier === "#dep");
  assert.ok(edges.length > 0, `The graph has no edge from ${String(world.kindFile)} to #dep.`);
  return edges;
}

function targetsOf(world: ModuleKindWorld): unknown[] {
  return [...new Set(dependencyEdges(world).map(({ to }) => to))];
}

Given("a package with type {string} that imports a dependency with separate import and require targets",
  function (this: ModuleKindWorld, type: string) {
    assert.equal(packageType(esModulePackage), type);
    choose(this, esModulePackage, "main.js");
  });

Given("a {string} file in the same package that requires the same dependency", function (this: ModuleKindWorld, extension: string) {
  const file = "legacy" + extension;
  choose(this, esModulePackage, file);
  assert.match(String(esModulePackage.snapshot.find(({ path }) => path === file)?.text), /require\('#dep'\)/);
});

Given("a package without a type field", function (this: ModuleKindWorld) {
  this.withoutTypeField = true;
});

// The outline names the file without quotes, and the ES module scenario with quotes.
Given(/^a TypeScript file "?([^"\s]+)"? with compiler module (\S+) that imports the same dependency$/,
  function (this: ModuleKindWorld, file: string, module: string) {
    const compiled = compiledPackages[module];
    assert.ok(compiled, `No package compiles its TypeScript with module ${module}.`);
    assert.equal(compiled.fixture.compilerOptions?.module, compiled.module);
    if (this.withoutTypeField) assert.equal(packageType(compiled.fixture), undefined);
    choose(this, compiled.fixture, file);
  });

When("the dependency graph is built", { timeout: 120_000 }, async function (this: ModuleKindWorld) {
  assert.ok(this.kindPackage, "Choose a package first.");
  this.kindGraph = (await packageGraph(this.kindPackage)).graph;
});

Then("the edge points to the import target only", function (this: ModuleKindWorld) {
  assert.deepEqual(targetsOf(this), [importTarget]);
});

Then("the edge points to the require target only", function (this: ModuleKindWorld) {
  assert.deepEqual(targetsOf(this), [requireTarget]);
});

Then("the edge is not marked as pre-compilation only", function (this: ModuleKindWorld) {
  for (const { preCompilationOnly, dependencyTypes } of dependencyEdges(this)) {
    assert.equal(preCompilationOnly, false);
    assert.ok(!dependencyTypes.includes("pre-compilation-only"), JSON.stringify(dependencyTypes));
  }
});
