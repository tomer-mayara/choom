import assert from "node:assert/strict";
import { join, posix } from "node:path";
import { Given, type DataTable } from "@cucumber/cucumber";
import { object, objects, quoted, type Data } from "../../support/import/fixtures.ts";
import { fixture, type ImportWorld } from "../../support/import/world.ts";

for (const pattern of [
  /^a repository declares only components (".+")$/,
  /^(?:only )?components (".+") are declared$/,
  /^(".+") are declared components$/,
  /^("[^"]+") is a declared component$/,
]) {
  Given(pattern, function (this: ImportWorld, list: string) { fixture(this).declare(quoted(list)); });
}

Given("{string} is not declared as a component", function (this: ImportWorld, path: string) {
  assert.ok(!fixture(this).declarations.includes(path));
  fixture(this).directories.add(path);
});

Given(/^the reported files are (".+")$/, function (this: ImportWorld, list: string) {
  const value = fixture(this);
  value.facts.reportedFiles = quoted(list);
  for (const path of quoted(list)) value.file(path);
});

for (const pattern of [
  "{string} imports {string}", "{string} also imports {string}", "{string} now imports {string}",
  "analysis reports {string} importing {string}",
]) {
  Given(pattern, function (this: ImportWorld, source: string, target: string) { fixture(this).import(source, target); });
}

Given("those files import one another", function (this: ImportWorld) {
  const value = fixture(this);
  const files = value.facts.reportedFiles;
  assert.ok(Array.isArray(files));
  for (let index = 0; index < files.length; index += 1) {
    const source: unknown = files[index];
    const target: unknown = files[(index + 1) % files.length];
    assert.ok(typeof source === "string");
    assert.ok(typeof target === "string");
    value.import(source, target);
  }
});

Given("{string} has reported imports to {string} with typeOnly true and false", function (this: ImportWorld, source: string, target: string) {
  fixture(this).import(source, target, { typeOnly: true });
  fixture(this).import(source, target, { typeOnly: false });
});

Given("an import from {string} to {string} has no reported typeOnly flag", function (this: ImportWorld, source: string, target: string) {
  fixture(this).import(source, target);
});

Given("declared components {string} and {string} import each other", function (this: ImportWorld, source: string, target: string) {
  fixture(this).declare([source, target]);
  fixture(this).import(`${source}/one.ts`, `${target}/two.ts`);
  fixture(this).import(`${target}/two.ts`, `${source}/one.ts`);
});

Given("the root manifest declares only child {string} and that child's manifest declares no children", function (this: ImportWorld, path: string) {
  fixture(this).declare([".", path]);
});

Given("the root manifest declares a child at {string}", function (this: ImportWorld, path: string) {
  fixture(this).declare([".", path]);
  fixture(this).facts.linkedChild = path;
});

Given("that child's manifest declares a child at {string}", function (this: ImportWorld, relativePath: string) {
  const value = fixture(this);
  const parent = value.facts.linkedChild;
  assert.equal(typeof parent, "string");
  const child = posix.normalize(posix.join(parent as string, relativePath));
  const manifest = value.manifests.get(parent as string);
  assert.ok(manifest);
  manifest.children = [{ name: child, path: relativePath }];
  value.manifests.set(child, value.manifest(child));
  value.declarations.push(child);
});

Given(/^the analyzer inputs are (?:ordinary directories )?("[^"]+" and "[^"]+")$/, function (this: ImportWorld, list: string) {
  fixture(this).setInputs(quoted(list));
});

Given("the manifest's source input is {string}", function (this: ImportWorld, input: string) { fixture(this).setInputs([input]); });

Given("an unlinked component manifest exists in {string}", function (this: ImportWorld, path: string) {
  fixture(this).manifests.set(path, fixture(this).manifest(path));
});

Given('the selected directory has no "component.yaml"', function (this: ImportWorld) { fixture(this).absentFiles.add("component.yaml"); });

Given("its parent directory has a component manifest", function (this: ImportWorld) {
  fixture(this).manifests.set("..", fixture(this).manifest("."));
});

Given(/^the root manifest has (no annotated analyzer|two annotated analyzers|an unsupported enforcer|dependency-cruiser without inputs|dependency-cruiser with an empty input list|an input path that does not exist|a glob as a source input|a shell fragment as a source input)$/, function (this: ImportWorld, defect: string) {
  const value = fixture(this);
  const artifacts = object(value.rootManifest().artifacts);
  const entry = objects(artifacts.architecture)[0];
  assert.ok(entry);
  switch (defect) {
    case "no annotated analyzer": delete entry.enforcer; delete entry.inputs; break;
    case "two annotated analyzers": artifacts.architecture = [entry, { ...entry }]; break;
    case "an unsupported enforcer": entry.enforcer = "unsupported-analyzer"; break;
    case "dependency-cruiser without inputs": delete entry.inputs; break;
    case "dependency-cruiser with an empty input list": entry.inputs = []; break;
    case "an input path that does not exist": entry.inputs = ["missing-source"]; break;
    case "a glob as a source input": entry.inputs = ["src/**/*.ts"]; break;
    case "a shell fragment as a source input": entry.inputs = ["src; echo unexpected"]; break;
  }
});

