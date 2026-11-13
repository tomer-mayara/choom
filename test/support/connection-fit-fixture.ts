import { baselineExample, fixtureItem } from "./baseline-fixtures.ts";

export function connectionFitBaseline() {
  const baseline = baselineExample();
  baseline.id = "connection-fit";
  fixtureItem(baseline.interfaces).name = "Invoice settlement and reconciliation interface for outstanding balances and delayed payments";
  return baseline;
}

export const connectionFitLayout = { nodes: [
  { id: "checkout", position: { x: 15, y: 15 }, width: 240, height: 88 },
  { id: "billing", position: { x: 15, y: 143 }, width: 240, height: 88 },
] };
