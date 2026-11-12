import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { accepted, baselineExample, fixtureItem, proposed } from "./baseline-fixtures.ts";

export function interfaceEndpointBaseline(facts: string): Baseline {
  const baseline = baselineExample();
  const item = fixtureItem(baseline.interfaces);
  switch (facts) {
    case "unknown consumers":
      item.allowedConsumers = accepted(null);
      break;
    case "unknown owner":
      item.owner = proposed(null);
      break;
    case "both unknown":
    case "no components":
      item.owner = proposed(null);
      item.allowedConsumers = accepted(null);
      if (facts === "no components") {
        baseline.components = [];
        baseline.resources = [];
        baseline.rules = [];
      }
      break;
    case "mixed":
      baseline.interfaces.push({ ...structuredClone(item), id: "invoice-events", name: "Invoice events", allowedConsumers: accepted(null) });
      break;
    case "complete":
      break;
    case "no interfaces":
      baseline.interfaces = [];
      break;
    default:
      throw new Error(`Unknown endpoint fixture: ${facts}`);
  }
  return baseline;
}
