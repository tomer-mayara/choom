import { expect, test } from "bun:test";
import type { DiscoveryGap, DiscoveryQuestion } from "@choom/baseline-model/contracts";
import { placeDiscovery, recordCount } from "../../../src/lib/discovery-placement.ts";
import { discoveryFixture } from "../../support/discovery-fixtures.ts";

const evidenceRefs = ["s3-001-entry-analysis"];
const question = (id: string, ...subjectRefs: string[]): DiscoveryQuestion => ({ id, subjectRefs, text: `Question ${id}`, evidenceRefs });
const gap = (id: string, kind: string, ...subjectRefs: string[]): DiscoveryGap => ({ id, kind, subjectRefs, reason: `Gap ${id}`, evidenceRefs });

function place(questions: DiscoveryQuestion[], gaps: DiscoveryGap[] = []) {
  const { baseline, result } = discoveryFixture();
  return placeDiscovery(baseline, { ...result, questions, gaps });
}

test("a subject names an item by its exact ID or by the ID and a dot", () => {
  const placement = place([
    question("exact", "billing"), question("field", "billing.purpose"), question("deep", "billing.membership.paths"),
    question("prefix", "billing-api.owner"), question("longer", "billingx"), question("case", "Billing.purpose"),
  ]);
  expect(placement.items.get("billing")?.questions.map(({ id }) => id)).toEqual(["exact", "field", "deep"]);
  expect(placement.unplaced.questions.map(({ id }) => id)).toEqual(["prefix", "longer", "case"]);
});

test("components, interfaces, resources and rules can be named, and a record appears on every item that it names", () => {
  const placement = place([question("both", "billing.purpose", "invoice-api.documentation.summary")],
    [gap("resource", "unknown-owner", "invoice-store.owner"), gap("rule", "missing-check", "invoice-access.check")]);
  expect(placement.items.get("billing")?.questions.map(({ id }) => id)).toEqual(["both"]);
  expect(placement.items.get("invoice-api")?.questions.map(({ id }) => id)).toEqual(["both"]);
  expect(placement.items.get("invoice-store")?.gaps.map(({ id }) => id)).toEqual(["resource"]);
  expect(placement.items.get("invoice-access")?.gaps.map(({ id }) => id)).toEqual(["rule"]);
  expect(recordCount(placement.unplaced)).toBe(0);
});

test("a component counts the records about itself or its fields once each, and not those about its interfaces", () => {
  const placement = place([question("twice", "billing", "billing.purpose"), question("interface", "invoice-api.owner")],
    [gap("own", "missing-input", "billing.membership")]);
  const billing = placement.items.get("billing");
  expect(billing && recordCount(billing)).toBe(2);
  expect(billing?.questions.map(({ id }) => id)).toEqual(["twice"]);
  expect(placement.items.get("invoice-api")?.questions.map(({ id }) => id)).toEqual(["interface"]);
});

test("a subject that names no item goes to Unplaced with its record, and nothing is refused", () => {
  const placement = place([question("mixed", "billing.purpose", "src/billing/tax.ts"), question("earlier", "s3-001-question-001")],
    [gap("file", "deferred", "file-old-exporter"), gap("baseline", "missing-input", "baseline-example")]);
  expect(placement.items.get("billing")?.questions.map(({ id }) => id)).toEqual(["mixed"]);
  expect(placement.unplaced.questions.map(({ id }) => id)).toEqual(["mixed", "earlier"]);
  expect(placement.unplacedSubjects.get("mixed")).toEqual(["src/billing/tax.ts"]);
  expect(placement.unplaced.deferred.map(({ id }) => id)).toEqual(["file"]);
  expect(placement.unplaced.gaps.map(({ id }) => id)).toEqual(["baseline"]);
});

test("deferred gaps go to their own group, and other kinds, also unknown ones, stay with the gaps in saved order", () => {
  const placement = place([], [gap("first", "deferred", "billing"), gap("second", "a-new-kind", "billing.purpose"),
    gap("third", "deferred", "billing.groupingReason"), gap("fourth", "missing-input", "billing")]);
  const billing = placement.items.get("billing");
  expect(billing?.deferred.map(({ id }) => id)).toEqual(["first", "third"]);
  expect(billing?.gaps.map(({ id, kind }) => [id, kind])).toEqual([["second", "a-new-kind"], ["fourth", "missing-input"]]);
  expect(billing && recordCount(billing)).toBe(4);
});
