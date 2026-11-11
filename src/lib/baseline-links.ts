import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";

/** Internal display links come only from owner and consumer statements. */
export function baselineLinks(baseline: ReadonlyData<Baseline>) {
  const links: Array<{
    id: string; source: string; target: string;
    kind: "provides" | "owns" | "may use";
    status: "accepted" | "proposed";
  }> = [];
  for (const item of baseline.interfaces) {
    if (item.owner.value !== null) links.push({
      id: `relationship-${links.length}`, source: item.owner.value, target: item.id,
      kind: "provides", status: item.owner.status,
    });
    for (const consumer of item.allowedConsumers.value ?? []) links.push({
      id: `relationship-${links.length}`, source: consumer, target: item.id,
      kind: "may use", status: item.allowedConsumers.status,
    });
  }
  for (const item of baseline.resources) {
    if (item.owner.value !== null) links.push({
      id: `relationship-${links.length}`, source: item.owner.value, target: item.id,
      kind: "owns", status: item.owner.status,
    });
  }
  return links;
}
