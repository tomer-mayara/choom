import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";

export interface InterfaceArc {
  id: string;
  interfaceId: string;
  consumerId: string;
  ownerId: string;
}

export function interfaceArcs(baseline: ReadonlyData<Baseline>): InterfaceArc[] {
  if (baseline.formatVersion === 3) return [];
  return baseline.interfaces.flatMap((item) => {
    const ownerId = item.owner.value;
    if (ownerId === null || item.allowedConsumers.value === null) return [];
    return item.allowedConsumers.value.map((consumerId) => ({
      id: JSON.stringify([item.id, consumerId, ownerId]), interfaceId: item.id, consumerId, ownerId,
    }));
  });
}

export function incompleteInterfaceCount(baseline: ReadonlyData<Baseline>): number {
  if (baseline.formatVersion === 3) return 0;
  return baseline.interfaces.filter(({ owner, allowedConsumers }) => owner.value === null || allowedConsumers.value === null).length;
}
