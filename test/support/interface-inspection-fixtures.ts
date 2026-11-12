import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { interfaceArcBaseline } from "./interface-arc-fixtures.ts";

export function interfaceInspectionBaseline(example?: "long list" | "long label") {
  const baseline = interfaceArcBaseline("two consumers");
  baseline.id = "interface-inspection";
  baseline.interfaces.push({ ...structuredClone(fixtureItem(baseline.interfaces)),
    id: "order-api", name: "Order API", owner: proposed("checkout"), allowedConsumers: proposed(["billing"]),
  });
  if (example === "long list") {
    const item = fixtureItem(baseline.interfaces);
    baseline.interfaces.unshift(...Array.from({ length: 18 }, (_, index) => ({ ...structuredClone(item),
      id: `billing-api-${index}`, name: `Billing API ${index}`, allowedConsumers: proposed(null),
    })));
  }
  if (example === "long label") fixtureItem(baseline.interfaces).name = `Invoice ${"interface contract ".repeat(40)}`.trim();
  return baseline;
}
