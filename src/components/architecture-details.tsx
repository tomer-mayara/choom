import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";

export type ArchitecturePanel = { kind: "component"; componentId: string }
  | { kind: "interface"; interfaceId: string }
  | { kind: "resource"; resourceId: string };

export function ArchitectureDetails({ baseline, panel }: { baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel }) {
  const item = panel.kind === "component" ? baseline.components.find(({ id }) => id === panel.componentId)
    : panel.kind === "interface" ? baseline.interfaces.find(({ id }) => id === panel.interfaceId)
      : baseline.resources.find(({ id }) => id === panel.resourceId);
  if (!item) return null;
  const kind = panel.kind === "component" ? "Component" : panel.kind === "interface" ? "Interface" : "Resource";
  return (
    <section className="space-y-4 wrap-anywhere">
      <h2 className="text-lg font-semibold">{item.name}</h2>
      <dl className="space-y-3 text-sm">
        <div><dt className="font-semibold">{kind} ID</dt><dd><code>{item.id}</code></dd></div>
        {"purpose" in item ? <div><dt className="font-semibold">Purpose</dt><dd className="whitespace-pre-wrap">{item.purpose.value}</dd></div> : null}
      </dl>
    </section>
  );
}
