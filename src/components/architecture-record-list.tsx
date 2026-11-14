import type { BaselineComponent, BaselineInterface, BaselineResource } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { Button } from "./ui/button.tsx";

export function ArchitectureRecordList({ title, items, kind, navigate, duplicateCounts }: {
  title: string;
  items: readonly ReadonlyData<BaselineComponent | BaselineInterface | BaselineResource>[];
  kind: "component" | "interface" | "resource";
  navigate: (panel: ArchitecturePanel, trigger: HTMLElement) => void;
  duplicateCounts?: ReadonlyMap<string, number>;
}) {
  return <section role="region" aria-label={title} className="space-y-2">
    <h3 className="text-sm font-semibold">{title} ({items.length})</h3>
    {items.length === 0 ? <p className="text-sm text-muted-foreground">No {kind}s recorded.</p> : (
      <ul className="space-y-2">{items.map((item) => <li key={item.id}>
        <Button variant="outline" className="h-auto w-full flex-col items-start whitespace-normal text-left wrap-anywhere"
          data-record-id={item.id} aria-label={`${item.name}, ${item.id}`}
          onClick={(event) => navigate(kind === "component" ? { kind, componentId: item.id }
            : kind === "interface" ? { kind, interfaceId: item.id } : { kind, resourceId: item.id }, event.currentTarget)}>
          <span>{item.name}</span><code className="text-xs text-muted-foreground">{item.id}</code>
          {"owner" in item && item.owner.value === null ? <span className="text-xs">Owner unknown</span> : null}
        </Button>
        {kind === "interface" && (duplicateCounts?.get(item.id) ?? 0) > 0 ? <Button variant="outline" className="mt-1 h-auto w-full whitespace-normal text-left wrap-anywhere"
          data-record-id={`duplicates-${item.id}`} aria-label={`Duplicates for ${item.name}, ${item.id}`}
          onClick={(event) => navigate({ kind: "duplicates", interfaceId: item.id }, event.currentTarget)}>
          {duplicateCounts?.get(item.id)} possible {duplicateCounts?.get(item.id) === 1 ? "duplicate" : "duplicates"}
        </Button> : null}
      </li>)}</ul>
    )}
  </section>;
}
