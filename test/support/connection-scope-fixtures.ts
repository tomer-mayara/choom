import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { interfaceInspectionBaseline } from "./interface-inspection-fixtures.ts";

export function connectionScopeBaseline() {
  const baseline = interfaceInspectionBaseline();
  baseline.id = "connection-scope";
  baseline.components.push({ ...structuredClone(fixtureItem(baseline.components)), id: "identity", name: "Identity" });
  const reverse = fixtureItem(baseline.interfaces, 1);
  reverse.id = "checkout-status";
  reverse.name = "Checkout status";
  baseline.interfaces.push({ ...structuredClone(fixtureItem(baseline.interfaces)), id: "identity-api", name: "Identity API",
    owner: proposed("identity"), allowedConsumers: proposed(["reporting"]),
  });
  fixtureItem(baseline.resources).owner = proposed("billing");
  return baseline;
}

export function selfConnectionBaseline() {
  const baseline = connectionScopeBaseline();
  baseline.id = "self-connections";
  const invoice = fixtureItem(baseline.interfaces);
  invoice.allowedConsumers = proposed(["checkout", "reporting", "billing"]);
  baseline.interfaces.push({ ...structuredClone(invoice), id: "health", name: "Health",
    allowedConsumers: proposed(["billing"]),
  });
  return baseline;
}
