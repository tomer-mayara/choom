import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Then, type DataTable } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { parse } from "yaml";
import { object, objects, quoted } from "../../support/import/fixtures.ts";
import { actualDocument, expectComponents, expectEdge, expectFailure, relationship } from "../../support/import/interactions.ts";
import { driver, fixture, type ImportWorld } from "../../support/import/world.ts";

for (const pattern of [
  "the diagram contains only those three component cards",
  "the new diagram contains only those three component cards",
  "the document contains only the three declared components",
]) {
  Then(pattern, async function (this: ImportWorld) { await expectComponents(this, fixture(this).declarations); });
}

for (const pattern of [
  /^the diagram contains only component cards (".+")$/,
  /^the document contains only components (".+")$/,
  /^the diagram includes only (".+")$/,
  /^the diagram has only the four cards (".+")$/,
]) {
  Then(pattern, async function (this: ImportWorld, list: string) { await expectComponents(this, quoted(list)); });
}

Then("the document includes components {string} and {string}", async function (this: ImportWorld, first: string, second: string) {
  const ids = (await driver(this).view()).componentIds;
  assert.ok(ids.includes(first) && ids.includes(second));
});

for (const pattern of [
  "it shows an import from {string} to {string}", "it shows the import from {string} to {string}",
  "the diagram shows the import from {string} to {string}", "the document includes the import from {string} to {string}",
  "the document contains an import from {string} to {string}", "the import from {string} to {string} is present",
]) {
  Then(pattern, async function (this: ImportWorld, source: string, target: string) { await expectEdge(this, source, target); });
}

for (const pattern of ["the diagram contains only those three cards and the import from {string} to {string}", "the diagram contains only those three cards and one import from {string} to {string}"]) {
  Then(pattern, async function (this: ImportWorld, source: string, target: string) {
    await expectComponents(this, fixture(this).declarations);
    await expectEdge(this, source, target);
    assert.equal((await driver(this).view()).edges.length, 1);
  });
}

Then("I see {string}, {string}, and {string}", async function (this: ImportWorld, first: string, second: string, third: string) {
  for (const label of [first, second, third]) await expect.poll(async () => (await driver(this).view()).text).toContain(label);
});

Then("{string} remains selected", async function (this: ImportWorld, name: string) {
  assert.equal(fixture(this).facts.selectedName, name);
  assert.ok(this.selectedRepository);
  await expect.poll(async () => (await driver(this).view()).statuses.join(" ")).toContain(this.selectedRepository);
});

Then("{string} has a reported-file count of {int}", async function (this: ImportWorld, id: string, count: number) {
  if (this.stepKind === "Context") {
    const component = objects(fixture(this).document.components).find((entry) => entry.id === id);
    assert.ok(component);
    component.reportedFiles = count;
    return;
  }
  const component = objects((await actualDocument(this)).components).find((entry) => entry.id === id);
  assert.ok(component);
  assert.equal(component.reportedFiles, count);
});

Then("{string} still has a reported-file count of {int}", async function (this: ImportWorld, id: string, count: number) {
  const component = objects((await actualDocument(this)).components).find((entry) => entry.id === id);
  assert.ok(component);
  assert.equal(component.reportedFiles, count);
});

Then("the reported-file counts are:", async function (this: ImportWorld, table: DataTable) {
  const components = objects((await actualDocument(this)).components);
  for (const row of table.hashes()) {
    const component = components.find((entry) => entry.id === row.component);
    assert.ok(component);
    assert.equal(component.reportedFiles, Number(row.count));
  }
});

Then("those imports create no inter-component relationships", async function (this: ImportWorld) {
  assert.deepEqual((await actualDocument(this)).relationships, []);
  assert.deepEqual((await driver(this).view()).edges, []);
});

Then("there is one import from {string} to {string} with two evidence file pairs", async function (this: ImportWorld, source: string, target: string) {
  assert.equal(objects((await relationship(this, source, target)).evidence).length, 2);
});

Then("there is one import from {string} to {string} with both file pairs as evidence", async function (this: ImportWorld, source: string, target: string) {
  const pairs = objects((await relationship(this, source, target)).evidence).map(({ sourceFile, targetFile }) => ({ sourceFile, targetFile }));
  assert.deepEqual(pairs, fixture(this).pairs);
});

Then("the pair from {string} retains both typeOnly variants", async function (this: ImportWorld, source: string) {
  const pair = objects((await relationship(this)).evidence).find((entry) => entry.sourceFile === source);
  assert.ok(pair);
  const flags = objects(pair.variants).map((variant) => variant.typeOnly);
  assert.equal(flags.length, 2);
  assert.ok(flags.includes(true) && flags.includes(false));
});

Then("that evidence variant has no typeOnly value", async function (this: ImportWorld) {
  const expected = fixture(this).pairs;
  assert.equal(expected.length, 1);
  const pairs = objects((await relationship(this)).evidence);
  assert.deepEqual(pairs.map(({ sourceFile, targetFile }) => ({ sourceFile, targetFile })), expected);
  const pair = pairs[0];
  assert.ok(pair);
  const variants = objects(pair.variants);
  assert.equal(variants.length, 1);
  const variant = variants[0];
  assert.ok(variant);
  assert.ok(!Object.hasOwn(variant, "typeOnly"));
});

