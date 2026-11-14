import { expect, test } from "bun:test";
import { projectInterfaceSources } from "../../../src/lib/interface-provenance.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { sourceUseReadingBaseline } from "../../support/source-use-reading-fixtures.ts";

test("one reference retains all source uses and intent statements without sharing status", () => {
  const baseline = sourceUseReadingBaseline();
  const item = fixtureItem(baseline.interfaces);
  const assessment = fixtureItem(baseline.sourceUsage.assessments);
  item.documentation.summary.evidenceRefs.push("reviewed-caller");
  const original = structuredClone(baseline);
  const view = projectInterfaceSources(item, assessment);
  const reference = view.references.find((reference) => reference.id === "reviewed-caller");
  expect(view.references.filter((reference) => reference.id === "reviewed-caller")).toHaveLength(1);
  expect(reference?.statements.map((statement) => statement.path)).toEqual(["invoice-api.documentation.summary"]);
  expect(reference?.uses.map((use) => use.id)).toEqual(assessment.uses.map((use) => use.id));
  expect(reference?.scope).toBe(true);
  expect(view.statements.some((statement) => statement.path.includes("sourceUsage"))).toBe(false);
  expect(baseline).toEqual(original);
});

test("distinct intent and source-use notes for one reference retain their own descriptions", () => {
  const baseline = sourceUseReadingBaseline();
  const item = fixtureItem(baseline.interfaces);
  const assessment = fixtureItem(baseline.sourceUsage.assessments);
  item.documentation.summary.evidenceRefs.push("reviewed-caller");
  item.documentation.sourceNotes.push({ ...structuredClone(fixtureItem(assessment.sourceNotes)), description: "This source supports the saved purpose statement." });
  const view = projectInterfaceSources(item, assessment);
  expect(view.notes.find(({ note }) => note.evidenceRef === "reviewed-caller")?.note.description).toBe("This source supports the saved purpose statement.");
  expect(view.usageNotes.find(({ note }) => note.evidenceRef === "reviewed-caller")?.note.description).toBe("Checkout calls createInvoice with the order.");
  expect(view.usageNotes.find(({ note }) => note.evidenceRef === "reviewed-binding")?.uses).toHaveLength(7);
});
