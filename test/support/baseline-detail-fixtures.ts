import type { Baseline } from "../../src/domain/generated/contracts.ts";
import { accepted, fixtureItem, proposed } from "./baseline-fixtures.ts";

export const recordedEvidenceRef = "https://baseline.invalid/evidence.yaml#/items/7";
export const recordedAcceptanceRef = "javascript:alert('A reference is data')";
export const recordedMarkup = '<img src="https://baseline.invalid/image" onerror="alert(\'Recorded text is data\')">';
export const finalPolicyLine = "End of the recorded access rules.";

export function longAccessRules(): string {
  return [
    ...Array.from({ length: 160 }, (_, index) => `Policy ${index}: only the owner may change this ledger.`),
    `Recorded token: ${"ledger".repeat(160)}`,
    finalPolicyLine,
  ].join("\n");
}

/** Use every field while keeping evidence and checks unavailable to the viewer. */
export function baselineDetailsExample(): Baseline {
  return {
    formatVersion: 1,
    id: "baseline-details",
    parentId: "baseline-before-details",
    components: [
      {
        id: "order-system", name: "Order system",
        purpose: proposed("Manage orders.\nKeep each decision traceable."),
        membership: accepted({ paths: ["orders/**", "shared/types.ts"], excludePaths: ["orders/generated/**"] }),
        groupingReason: proposed("Orders share one release boundary."),
      },
      {
        id: "order-service", name: "Order service",
        purpose: accepted("Submit an order after approval."),
        membership: proposed({ paths: ["orders/service.ts"], excludePaths: [] }),
        groupingReason: proposed("Approval rules change together."),
        parent: accepted("order-system"),
      },
    ],
    interfaces: [{
      id: "order-api", name: "Order API", owner: accepted("order-service"),
      publicAccess: proposed(["submitOrder", "readOrder"]), allowedConsumers: accepted(["order-system"]),
      promises: proposed({
        behavior: "Submit one approved order.", data: "Return the recorded order ID.",
        errors: "Reject an expired approval.", lifecycle: "Keep an order until retention ends.",
      }),
    }],
    resources: [{
      id: "order-ledger", name: "Order ledger", identity: accepted(recordedMarkup),
      owner: proposed("order-service"), accessRules: proposed(longAccessRules()),
    }],
    rules: [{
      id: "approved-consumers", name: "Only approved consumers", subject: proposed({}),
      expected: {
        ...accepted({
          relation: { consumers: ["order-system"], limit: 0, required: false, unknown: null },
          ["__proto__"]: { note: "Recorded own key" },
          empty: [],
        }),
        evidenceRefs: [recordedEvidenceRef, "missing-evidence#/items/7"],
        acceptanceRef: recordedAcceptanceRef,
      },
      check: proposed({
        expression: "throw new Error('A recorded check is data')",
        command: "echo recorded-command", source: "file:///unavailable-check.ts",
      }),
    }],
  };
}

export function baselineWithUnknownDetails(): Baseline {
  const baseline = baselineDetailsExample();
  baseline.id = "baseline-unknown-details";
  baseline.parentId = null;
  const component = fixtureItem(baseline.components);
  component.parent = proposed(null);
  component.membership = proposed({ paths: ["orders/**"] });
  const item = fixtureItem(baseline.interfaces);
  item.owner = proposed(null);
  item.publicAccess = proposed(null);
  item.allowedConsumers = proposed(null);
  item.promises = proposed(null);
  const resource = fixtureItem(baseline.resources);
  resource.identity = proposed(null);
  resource.owner = proposed(null);
  resource.accessRules = proposed(null);
  const rule = fixtureItem(baseline.rules);
  rule.expected = proposed(null);
  rule.check = proposed(null);
  return baseline;
}

export function baselineWithOnlyRules(): Baseline {
  const baseline = baselineDetailsExample();
  baseline.id = "baseline-only-rules";
  baseline.components = [];
  baseline.interfaces = [];
  baseline.resources = [];
  return baseline;
}
