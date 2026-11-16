import type { Baseline } from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";

export function componentName(baseline: ReadonlyData<Baseline>, id: string): string {
  const component = baseline.components.find((item) => item.id === id);
  if (!component) return id;
  return baseline.components.some((item) => item.id !== id && item.name === component.name)
    ? `${component.name} (${id})` : component.name;
}
