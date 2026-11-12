import { expect, test } from "bun:test";
import { interfaceArcs } from "../../../src/lib/interface-arcs.ts";
import { baselineExample, fixtureItem, proposed } from "../../support/baseline-fixtures.ts";
import { interfaceArcBaseline } from "../../support/interface-arc-fixtures.ts";

test("a known interface connects its recorded consumer to its owner without changing the baseline", () => {
  const baseline = baselineExample();
  const before = structuredClone(baseline);
  expect(interfaceArcs(baseline)).toMatchObject([{ interfaceId: "invoice-api", consumerId: "checkout", ownerId: "billing" }]);
  expect(baseline).toEqual(before);
});

test.each(["owner", "allowedConsumers"] as const)("an unknown %s does not produce an inferred arc", (field) => {
  const baseline = baselineExample();
  fixtureItem(baseline.interfaces)[field] = proposed(null);
  expect(interfaceArcs(baseline)).toEqual([]);
});

test("one interface produces one arc per consumer in recorded order", () => {
  expect(interfaceArcs(interfaceArcBaseline("two consumers")).map(({ consumerId }) => consumerId)).toEqual(["checkout", "reporting"]);
});

test("tuple identities stay distinct with separators, repeated names, reverse permissions, and reordered records", () => {
  const baseline = interfaceArcBaseline("opposite");
  const first = fixtureItem(baseline.interfaces);
  const second = fixtureItem(baseline.interfaces, 1);
  first.id = "invoice-api";
  first.allowedConsumers.value = ["checkout"];
  second.id = "invoice";
  second.name = first.name;
  second.owner.value = "billing";
  second.allowedConsumers.value = ["api-checkout"];
  baseline.components.push({ ...fixtureItem(baseline.components), id: "api-checkout" });
  const arcs = interfaceArcs(baseline);
  expect(new Set(arcs.map(({ id }) => id)).size).toBe(2);
  expect(arcs.map(({ id }) => JSON.parse(id))).toEqual([["invoice-api", "checkout", "billing"], ["invoice", "api-checkout", "billing"]]);
  expect(interfaceArcs({ ...baseline, interfaces: [...baseline.interfaces].reverse() }).map(({ id }) => id))
    .toEqual(arcs.map(({ id }) => id).reverse());
  expect(interfaceArcs(interfaceArcBaseline("opposite")).map(({ consumerId, ownerId }) => [consumerId, ownerId]))
    .toEqual([["checkout", "billing"], ["billing", "checkout"]]);
});
