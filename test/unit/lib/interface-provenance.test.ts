import { expect, test } from "bun:test";
import { projectInterfaceSources } from "../../../src/lib/interface-provenance.ts";
import { baselineExample, fixtureItem, proposed } from "../../support/baseline-fixtures.ts";
import { interfaceSourceFixture } from "../../support/interface-source-fixtures.ts";

const prefix = "invoice-api.";
const paths = ["owner", "publicAccess", "allowedConsumers", "promises", "documentation.summary",
  "documentation.entries.create-invoice.kind", "documentation.entries.create-invoice.description",
  "documentation.entries.create-invoice.interaction", "documentation.entries.create-invoice.examples.valid-order.content",
  "documentation.entries.create-invoice.examples.empty-order.content", "documentation.entries.create-invoice.examples.literal-sample.content",
  "documentation.entries.invoice-type.kind", "documentation.entries.invoice-type.description", "documentation.entries.invoice-data.kind",
  "documentation.entries.invoice-data.description", "documentation.entries.invoice-data.examples.valid-order.content"];

test("source metadata visits every legacy and nested statement in saved order", () => {
  const item = fixtureItem(interfaceSourceFixture().interfaces);
  const original = structuredClone(item);
  const view = projectInterfaceSources(item);
  expect(view.statements.map(({ path }) => path)).toEqual(paths.map((path) => prefix + path));
  expect(view.statements.filter(({ status }) => status === "accepted").map(({ path, acceptanceRef }) => [path, acceptanceRef])).toEqual([
    [prefix + "allowedConsumers", "missing-review#/decisions/4"],
    [prefix + "documentation.summary", "review-42#decision-1"],
    [prefix + "documentation.entries.create-invoice.examples.empty-order.content", "missing-review#/decisions/4"],
  ]);
  expect(view.statements.filter(({ status }) => status === "proposed").every((statement) => statement.acceptanceRef === undefined)).toBe(true);
  expect(item).toEqual(original);
});

test("evidence IDs appear once while retaining every citing statement and unresolved references", () => {
  const view = projectInterfaceSources(fixtureItem(interfaceSourceFixture().interfaces));
  const contract = view.references.find(({ id }) => id === "contract-notes");
  expect(contract?.statements.map(({ path }) => path)).toEqual([
    "owner", "publicAccess", "allowedConsumers", "documentation.summary", "documentation.entries.create-invoice.examples.empty-order.content",
  ].map((path) => prefix + path));
  expect(view.references.filter(({ id }) => id === "contract-notes")).toHaveLength(1);
  expect(view.references.find(({ id }) => id === "unresolved-contract#/claims/7")?.statements.map(({ path }) => path))
    .toEqual([prefix + "owner", prefix + "publicAccess"]);
  expect(view.notes.some(({ note }) => note.evidenceRef === "unresolved-contract#/claims/7")).toBe(false);
});

test("saved notes retain exact locations, support associations, and absent locations", () => {
  const item = fixtureItem(interfaceSourceFixture().interfaces);
  const view = projectInterfaceSources(item);
  expect(view.notes.map(({ note }) => note)).toEqual(item.documentation?.sourceNotes ?? []);
  const reviewed = fixtureItem(view.notes);
  expect(reviewed.note.location).toEqual({ snapshotRef: "snapshot-invoice", path: "billing/invoice.ts", sha256: "a".repeat(64), lines: [1, 12] });
  expect(reviewed.statements.map(({ path }) => path)).toEqual([prefix + "documentation.entries.create-invoice.examples.valid-order.content"]);
  expect(view.notes.find(({ note }) => note.evidenceRef === "contract-notes")?.note.location).toBeUndefined();
  expect(view.statements.some(({ path }) => path.endsWith("invoice-data.examples.valid-order.content"))).toBe(true);
});

test("legacy null statements keep metadata without invented notes or locations", () => {
  const item = fixtureItem(baselineExample().interfaces);
  item.owner = proposed(null); item.promises = proposed(null);
  const view = projectInterfaceSources(item);
  expect(view.statements.map(({ path }) => path)).toEqual(paths.slice(0, 4).map((path) => prefix + path));
  expect(view.notes).toEqual([]);
  expect(view.references.map(({ id }) => id)).toEqual(["missing-evidence#/items/0", "missing-evidence#/items/1"]);
});
