import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { DepCruiserReportConverter } from "../../src/architecture/dependency-cruiser/converter.ts";
import type { DepCruiserConversionOutcome } from "../../src/architecture/dependency-cruiser/generated/contracts";
import { converterFixture, syncReport, type TestCruiserModule } from "../support/converter-fixtures.ts";

interface ConversionWorld extends World {
  fixture: ReturnType<typeof converterFixture>;
  conversion: DepCruiserConversionOutcome;
  malformed?: boolean;
}

function converted(world: ConversionWorld) {
  if (world.conversion.status !== "success") assert.fail(world.conversion.message);
  return world.conversion.document;
}

function edgeFreeFixture() {
  const fixture = converterFixture();
  fixture.input.request.components = fixture.input.request.components.filter(({ id }) => id !== "packages/core");
  fixture.report.modules = [{ source: "src/components/panel.ts", dependencies: [] }];
  return fixture;
}

Given("a completed report follows an import from a workspace input to a declared package", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  this.fixture.input.request.analysis.inputs = ["src/components"];
  this.fixture.report.summary.optionsUsed.args = "not-the-declared-inputs";
});

Given("a completed report has imports from two workspace subdirectories to a declared package", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  this.fixture.repository.addFile("packages/core/types/item.ts");
  this.fixture.report.modules.push(
    { source: "src/lib/format.ts", dependencies: [{ module: "@core/types/item", resolved: "packages/core/types/item.ts", dependencyTypes: ["local"] }] },
    { source: "packages/core/types/item.ts", dependencies: [] },
  );
});

Given("a completed report includes a local target that was not followed", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  const dependency = this.fixture.report.modules[0]?.dependencies[0];
  assert.ok(dependency);
  dependency.followable = false;
  dependency.matchesDoNotFollow = true;
  this.fixture.report.summary.optionsUsed.doNotFollow = { path: "packages/core" };
});

Given("a completed report reaches the declared package through {string}", function (this: ConversionWorld, reference: string) {
  this.fixture = converterFixture();
  const dependency = this.fixture.report.modules[0]?.dependencies[0];
  assert.ok(dependency);
  dependency.dependencyTypes = ["npm", "import"];
  if (reference === "a package alias") dependency.module = "@core/model/entity";
  else if (reference === "an internal symlink") {
    this.fixture.repository.aliases.set("node_modules/@core", "packages/core");
    dependency.resolved = "node_modules/@core/model/entity.ts";
    this.fixture.report.modules[1] = { source: dependency.resolved, dependencies: [], dependencyTypes: ["npm"] };
  } else assert.fail(`Unknown reference: ${reference}`);
});

Given("a completed report contains different import forms for the same local file pair", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  const source = this.fixture.report.modules[0];
  assert.ok(source);
  const pair = { module: "@core/model/entity", resolved: "packages/core/model/entity.ts" };
  source.dependencies = [
    { ...pair, dependencyTypes: ["local"] },
    { ...pair, dependencyTypes: ["local", "type-only", "pre-compilation-only"], dynamic: false },
    { ...pair, dependencyTypes: ["local"], typeOnly: false, dynamic: true, preCompilationOnly: false },
    { ...pair, dependencyTypes: ["local"] },
  ];
});

Given("a completed report contains {string} without a cross-component import", function (this: ConversionWorld, finding: string) {
  this.fixture = edgeFreeFixture();
  const { report, repository } = this.fixture;
  const rule = { name: "architecture-rule", severity: "warn" };
  if (finding === "an orphan violation") {
    report.summary.violations = [{ type: "module", from: "src/components/panel.ts", to: "src/components/panel.ts", rule }];
    return;
  }
  if (finding === "a folder violation") {
    report.folders = [{ name: "src/lib", moduleCount: 0 }, { name: "src/components", moduleCount: 1 }];
    report.summary.violations = [{ type: "folder", from: "src/lib", to: "src/components", rule }];
    report.summary.ruleSetUsed = { forbidden: [{ name: rule.name, scope: "folder" }] };
    return;
  }
  let target: TestCruiserModule;
  switch (finding) {
    case "an unresolved import": target = { source: "missing-package", dependencies: [], couldNotResolve: true }; break;
    case "a builtin violation": target = { source: "node:fs", dependencies: [], coreModule: true }; break;
    case "an external package rule":
      target = { source: "node_modules/vendor/index.js", dependencies: [], dependencyTypes: ["npm"] };
      repository.addFile(target.source);
      break;
    case "an outside-root violation":
      target = { source: "outside.ts", dependencies: [] };
      repository.aliases.set("outside.ts", "../external/private.ts");
      break;
    default: assert.fail(`Unknown finding: ${finding}`);
  }
  const source = report.modules[0];
  assert.ok(source);
  source.dependencies.push({ module: target.source, resolved: target.source, dependencyTypes: target.dependencyTypes ?? [],
    ...(target.coreModule === undefined ? {} : { coreModule: target.coreModule }),
    ...(target.couldNotResolve === undefined ? {} : { couldNotResolve: target.couldNotResolve }),
  });
  report.modules.push(target);
  if (finding !== "an unresolved import") report.summary.violations = [{ type: "dependency", from: source.source, to: target.source, rule }];
});