Given(/^a component reference (resolves outside the selected repository|uses a symlink that resolves outside it|links an already declared directory|links back to an ancestor|names a child differently from its manifest|points to a missing child manifest)$/, function (this: ImportWorld, defect: string) {
  const value = fixture(this);
  value.declare([".", "src"]);
  const root = value.rootManifest();
  const child = value.manifests.get("src");
  assert.ok(child);
  switch (defect) {
    case "resolves outside the selected repository": root.children = [{ name: "outside", path: "../outside" }]; value.manifests.set("../outside", value.manifest("outside")); break;
    case "uses a symlink that resolves outside it": root.children = [{ name: "outside", path: "escape" }]; value.manifests.set("../outside", value.manifest("outside")); value.links.set("escape", join(value.root, "../outside")); break;
    case "links an already declared directory": root.children = [{ name: "src", path: "src" }, { name: "src", path: "./src" }]; break;
    case "links back to an ancestor": child.children = [{ name: "Atlas", path: ".." }]; break;
    case "names a child differently from its manifest": root.children = [{ name: "different", path: "src" }]; break;
    case "points to a missing child manifest": value.absentFiles.add("src/component.yaml"); break;
  }
});

Given("analysis reports these file pairs:", function (this: ImportWorld, table: DataTable) {
  for (const row of table.hashes()) {
    assert.ok(row.sourceFile && row.targetFile);
    fixture(this).import(row.sourceFile, row.targetFile);
  }
});

Given("analysis contains one local file record for {string}", function (this: ImportWorld, path: string) { fixture(this).file(path); });
Given("analysis reports the local file {string}", function (this: ImportWorld, path: string) { fixture(this).file(path); });
Given("that file is reported only as an import target", function (this: ImportWorld) {
  const module = objects(fixture(this).report.modules)[0];
  assert.ok(module);
  module.followed = false;
  module.dependencies = [];
});

Given(/^("[^"]+") imports ("[^"]+") through (a package alias|an in-repository symlink)$/, function (this: ImportWorld, sourceText: string, targetText: string, reference: string) {
  const value = fixture(this);
  const source = quoted(sourceText)[0];
  const target = quoted(targetText)[0];
  assert.ok(source && target);
  value.import(source, target);
  value.facts.reference = reference;
  if (reference === "a package alias") {
    value.files.set(source, 'import "@fixture/core";\n');
    value.files.set("packages/core/package.json", JSON.stringify({ name: "@fixture/core", exports: "./model/entity.ts" }));
    value.links.set("node_modules/@fixture/core", join(value.root, "packages/core"));
  } else {
    value.links.set("src/core-link", join(value.root, "packages/core"));
    value.files.set(source, 'import "../core-link/model/entity.ts";\n');
  }
});

Given("the canonical target belongs to declared component {string}", function (this: ImportWorld, component: string) {
  assert.ok(fixture(this).declarations.includes(component));
});

Given("the configuration excludes {string}", function (this: ImportWorld, path: string) {
  fixture(this).facts.exclusion = path;
  object(object(fixture(this).report.summary).optionsUsed).exclude = { path };
});
Given("analysis reports no files for declared component {string}", function (this: ImportWorld, path: string) { fixture(this).declare([".", path]); });

Given(/^completed analysis has (collapse enabled|focus enabled|reaches enabled|consolidated module records|a base directory other than the selected root|effective output other than JSON|persistent caching enabled)$/, function (this: ImportWorld, condition: string) {
  const value = fixture(this);
  const options = object(object(value.report.summary).optionsUsed);
  if (condition.endsWith(" enabled") && condition !== "persistent caching enabled") options[condition.replace(" enabled", "")] = "src";
  else if (condition === "consolidated module records") value.file("src/group").consolidated = true;
  else if (condition === "a base directory other than the selected root") options.baseDir = "src";
  else if (condition === "effective output other than JSON") options.outputType = "dot";
  else options.cache = true;
  value.facts.unsupportedCondition = condition;
});

Given("that file disappears before the import finishes", function (this: ImportWorld) {
  const path = objects(fixture(this).report.modules)[0]?.source;
  assert.equal(typeof path, "string");
  fixture(this).absentFiles.add(path as string);
});

for (const pattern of ["completed supported analysis reports an import from {string} to {string}", "analysis completes with an import from {string} to {string}"]) {
  Given(pattern, function (this: ImportWorld, source: string, target: string) {
    fixture(this).import(`${source}/app.ts`, `${target}/model.ts`);
    fixture(this).facts.sourceComponent = source;
    fixture(this).facts.targetComponent = target;
  });
}

Given(/^the repository analysis (stops before completing|exceeds the supported time limit|produces no report|produces an incomplete report|produces a malformed report)$/, function (this: ImportWorld, failure: string) {
  const failures: Record<string, Data> = {
    "stops before completing": { exitCode: 1 },
    "exceeds the supported time limit": { timeout: true },
    "produces no report": { report: null },
    "produces an incomplete report": { reportText: '{"modules":[' },
    "produces a malformed report": { reportText: "not-json" },
  };
  fixture(this).facts.execution = failures[failure];
});

Given(/^(a discoverable Node executable|a Node version supported by the analyzer|a repository-local dependency-cruiser installation|the supported dependency-cruiser version 18\.7\.2) is unavailable$/, function (this: ImportWorld, prerequisite: string) {
  fixture(this).facts.missingPrerequisite = prerequisite;
});
