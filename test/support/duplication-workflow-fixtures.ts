import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LoadWorkflow, type LoadWorkflowDependencies, type SelectedBaseline } from "../../src/architecture/load-workflow.ts";

export const duplicationBaselineText = readFileSync(new URL("../fixtures/baseline-viewer/full.yaml", import.meta.url), "utf8");
export const duplicationReportText = readFileSync(new URL("../fixtures/interface-duplication/review.yaml", import.meta.url), "utf8");

export function selectedText(text: string): SelectedBaseline {
  return { read: async () => ({ status: "success", text, sha256: createHash("sha256").update(text).digest("hex"), durationMs: 0 }) };
}

export function duplicationWorkflow(): { workflow: LoadWorkflow; dependencies: LoadWorkflowDependencies } {
  const dependencies: LoadWorkflowDependencies = {
    selectBaseline: async () => selectedText(duplicationBaselineText),
    selectDuplicationReport: async () => selectedText(duplicationReportText),
    layout: async () => ({ nodes: [] }),
  };
  return { workflow: new LoadWorkflow(dependencies), dependencies };
}