Given("a completed report contains an ordered {string} with a repeated file", function (this: ConversionWorld, path: string) {
  this.fixture = edgeFreeFixture();
  const files = ["src/core/z.ts", "src/core/a.ts", "src/core/z.ts"];
  for (const source of files.slice(0, 2)) {
    this.fixture.repository.addFile(source);
    this.fixture.report.modules.push({ source, dependencies: [] });
  }
  assert.ok(path === "cycle" || path === "via");
  const rule = { name: "ordered-finding", severity: "error" };
  this.fixture.report.summary.ruleSetUsed = { forbidden: [{ name: rule.name, scope: "module" }] };
  this.fixture.report.summary.violations = [{ type: path === "cycle" ? "cycle" : "reachability", from: files[0] ?? "", to: files[1] ?? "", rule,
    [path]: files.map((name) => ({ name, dependencyTypes: ["local"] })),
  }];
});

Given("a completed report contains a folder instability finding", function (this: ConversionWorld) {
  this.fixture = edgeFreeFixture();
  this.fixture.repository.addDirectory("src/ui");
  this.fixture.repository.addDirectory("src/core");
  this.fixture.report.folders = [{ name: "src/ui", moduleCount: 2 }, { name: "src/core", moduleCount: 3 }];
  this.fixture.report.summary.ruleSetUsed = { forbidden: [{ name: "stable-folders", scope: "folder" }] };
  this.fixture.report.summary.violations = [{ type: "instability", from: "src/ui", to: "src/core", rule: { name: "stable-folders", severity: "warn" }, metrics: { from: { instability: 0.8 }, to: { instability: 0.2 } } }];
});

Given("a completed report has {string}", function (this: ConversionWorld, condition: string) {
  this.fixture = converterFixture();
  const options = this.fixture.report.summary.optionsUsed;
  switch (condition) {
    case "collapse enabled": options.collapse = "src"; break;
    case "focus enabled": options.focus = { path: "src" }; break;
    case "reaches enabled": options.reaches = { path: "src" }; break;
    case "a consolidated module": Object.assign(this.fixture.report.modules[0] ?? {}, { consolidated: true }); break;
    case "a different base directory": options.baseDir = "src"; break;
    case "non-JSON output": options.outputType = "dot"; break;
    case "persistent caching": options.cache = true; break;
    default: assert.fail(`Unknown report condition: ${condition}`);
  }
});

Given("a completed report excludes a declared legacy component", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  this.fixture.repository.addDirectory("src/legacy");
  this.fixture.input.request.components.push({ id: "src/legacy", name: "legacy", parent: "src" });
  this.fixture.report.summary.optionsUsed.exclude = { path: "src/legacy" };
});

Given("a completed report has diagram reporter options and highlighting", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  this.fixture.report.summary.optionsUsed.reporterOptions = { dot: { collapsePattern: "src" }, archi: { collapsePattern: "src" }, ddot: { collapsePattern: "src" } };
  this.fixture.report.summary.optionsUsed.highlight = { path: "src" };
});

Given("a completed report says a required transpiler is unavailable", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  this.fixture.report.summary.environment.issues = [{ name: "missing-swc-transpiler", severity: "warn", description: "The configured SWC transpiler is missing." }];
});

Given("a completed supported report contains a non-blocking warning", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  this.fixture.report.summary.environment.issues = [{ name: "optional-defaults", severity: "warn", description: "The analyzer used optional defaults." }];
});

Given("a reported local source file disappears before conversion", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  this.fixture.repository.files.delete("packages/core/model/entity.ts");
});

Given("a completed report is malformed", function (this: ConversionWorld) {
  this.fixture = converterFixture();
  this.malformed = true;
});

Then("its failure identifies the missing relative source file", function (this: ConversionWorld) {
  assert.equal(this.conversion.status, "failure");
  if (this.conversion.status === "failure") {
    assert.ok(this.conversion.message.includes("packages/core/model/entity.ts"));
    assert.ok(!this.conversion.message.includes("/repository/"));
  }
});

When("the completed report is converted", async function (this: ConversionWorld) {
  syncReport(this.fixture);
  if (this.malformed) this.fixture.input.completed.json = '{"modules":';
  this.conversion = await new DepCruiserReportConverter(this.fixture.repository).convert(this.fixture.input);
});

