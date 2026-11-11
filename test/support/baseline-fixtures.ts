import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Baseline } from "../../src/domain/generated/contracts.ts";

export function fixtureItem<Items extends readonly unknown[]>(items: Items, index = 0): Items[number] {
  const item = items[index];
  if (item === undefined) throw new Error(`The baseline fixture needs item ${index}.`);
  return item;
}

export function proposed<Value>(value: Value) {
  return { value, status: "proposed" as const, evidenceRefs: ["missing-evidence#/items/0"] };
}

export function accepted<Value>(value: Value) {
  return {
    value, status: "accepted" as const, evidenceRefs: ["missing-evidence#/items/1"],
    acceptanceRef: "missing-review#/decisions/4",
  };
}

export function baselineExample(): Baseline {
  return {
    formatVersion: 1 as const,
    id: "baseline-example",
    parentId: "baseline-previous",
    components: [
      {
        id: "checkout", name: "Checkout", purpose: proposed("Create orders"),
        membership: proposed({ paths: ["checkout/**"], excludePaths: ["checkout/generated/**"] }),
        groupingReason: accepted("Orders change together"),
      },
      {
        id: "billing", name: "Billing", purpose: proposed("Prepare invoices"),
        membership: proposed({ paths: ["billing/invoice.ts"] }),
        groupingReason: proposed("Invoice rules change together"),
      },
    ],
    interfaces: [{
      id: "invoice-api", name: "Invoice API", owner: proposed("billing"),
      publicAccess: proposed(["createInvoice"]), allowedConsumers: accepted(["checkout"]),
      promises: proposed({ behavior: "Create an invoice", data: null, errors: null, lifecycle: null }),
    }],
    resources: [{
      id: "invoice-store", name: "Invoices", identity: proposed("Invoice database"),
      owner: proposed(null), accessRules: proposed(null),
    }],
    rules: [{
      id: "invoice-access", name: "Invoice access", subject: proposed({}),
      expected: proposed({ expression: "Only permitted consumers may use Invoice API" }),
      check: proposed(null),
    }],
  };
}

export function invalidBaseline(problem: string): { input: unknown; path: string } {
  const input = baselineExample();
  const component = fixtureItem(input.components);
  const item = fixtureItem(input.interfaces);
  switch (problem) {
    case "a duplicate item ID":
      item.id = component.id;
      return { input, path: "interfaces.0.id" };
    case "a parent ID that does not exist":
      Object.assign(component, { parent: proposed("missing") });
      return { input, path: "components.0.parent.value" };
    case "an owner ID that does not exist":
      item.owner.value = "missing";
      return { input, path: "interfaces.0.owner.value" };
    case "a consumer ID that does not exist":
      item.allowedConsumers.value = ["missing"];
      return { input, path: "interfaces.0.allowedConsumers.value.0" };
    case "a cycle of component parents":
      Object.assign(component, { parent: proposed("billing") });
      Object.assign(fixtureItem(input.components, 1), { parent: proposed("checkout") });
      return { input, path: "components.0.parent.value" };
    case "an accepted statement without its reference":
      Object.assign(component, { groupingReason: { ...proposed("Orders change together"), status: "accepted" } });
      return { input, path: "components.0.groupingReason.acceptanceRef" };
    case "an unsupported membership selector":
      component.membership.value.paths = ["checkout/*.ts"];
      return { input, path: "components.0.membership.value.paths.0" };
    default:
      throw new Error(`Unknown invalid baseline example: ${problem}`);
  }
}

export function reviewedBaseline(example: "empty" | "full"): unknown {
  return parse(readFileSync(`test/fixtures/baseline-viewer/${example}.yaml`, "utf8"));
}
