import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { object, objects, quoted } from "../../support/import/fixtures.ts";
import { actualDocument, diagnostics, expectComponents, expectFailure, expectRoles } from "../../support/import/interactions.ts";
import { driver, fixture, type ImportWorld } from "../../support/import/world.ts";

for (const pattern of [
  "the finding still identifies {string} as source and {string} as target",
  "the finding identifies {string} as source and {string} as target",
  "the finding keeps source folder {string} and target folder {string}",
]) {
  Then(pattern, async function (this: ImportWorld, source: string, target: string) { await expectRoles(this, source, target); });
}

Then(/^loading is refused because (.+)$/, async function (this: ImportWorld, reason: string) { await expectFailure(this, reason); });
Then("loading is refused for the missing selected-root manifest", async function (this: ImportWorld) { await expectFailure(this, "manifest"); });

Then(/^diagnostics retain (the file subject "[^"]+"|the folder subject "[^"]+"|the unresolved specifier "[^"]+")$/, async function (this: ImportWorld, detail: string) {
  const value = quoted(detail)[0];
  const kind = detail.includes("folder") ? "folder" : detail.includes("unresolved") ? "unresolved" : "file";
  assert.ok((await diagnostics(this)).some((finding) => objects(finding.subjects).some((subject) => subject.kind === kind && subject.value === value)));
});

Then("the document still contains only {string} and {string}, with no component import", async function (this: ImportWorld, first: string, second: string) {
  await expectComponents(this, [first, second]);
  assert.deepEqual((await actualDocument(this)).relationships, []);
});

Then(/^the diagnostic retains that (cycle|via) in the reported order$/, async function (this: ImportWorld, kind: string) {
  const finding = (await diagnostics(this)).find((entry) => Array.isArray(entry[kind]));
  assert.ok(finding);
  assert.deepEqual(objects(finding[kind]).map((reference) => reference.value), fixture(this).facts.orderedPath);
});

Then("its metrics are source.instability {float} and target.instability {float}", async function (this: ImportWorld, source: number, target: number) {
  const finding = (await diagnostics(this)).find((entry) => entry.metrics !== undefined);
  assert.ok(finding);
  assert.equal(object(finding.metrics)["source.instability"], source);
  assert.equal(object(finding.metrics)["target.instability"], target);
});

Then(/^loading is refused with an unsupported-configuration explanation for (.+)$/, async function (this: ImportWorld, condition: string) {
  await expectFailure(this, "unsupported");
  const terms: Record<string, string> = {
    "collapse enabled": "collapse", "focus enabled": "focus", "reaches enabled": "reaches",
    "consolidated module records": "consolidated module records",
    "a base directory other than the selected root": "base directory",
    "effective output other than JSON": "output format", "persistent caching enabled": "persistent caching",
  };
  const identifyingTerm = terms[condition];
  assert.ok(identifyingTerm);
  await expectFailure(this, identifyingTerm);
});

Then("{string} remains in the document with a reported-file count of {int}", async function (this: ImportWorld, id: string, count: number) {
  const component = objects((await actualDocument(this)).components).find((entry) => entry.id === id);
  assert.ok(component);
  assert.equal(component.reportedFiles, count);
});

Then("the analysis scope notes describe the exclusion", async function (this: ImportWorld) {
  const scope = object((await actualDocument(this)).analysis).scopeNotes;
  assert.ok(Array.isArray(scope));
  assert.ok(scope.some((note) => typeof note === "string" && note.includes(String(fixture(this).facts.exclusion))));
});

Then("loading fails and identifies the missing required transpiler", async function (this: ImportWorld) { await expectFailure(this, "transpiler"); });

Then("the document contains that import and retains the warning's message", async function (this: ImportWorld) {
  const actual = await actualDocument(this);
  const source = fixture(this).facts.sourceComponent;
  const target = fixture(this).facts.targetComponent;
  assert.ok(objects(actual.relationships).some((edge) => edge.source === source && edge.target === target));
  assert.ok(JSON.stringify([actual.diagnostics, object(actual.analysis).scopeNotes]).includes(String(fixture(this).facts.warningMessage)));
});

Then("it fails with a source-change error for {string}", async function (this: ImportWorld, path: string) {
  await expectFailure(this, "source");
  await expectFailure(this, path);
});

Then("diagnostics identify rule {string} with error severity", async function (this: ImportWorld, rule: string) {
  assert.ok((await diagnostics(this)).some((finding) => finding.rule === rule && finding.severity === "error"));
});

Then(/^loading is refused and identifies (.+) as required$/, async function (this: ImportWorld, prerequisite: string) {
  const term = prerequisite.includes("Node") ? "Node" : "dependency-cruiser";
  await expectFailure(this, term);
});

for (const pattern of ["no new architecture document is produced", "it produces no new architecture document"]) {
  Then(pattern, async function (this: ImportWorld) {
    assert.deepEqual((await driver(this).view()).componentIds, []);
    assert.equal(await driver(this).actionEnabled("Export Diagram"), false);
  });
}

Then(/^the load reports (.+)$/, async function (this: ImportWorld, reason: string) { await expectFailure(this, reason); });
Then(/^the failure identifies (.+)$/, async function (this: ImportWorld, stage: string) { await expectFailure(this, stage); });

Then("the load ends as cancelled", async function (this: ImportWorld) {
  await expect.poll(async () => (await driver(this).view()).statuses.join(" ").toLowerCase()).toContain("cancelled");
  assert.ok(await driver(this).actionEnabled("Load Repo"));
});

Then("neither exported references nor diagnostic messages contain {string}", async function (this: ImportWorld, path: string) {
  await actualDocument(this);
  assert.ok(this.exportedPath);
  assert.ok(!(await readFile(this.exportedPath, "utf8")).includes(path));
});

Then("the outside-root subject has an opaque identifier", async function (this: ImportWorld) {
  const subjects = (await diagnostics(this)).flatMap((finding) => objects(finding.subjects));
  const outside = subjects.find((subject) => subject.kind === "outside-root");
  assert.ok(outside);
  assert.equal(typeof outside.value, "string");
  assert.ok(String(outside.value).length > 0);
  assert.doesNotMatch(String(outside.value), /^(?:\/|[A-Za-z]:[\\/])/);
  assert.ok(!String(outside.value).includes("/home/alex"));
});
