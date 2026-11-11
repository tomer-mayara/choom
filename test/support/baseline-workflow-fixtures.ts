import { stringify } from "yaml";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import type { LoadWorkflowDependencies, SelectedBaseline } from "../../src/architecture/load-workflow.ts";
import { baselineExample } from "./baseline-fixtures.ts";

export function pending<Value>() {
  let resolve: (value: Value) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<Value>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

export function selectedBaseline(baseline: Baseline = baselineExample()): SelectedBaseline {
  return { read: async () => ({ status: "success", text: stringify(baseline), durationMs: 0 }) };
}

export function baselineWorkflowDependencies(): LoadWorkflowDependencies {
  return {
    selectBaseline: async () => selectedBaseline(),
    layout: async (baseline) => ({ nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 300, y: 0 }, width: 240, height: 120 })) }),
  };
}
