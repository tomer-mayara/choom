import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { accepted, baselineExample, fixtureItem, proposed } from "./baseline-fixtures.ts";

export function interfaceArcBaseline(example: string): Baseline {
  const baseline = baselineExample();
  baseline.id = `interface-arcs-${example.replaceAll(" ", "-")}`;
  const item = fixtureItem(baseline.interfaces);
  switch (example) {
    case "two consumers":
      baseline.components.push({ ...structuredClone(fixtureItem(baseline.components)), id: "reporting", name: "Reporting" });
      item.allowedConsumers = accepted(["checkout", "reporting"]);
      break;
    case "parallel":
      baseline.interfaces.push({ ...structuredClone(item), id: "invoice-events" });
      break;
    case "opposite":
      baseline.interfaces.push({ ...structuredClone(item), id: "order-api", name: "Order API",
        owner: proposed("checkout"), allowedConsumers: accepted(["billing"]) });
      break;
    case "self":
      item.allowedConsumers = accepted(["billing"]);
      break;
    case "self beside neighbor":
      baseline.components.push({ ...structuredClone(fixtureItem(baseline.components)), id: "reporting", name: "Reporting" });
      item.owner = proposed("checkout");
      item.allowedConsumers = accepted(["checkout"]);
      break;
    case "nested":
      fixtureItem(baseline.components, 1).parent = proposed("checkout");
      break;
    case "nested group arcs":
      fixtureItem(baseline.components, 1).parent = proposed("checkout");
      baseline.interfaces.push({ ...structuredClone(item), id: "checkout-api", name: "Checkout API",
        owner: proposed("checkout"), allowedConsumers: accepted(["billing", "checkout"]) });
      break;
    case "long name":
      item.name = `Invoice ${"interface contract ".repeat(40)}`.trim();
      break;
    default:
      throw new Error(`Unknown interface arc example: ${example}`);
  }
  return baseline;
}
