import type { Baseline, BaselineSystemEntryPoint } from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";

export type SystemEntryCounts = Record<BaselineSystemEntryPoint["kind"], number>;

export function systemEntryCounts(entries: readonly ReadonlyData<BaselineSystemEntryPoint>[]): ReadonlyMap<string, SystemEntryCounts> {
  const counts = new Map<string, SystemEntryCounts>();
  for (const { componentId, kind } of entries) {
    const owner = counts.get(componentId) ?? { startup: 0, external: 0 };
    owner[kind] += 1;
    counts.set(componentId, owner);
  }
  return counts;
}

export function systemEntryReview(baseline: ReadonlyData<Baseline>) {
  const assessment = baseline.formatVersion === 4 ? baseline.systemEntryPoints : undefined;
  if (!assessment) return { assessment, notices: ["Entry points not recorded"] };
  const notices: string[] = [];
  if (assessment.entries.length === 0) notices.push("No entry points found in this scope");
  if (assessment.limitations.length > 0) notices.push("Review has limits");
  return { assessment, notices };
}