Then("the document contains both directed imports", async function (this: ImportWorld) {
  await expectEdge(this, "src/a", "src/b");
  await expectEdge(this, "src/b", "src/a");
});

Then("its component and relationship identifiers are unchanged", async function (this: ImportWorld) {
  assert.ok(this.previousDocument);
  const document = await actualDocument(this);
  for (const key of ["components", "relationships"]) {
    assert.deepEqual(objects(document[key]).map((entry) => entry.id), objects(this.previousDocument[key]).map((entry) => entry.id));
  }
});

Then("its evidence contains the same file pairs and variants", async function (this: ImportWorld) {
  assert.ok(this.previousDocument);
  assert.deepEqual(objects((await actualDocument(this)).relationships).map((edge) => edge.evidence), objects(this.previousDocument.relationships).map((edge) => edge.evidence));
});

Then("{string} has {string} as its parent component", async function (this: ImportWorld, id: string, parent: string) {
  assert.equal(objects((await actualDocument(this)).components).find((entry) => entry.id === id)?.parent, parent);
});

Then("its recorded source input remains {string}", async function (this: ImportWorld, input: string) {
  assert.deepEqual(object((await actualDocument(this)).analysis).inputs, [input]);
});

Then("the count is not described as an analyzed-file count", async function (this: ImportWorld) {
  assert.doesNotMatch((await driver(this).view()).text, /analy[sz]ed[- ]file count/i);
});

Then("its target evidence is {string}", async function (this: ImportWorld, target: string) {
  assert.deepEqual(objects((await relationship(this)).evidence).map((pair) => pair.targetFile), [target]);
});

Then("the diagram shows the import", async function (this: ImportWorld) {
  const { sourceComponent, targetComponent } = fixture(this).facts;
  assert.equal(typeof sourceComponent, "string");
  assert.equal(typeof targetComponent, "string");
  await expectEdge(this, sourceComponent as string, targetComponent as string);
});

Then("only those three components and the import with both file pairs are present", async function (this: ImportWorld) {
  await expectComponents(this, fixture(this).declarations);
  const pairs = objects((await relationship(this)).evidence).map(({ sourceFile, targetFile }) => ({ sourceFile, targetFile }));
  assert.deepEqual(pairs, fixture(this).pairs);
});

Then("the original file is unchanged", async function (this: ImportWorld) {
  assert.equal(await readFile(fixture(this).savedPath, "utf8"), fixture(this).originalSavedBytes);
});

Then("the destination still contains {string}", async function (this: ImportWorld, name: string) {
  const bytes = await readFile(fixture(this).destination, "utf8");
  assert.equal(bytes, fixture(this).facts.originalDestination);
  assert.equal(object(parse(bytes)).name, name);
});

Then("the exported document is named {string}", async function (this: ImportWorld, name: string) { assert.equal((await actualDocument(this)).name, name); });

Then("{string} remains displayed", async function (this: ImportWorld, name: string) {
  await expect.poll(async () => (await driver(this).view()).text).toContain(name);
});

Then("{string} remains displayed with an export failure notice", async function (this: ImportWorld, name: string) {
  await expect.poll(async () => (await driver(this).view()).text).toContain(name);
  await expectFailure(this, "export");
});

Then("that load cannot start while the first operation is unfinished", async function (this: ImportWorld) {
  assert.ok(this.requestedAction);
  assert.equal(await driver(this).actionEnabled(this.requestedAction), false);
});

Then("{string} is labelled {string}", async function (this: ImportWorld, id: string, label: string) {
  await expect.poll(async () => (await driver(this).view()).componentCards.find((card) => card.id === id)?.text ?? "").toContain(label);
});

Then("parent relationships are not shown as import arrows", async function (this: ImportWorld) {
  const document = await actualDocument(this);
  const edges = (await driver(this).view()).edges;
  assert.deepEqual(edges, objects(document.relationships).map(({ source, target }) => ({ source, target })));
});

for (const pattern of ["that import has two evidence file pairs", "the import retains both deep file pairs as evidence"]) {
  Then(pattern, async function (this: ImportWorld) {
    const pairs = objects((await relationship(this)).evidence).map(({ sourceFile, targetFile }) => ({ sourceFile, targetFile }));
    assert.equal(pairs.length, 2);
    assert.deepEqual(pairs, fixture(this).pairs);
  });
}

Then("the diagram is available to export as Choom YAML", async function (this: ImportWorld) { assert.ok(await driver(this).actionEnabled("Export Diagram")); });
Then("it identifies dependency-cruiser 18.7.2 as the recorded analyzer", async function (this: ImportWorld) {
  const provenance = object((await actualDocument(this)).analysis);
  assert.equal(provenance.enforcer, "dependency-cruiser");
  assert.equal(provenance.version, "18.7.2");
});
