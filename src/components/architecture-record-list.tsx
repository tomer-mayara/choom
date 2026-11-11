import type { BaselineComponent, BaselineInterface, BaselineResource } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { Button } from "./ui/button.tsx";

export function ArchitectureRecordList({ title, items, kind, navigate }: {
  title: string;
  items: readonly ReadonlyData<BaselineComponent | BaselineInterface | BaselineResource>[];
  kind: "component" | "interface" | "resource";
  navigate: (panel: ArchitecturePanel, trigger: HTMLElement) => void;
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
      </li>)}</ul>
    )}
  </section>;
}
