import type { BaselineSourceLocation } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";

export function InterfaceSourceLocation({ location }: { location?: ReadonlyData<BaselineSourceLocation> }) {
  if (!location) return <p className="text-muted-foreground">Location not recorded.</p>;
  return <div className="space-y-1 text-xs wrap-anywhere">
    <code className="block">{location.path}</code>
    <p>Lines {location.lines[0]}–{location.lines[1]}</p>
    <p className="font-semibold">Snapshot</p><code className="block">{location.snapshotRef}</code>
    <p className="font-semibold">SHA-256</p><code className="block">{location.sha256}</code>
  </div>;
}
