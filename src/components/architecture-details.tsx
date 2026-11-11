import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";

export interface ArchitecturePanel { kind: "component"; componentId: string }

export function ArchitectureDetails({ baseline, panel }: { baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel }) {
  const component = baseline.components.find(({ id }) => id === panel.componentId);
  if (!component) return null;
  return (
    <section className="space-y-4 wrap-anywhere">
      <h2 className="text-lg font-semibold">{component.name}</h2>
      <dl className="space-y-3 text-sm">
        <div><dt className="font-semibold">Component ID</dt><dd><code>{component.id}</code></dd></div>
        <div><dt className="font-semibold">Purpose</dt><dd className="whitespace-pre-wrap">{component.purpose.value}</dd></div>
      </dl>
    </section>
  );
}