Then("the converted document connects the workspace to the declared package", function (this: ConversionWorld) {
  const document = converted(this);
  assert.equal(document.relationships.length, 1);
  assert.deepEqual(document.relationships.map(({ source, target }) => ({ source, target })), [{ source: "src", target: "packages/core" }]);
});

Then("its provenance keeps the declared source inputs", function (this: ConversionWorld) {
  assert.deepEqual(converted(this).analysis.inputs, ["src/components"]);
});

Then("one component relationship retains both reported file pairs", function (this: ConversionWorld) {
  const relationships = converted(this).relationships;
  assert.equal(relationships.length, 1);
  assert.deepEqual(relationships[0]?.evidence.map(({ sourceFile, targetFile }) => ({ sourceFile, targetFile })), [
    { sourceFile: "src/components/panel.ts", targetFile: "packages/core/model/entity.ts" },
    { sourceFile: "src/lib/format.ts", targetFile: "packages/core/types/item.ts" },
  ]);
});

Then("no extra components are created from source directories", function (this: ConversionWorld) {
  assert.deepEqual(converted(this).components.map(({ id }) => id), [".", "packages/core", "src"]);
});

Then("the declared package counts that target as one reported file", function (this: ConversionWorld) {
  assert.equal(converted(this).components.find(({ id }) => id === "packages/core")?.reportedFiles, 1);
});

Then("the target evidence uses the canonical package file", function (this: ConversionWorld) {
  assert.equal(converted(this).relationships[0]?.evidence[0]?.targetFile, "packages/core/model/entity.ts");
});

Then("the relationship retains the distinct import flags and their unknown values", function (this: ConversionWorld) {
  const variants = converted(this).relationships[0]?.evidence[0]?.variants;
  assert.ok(variants);
  assert.equal(variants.length, 3);
  assert.ok(variants.some((variant) => Object.keys(variant).length === 0));
  assert.ok(variants.some(({ typeOnly, dynamic, preCompilationOnly }) => typeOnly === true && dynamic === false && preCompilationOnly === true));
  assert.ok(variants.some(({ typeOnly, dynamic, preCompilationOnly }) => typeOnly === false && dynamic === true && preCompilationOnly === false));
});

Then("the converted diagnostics retain the {string} subject", function (this: ConversionWorld, kind: string) {
  assert.ok(converted(this).diagnostics.some(({ subjects }) => subjects.some((subject) => subject.kind === kind)));
});

Then("the finding creates no component relationship", function (this: ConversionWorld) {
  assert.equal(converted(this).relationships.length, 0);
});

Then("its diagnostic keeps the reported {string} order", function (this: ConversionWorld, path: string) {
  assert.ok(path === "cycle" || path === "via");
  assert.deepEqual(converted(this).diagnostics[0]?.[path], ["src/core/z.ts", "src/core/a.ts", "src/core/z.ts"].map((value) => ({ kind: "file", value })));
});

Then("its diagnostic keeps the source and target folder metrics", function (this: ConversionWorld) {
  const diagnostic = converted(this).diagnostics[0];
  assert.ok(diagnostic);
  assert.deepEqual(diagnostic.subjects, [{ role: "source", kind: "folder", value: "src/ui" }, { role: "target", kind: "folder", value: "src/core" }]);
  assert.deepEqual(diagnostic.metrics, { "source.instability": 0.8, "target.instability": 0.2 });
});

Then("the finding creates no extra components", function (this: ConversionWorld) {
  assert.deepEqual(converted(this).components.map(({ id }) => id), [".", "src"]);
});

Then("conversion fails with {string}", function (this: ConversionWorld, code: string) {
  assert.ok(this.conversion.status === "failure");
  assert.equal(this.conversion.code, code);
  assert.ok(this.conversion.message.length > 0);
});

Then("the legacy component remains with zero reported files", function (this: ConversionWorld) {
  assert.equal(converted(this).components.find(({ id }) => id === "src/legacy")?.reportedFiles, 0);
});

Then("its scope notes describe the exclusion", function (this: ConversionWorld) {
  assert.ok(converted(this).analysis.scopeNotes.some((note) => /exclu/i.test(note) && note.includes("src/legacy")));
});

Then("its failure identifies the required transpiler", function (this: ConversionWorld) {
  assert.ok(this.conversion.status === "failure");
  assert.match(this.conversion.message, /swc/i);
});

Then("the converted document retains the warning message", function (this: ConversionWorld) {
  assert.ok(converted(this).diagnostics.some(({ severity, message }) => severity === "warning" && message === "The analyzer used optional defaults."));
});
