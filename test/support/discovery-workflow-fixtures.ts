import { createHash } from "node:crypto";
import { parse, stringify } from "yaml";
import { LoadWorkflow, type LoadWorkflowDependencies } from "../../src/architecture/load-workflow.ts";
import { discoveryFixture } from "./discovery-fixtures.ts";
import { duplicationBaselineText, duplicationReportText, selectedText } from "./duplication-workflow-fixtures.ts";

type Result = ReturnType<typeof discoveryFixture>["result"];

/** The YAML text of a version 2 discovery result for the baseline file that the workflow fixtures open. */
export function discoveryResultText(change?: (result: Result) => void): string {
  const { id } = parse(duplicationBaselineText) as { id: string };
  const result = { ...discoveryFixture().result, baselineRef: id,
    baselineDigest: createHash("sha256").update(duplicationBaselineText).digest("hex") };
  change?.(result);
  return stringify(result);
}

export function discoveryWorkflow(): { workflow: LoadWorkflow; dependencies: LoadWorkflowDependencies } {
  const dependencies: LoadWorkflowDependencies = {
    selectBaseline: async () => selectedText(duplicationBaselineText),
    selectDuplicationReport: async () => selectedText(duplicationReportText),
    selectDiscoveryResult: async () => selectedText(discoveryResultText()),
    layout: async () => ({ nodes: [] }),
  };
  return { workflow: new LoadWorkflow(dependencies), dependencies };
}
