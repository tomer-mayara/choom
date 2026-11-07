import assert from "node:assert/strict";
import { Given } from "@cucumber/cucumber";
import { object, objects, quoted, type Data } from "../../support/import/fixtures.ts";
import { fixture, type ImportWorld } from "../../support/import/world.ts";

function violation(world: ImportWorld, finding: Data): void {
  const summary = object(fixture(world).report.summary);
  summary.violations = [...objects(summary.violations), finding];
  fixture(world).facts.finding = finding;
}

Given(/^analysis reports (an orphan finding for "[^"]+"|a folder finding for "[^"]+"|an unresolved import of "[^"]+") without a cross-component import$/, function (this: ImportWorld, finding: string) {
  const value = fixture(this);
  const path = quoted(finding)[0];
  assert.ok(path);
  if (finding.startsWith("an unresolved")) {
    const module = value.file("src/example.ts");
    module.dependencies = [{ module: path, resolved: path, couldNotResolve: true, dependencyTypes: ["unknown"], moduleSystem: "es6", dynamic: false }];
    value.report.modules = [...objects(value.report.modules), { source: path, dependencies: [], couldNotResolve: true, dependencyTypes: ["unknown"] }];
  } else if (finding.startsWith("a folder")) {
    value.directories.add(path);
    value.report.folders = [{ name: path, moduleCount: 0 }];
    violation(this, { type: "folder", from: path, to: path, rule: { name: "folder-rule", severity: "warn" } });
  } else {
    value.file(path);
    violation(this, { type: "module", from: path, to: path, rule: { name: "no-orphans", severity: "warn" } });
  }
  value.facts.findingSubject = path;
});

Given(/^a reported (cycle|via) contains (".+") in that order$/, function (this: ImportWorld, kind: string, paths: string) {
  const sequence = quoted(paths);
  for (const path of sequence) fixture(this).file(path);
  violation(this, {
    type: "dependency", from: sequence[0], to: sequence[sequence.length - 1],
    rule: { name: `reported-${kind}`, severity: "error" },
    [kind]: sequence.map((name) => ({ name, dependencyTypes: ["local"] })),
  });
  fixture(this).facts.orderedPath = sequence;
});

Given("a folder finding reports source {string} with instability {float}", function (this: ImportWorld, source: string, instability: number) {
  fixture(this).directories.add(source);
  fixture(this).report.folders = [{ name: source, moduleCount: 0 }];
  violation(this, { type: "folder", from: source, rule: { name: "stable-dependencies", severity: "warn" }, metrics: { from: { instability } } });
});

Given("its target is {string} with instability {float}", function (this: ImportWorld, target: string, instability: number) {
  fixture(this).directories.add(target);
  fixture(this).report.folders = [...objects(fixture(this).report.folders), { name: target, moduleCount: 0 }];
  const finding = object(fixture(this).facts.finding);
  finding.to = target;
  object(finding.metrics).to = { instability };
});

Given("the configured analysis requires a transpiler that is unavailable", function (this: ImportWorld) {
  const summary = object(fixture(this).report.summary);
  object(summary.optionsUsed).tsPreCompilationDeps = true;
  object(summary.environment).issues = [{ severity: "warn", name: "missing-tsc-transpiler", description: "The configured TypeScript analysis requires an available TypeScript transpiler." }];
  fixture(this).facts.requiredTranspiler = "typescript";
});

Given("it includes a non-blocking warning", function (this: ImportWorld) {
  const message = "The analyzer reports an advisory environment warning.";
  object(object(fixture(this).report.summary).environment).issues = [{ severity: "warn", name: "advisory", description: message }];
  fixture(this).facts.warningMessage = message;
});

Given("rule {string} reports that import as an error", function (this: ImportWorld, rule: string) {
  const pair = fixture(this).pairs[0];
  assert.ok(pair);
  violation(this, { type: "dependency", from: pair.sourceFile, to: pair.targetFile, rule: { name: rule, severity: "error" } });
  object(fixture(this).report.summary).error = 1;
  object(fixture(this).report.summary).advisedExitCode = 1;
});

Given("the repository is located at {string}", function (this: ImportWorld, root: string) {
  fixture(this).facts.originalMachineRoot = root;
});

Given("a reported finding refers outside it to {string}", function (this: ImportWorld, path: string) {
  fixture(this).file("src/components/panel.ts").dependencies = [{ module: path, resolved: path, dependencyTypes: ["local"], couldNotResolve: false }];
  fixture(this).report.modules = [...objects(fixture(this).report.modules), { source: path, dependencies: [] }];
  violation(this, { type: "dependency", from: "src/components/panel.ts", to: path, rule: { name: "outside-repository", severity: "warn" } });
});
