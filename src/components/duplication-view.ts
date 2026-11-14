import type { Baseline, DuplicationEndpointReference, DuplicationFinding, DuplicationReport, DuplicationStatus } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";

interface DuplicationAttachment {
  report: ReadonlyData<DuplicationReport>;
  session: number;
}

export interface DuplicationControls {
  duplication?: DuplicationAttachment | null;
  onOpenDuplicationReport?: () => void;
  onRemoveDuplicationReport?: () => void;
  reportBusy?: boolean;
}

export const duplicationStatusLabels: Record<DuplicationStatus, string> = {
  "needs-review": "Needs review",
  "potential-redundancy": "Potential redundancy",
  "justified-distinction": "Justified distinction",
  "insufficient-evidence": "Insufficient evidence",
};

export function duplicationCounts(baseline: ReadonlyData<Baseline>, report?: ReadonlyData<DuplicationReport>) {
  const interfaces = new Map<string, number>();
  const components = new Map<string, number>();
  const owners = new Map(baseline.interfaces.map((item) => [item.id, item.owner.value]));
  for (const finding of report?.findings ?? []) {
    if (finding.status === "justified-distinction") continue;
    const ids = new Set(finding.endpoints.map(({ interfaceId }) => interfaceId));
    const componentIds = new Set<string>();
    for (const id of ids) {
      interfaces.set(id, (interfaces.get(id) ?? 0) + 1);
      const owner = owners.get(id);
      if (owner) componentIds.add(owner);
    }
    for (const id of componentIds) components.set(id, (components.get(id) ?? 0) + 1);
  }
  return { interfaces, components };
}

export function duplicationEndpointName(baseline: ReadonlyData<Baseline>, endpoint: ReadonlyData<DuplicationEndpointReference>): string {
  const item = baseline.interfaces.find(({ id }) => id === endpoint.interfaceId);
  const entry = baseline.formatVersion === 2 ? baseline.interfaces.find(({ id }) => id === endpoint.interfaceId)
    ?.documentation?.entries.find(({ id }) => id === endpoint.entryId) : undefined;
  return `${item?.name ?? endpoint.interfaceId}${entry ? ` / ${entry.name}` : ""}`;
}

export function findingsForRecord(baseline: ReadonlyData<Baseline>, findings: readonly ReadonlyData<DuplicationFinding>[], filter: {
  componentId?: string; interfaceId?: string;
}) {
  const owned = new Set(baseline.interfaces.filter(({ owner }) => owner.value === filter.componentId).map(({ id }) => id));
  return findings.filter((finding) => finding.endpoints.some(({ interfaceId }) => filter.interfaceId ? interfaceId === filter.interfaceId
    : filter.componentId ? owned.has(interfaceId) : true));
}
