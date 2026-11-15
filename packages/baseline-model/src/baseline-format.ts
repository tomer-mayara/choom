import type { Baseline, BaselineV3, BaselineV4, BaselineV5 } from "./generated/contracts.ts";
import type { ReadonlyData } from "./readonly-data.ts";

export function supportsSourceUsage(baseline: ReadonlyData<Baseline>): baseline is ReadonlyData<BaselineV3 | BaselineV4 | BaselineV5> {
  return baseline.formatVersion === 3 || baseline.formatVersion === 4 || baseline.formatVersion === 5;
}

export function supportsSystemEntryPoints(baseline: ReadonlyData<Baseline>): baseline is ReadonlyData<BaselineV4 | BaselineV5> {
  return baseline.formatVersion === 4 || baseline.formatVersion === 5;
}

export function supportsSymbolSelectors(baseline: ReadonlyData<Baseline>): baseline is ReadonlyData<BaselineV5> {
  return baseline.formatVersion === 5;
}
