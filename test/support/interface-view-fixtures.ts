import { baselineExample, fixtureItem, proposed } from "./baseline-fixtures.ts";

export function interfaceViewBaseline(nested = false, longName = false) {
  const baseline = baselineExample();
  baseline.id = nested ? "interface-view-nested" : "interface-view-loops";
  fixtureItem(baseline.interfaces).allowedConsumers = proposed(["checkout", "billing"]);
  if (longName) fixtureItem(baseline.interfaces).name = "Invoice settlement and reconciliation interface for outstanding balances and delayed payments";
  if (nested) {
    baseline.components.unshift({ ...structuredClone(fixtureItem(baseline.components)), id: "commerce", name: "Commerce" });
    fixtureItem(baseline.components, 1).parent = proposed("commerce");
  }
  return baseline;
}
