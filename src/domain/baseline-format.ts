import type { Baseline, BaselineV3, BaselineV4 } from "./generated/contracts.ts";
import type { ReadonlyData } from "./readonly-data.ts";

export function supportsSourceUsage(baseline: ReadonlyData<Baseline>): baseline is ReadonlyData<BaselineV3 | BaselineV4> {
  return baseline.formatVersion === 3 || baseline.formatVersion === 4;
}
