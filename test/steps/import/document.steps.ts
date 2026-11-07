import assert from "node:assert/strict";
import { Given, type DataTable } from "@cucumber/cucumber";
import { corruptDocument, corruptEncoding } from "../../support/import/document-fixtures.ts";
import { objects, quoted, type FilePair } from "../../support/import/fixtures.ts";
import { fixture, type ImportWorld } from "../../support/import/world.ts";

for (const pattern of [
  /^(?:a Choom YAML document|a document|a saved document) contains (?:only )?components (".+")$/,
  /^a Choom YAML document lists only components (".+") in that order$/,
]) {
  Given(pattern, function (this: ImportWorld, list: string) { fixture(this).savedComponents(quoted(list)); });
}

Given(/^I exported a document containing only components (".+")$/, function (this: ImportWorld, list: string) {
  fixture(this).savedComponents(quoted(list));
  fixture(this).facts.exportBeforeReopen = true;
});

Given("its import from {string} to {string} has evidence from {string} to {string}", function (this: ImportWorld, source: string, target: string, sourceFile: string, targetFile: string) {
  fixture(this).savedImport(source, target, [{ sourceFile, targetFile }]);
});

Given("its import from {string} to {string} has this evidence:", function (this: ImportWorld, source: string, target: string, table: DataTable) {
  const pairs: FilePair[] = table.hashes().map((row) => {
    assert.ok(row.sourceFile && row.targetFile);
    return { sourceFile: row.sourceFile, targetFile: row.targetFile };
  });
  fixture(this).savedImport(source, target, pairs);
});

Given("it describes an import from {string} to {string}", function (this: ImportWorld, source: string, target: string) {
  const examples: Record<string, FilePair> = {
    "src -> packages/core": { sourceFile: "src/lib/format.ts", targetFile: "packages/core/model/entity.ts" },
    "src/ui -> src/core": { sourceFile: "src/ui/app.ts", targetFile: "src/core/model.ts" },
  };
  const pair = examples[`${source} -> ${target}`];
  assert.ok(pair);
  fixture(this).savedImport(source, target, [pair]);
});

Given("its import evidence includes {string} to {string}", function (this: ImportWorld, sourceFile: string, targetFile: string) {
  fixture(this).savedImport("src", "packages/core", [{ sourceFile, targetFile }]);
});

Given("{string} and {string} both name {string} as their parent", function (this: ImportWorld, first: string, second: string, parent: string) {
  for (const id of [first, second]) {
    const component = objects(fixture(this).document.components).find((item) => item.id === id);
    assert.ok(component);
    component.parent = parent;
  }
});

Given("a Choom YAML finding lists target {string} before source {string}", function (this: ImportWorld, target: string, source: string) {
  fixture(this).document.diagnostics = [{
    code: "rule-violation", severity: "warning", message: "A directed finding", rule: "direction",
    subjects: [{ role: "target", kind: "file", value: target }, { role: "source", kind: "file", value: source }],
  }];
});

Given("a folder finding identifies source {string} and target {string}", function (this: ImportWorld, source: string, target: string) {
  fixture(this).document.diagnostics = [{
    code: "rule-violation", severity: "warning", message: "A folder finding", rule: "folder-direction",
    subjects: [{ role: "source", kind: "folder", value: source }, { role: "target", kind: "folder", value: target }],
  }];
});

Given(/^a version-1 Choom YAML document has (two components with the same ID|two components with the same name|no root component|a parent that is not a component|a cycle of parent references|an import to an unknown component|an import from a component to itself|two relationships for the same ordered pair|evidence owned by a different source|a negative reported-file count|a fractional reported-file count)$/, function (this: ImportWorld, defect: string) {
  corruptDocument(fixture(this), defect);
});

Given(/^a Choom YAML file contains (schemaVersion 2|duplicate mapping keys|a custom YAML tag|two YAML documents|an unknown semantic field)$/, function (this: ImportWorld, content: string) {
  corruptEncoding(fixture(this), content);
});

for (const pattern of ["neither its source repository nor analyzer tools are available", "the viewing machine has neither the repository nor analyzer tools"]) {
  Given(pattern, function (this: ImportWorld) {
    fixture(this).facts.sourceFreeViewer = true;
    this.desktopImport = false;
  });
}
