import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { accepted, baselineExample, fixtureItem, proposed } from "./baseline-fixtures.ts";

export function baselineWithUnknownInterfaceOwner(): Baseline {
  const baseline = baselineExample();
  baseline.id = "unknown-interface-owner";
  baseline.resources = [];
  fixtureItem(baseline.interfaces).owner = proposed(null);
  return baseline;
}

export function baselineWithoutComponents(): Baseline {
  const baseline = baselineWithUnknownInterfaceOwner();
  baseline.id = "records-without-components";
  baseline.components = [];
  fixtureItem(baseline.interfaces).allowedConsumers = proposed(null);
  baseline.resources = baselineExample().resources;
  baseline.rules = [];
  return baseline;
}

export function baselineWithDistinctInterfaceLinks(): Baseline {
  const baseline = baselineExample();
  baseline.id = "distinct-interface-links";
  baseline.resources = [];
  fixtureItem(baseline.components, 1).parent = proposed("checkout");
  const first = fixtureItem(baseline.interfaces);
  first.allowedConsumers = accepted(["checkout", "billing"]);
  const second = structuredClone(first);
  second.id = "invoice-events";
  second.owner = accepted("billing");
  second.allowedConsumers = proposed(["checkout", "billing"]);
  baseline.interfaces.push(second);
  return baseline;
}

export function baselineWithLongNames(): Baseline {
  const baseline = baselineExample();
  baseline.id = "long-record-names";
  fixtureItem(baseline.components).name = `Checkout ${"x".repeat(10_000)}`;
  fixtureItem(baseline.interfaces).name = `Invoice API ${"y".repeat(10_000)}`;
  fixtureItem(baseline.interfaces).id = `invoice-api-${"z".repeat(10_000)}`;
  return baseline;
}
