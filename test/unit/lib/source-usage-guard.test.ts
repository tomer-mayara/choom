import { expect, test } from "bun:test";
import { incompleteInterfaceCount, interfaceArcs } from "../../../src/lib/interface-arcs.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";

test("version 3 does not project permission records as source arrows", () => {
  const input = sourceUsageBaseline();
  fixtureItem(input.interfaces).allowedConsumers.value = ["billing"];
  expect(interfaceArcs(input).some((arc) => arc.consumerId === "billing")).toBe(false);
  Reflect.deleteProperty(input, "sourceUsage");
  expect(interfaceArcs(input)).toEqual([]);
});

test("version 3 does not count permission gaps as unknown source consumers", () => {
  expect(incompleteInterfaceCount(sourceUsageBaseline())).toBe(0);
});
