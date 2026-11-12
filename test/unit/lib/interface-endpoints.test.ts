import { expect, test } from "bun:test";
import { incompleteInterfaceCount } from "../../../src/lib/interface-arcs.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { interfaceEndpointBaseline } from "../../support/interface-endpoint-fixtures.ts";

test("the summary counts each incomplete interface once, including two missing endpoint facts", () => {
  const baseline = interfaceEndpointBaseline("complete");
  for (const [index, facts] of ["unknown owner", "unknown consumers", "both unknown"].entries()) {
    baseline.interfaces.push({ ...fixtureItem(interfaceEndpointBaseline(facts).interfaces), id: `incomplete-${index}` });
  }
  const original = structuredClone(baseline);
  expect(incompleteInterfaceCount(baseline)).toBe(3);
  expect(baseline).toEqual(original);
});

test.each(["complete", "no interfaces"])("%s has no incomplete interfaces", (facts) => {
  expect(incompleteInterfaceCount(interfaceEndpointBaseline(facts))).toBe(0);
});
