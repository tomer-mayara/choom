import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { sourceUsageBaseline } from "./source-usage-fixtures.ts";

export function systemEntryPointsBaseline() {
  return {
    ...sourceUsageBaseline(), formatVersion: 4 as const,
    systemEntryPoints: {
      snapshotRef: "snapshot-invoice", mappingRef: "selected-code-mapping",
      scope: "Reviewed the CLI start and the invoice call boundary.",
      evidenceRefs: ["reviewed-entry-scope"], limitations: [] as string[],
      entries: [{
        id: "checkout-cli", kind: "startup" as const, label: "CLI checkout",
        path: "checkout/order.ts", componentId: "checkout", evidenceRefs: ["reviewed-cli-start"],
      }, {
        id: "invoice-http", kind: "external" as const, label: "HTTP POST /invoices",
        path: "billing/invoice.ts", componentId: "billing", evidenceRefs: ["reviewed-invoice-route"],
        source: {
          evidenceRef: "reviewed-invoice-route",
          location: { snapshotRef: "snapshot-invoice", path: "billing/invoice.ts", sha256: "a".repeat(64), lines: [1, 12] },
        },
        interfaceId: "invoice-api", entryId: "create-invoice",
      }],
    },
  };
}

export function invalidSystemEntryPoints(problem: string) {
  const input = systemEntryPointsBaseline();
  const first = input.systemEntryPoints.entries[0];
  const second = input.systemEntryPoints.entries[1];
  if (!first || !second || !second.source) throw new Error("Entry-point fixture is incomplete.");
  let path = "systemEntryPoints";
  switch (problem) {
    case "an unknown component": first.componentId = "missing"; path = "systemEntryPoints.entries.0.componentId"; break;
    case "a source path different from its entry path":
      second.source.location.path = "other/invoice.ts";
      path = "systemEntryPoints.entries.1.source.location.path";
      break;
    case "a mapping ref different from source use": input.systemEntryPoints.mappingRef = "other-mapping"; path = "systemEntryPoints.mappingRef"; break;
    case "more than 2,000 entries":
      input.systemEntryPoints.entries = Array.from({ length: 2001 }, (_, index) => ({
        ...structuredClone(first), id: `start-${index}`,
      }));
      path = "systemEntryPoints.entries";
      break;
    default: throw new Error(`Unknown entry-point defect: ${problem}`);
  }
  return { input, path };
}

export function systemEntryPointsAtBudget(bytes: number) {
  const input = systemEntryPointsBaseline();
  const first = input.systemEntryPoints.entries[0];
  if (!first) throw new Error("Entry-point fixture is incomplete.");
  input.systemEntryPoints.entries = Array.from({ length: 300 }, (_, index) => ({
    ...structuredClone(first), id: `start-${index}`, label: "x",
  }));
  let remaining = bytes - new TextEncoder().encode(JSON.stringify(input.systemEntryPoints)).byteLength;
  for (const entry of input.systemEntryPoints.entries) {
    const addition = Math.min(Math.max(remaining, 0), 8 * 1024 - 1);
    entry.label += "x".repeat(addition);
    remaining -= addition;
  }
  if (remaining !== 0) throw new Error("The requested system-entry budget is outside the fixture range.");
  return input;
}

export function markedSystemEntryPointsBaseline(externalCount = 3) {
  const input = systemEntryPointsBaseline();
  const [checkout, billing] = input.components;
  const external = fixtureItem(input.systemEntryPoints.entries, 1);
  if (!checkout || !billing) throw new Error("The system entry fixture needs Checkout and Billing.");
  input.components = [{ ...checkout, id: "commerce", name: "Commerce", membership: proposed({ paths: ["commerce/**"] }) },
    checkout, { ...billing, parent: proposed("commerce") }];
  input.systemEntryPoints.entries = [fixtureItem(input.systemEntryPoints.entries),
    ...Array.from({ length: externalCount }, (_, index) => ({
      ...external, id: `invoice-http-${index + 1}`, label: `HTTP POST /invoices/${index + 1}`,
    }))];
  return input;
}

export const systemEntryReviewLimit = "Scheduled callbacks were outside this review.";
