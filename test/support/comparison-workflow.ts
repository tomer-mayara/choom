import { LoadWorkflow } from "../../src/architecture/load-workflow.ts";
import { baselineWorkflowDependencies, selectedBaselineText } from "./baseline-workflow-fixtures.ts";
import { boundaryBytes } from "./boundary-baseline.ts";

export function comparisonWorkflow() {
  const dependencies = baselineWorkflowDependencies();
  dependencies.selectBaseline = async () => selectedBaselineText(boundaryBytes("after"));
  dependencies.selectEarlierBaseline = async () => selectedBaselineText(boundaryBytes("before"));
  return { workflow: new LoadWorkflow(dependencies), dependencies };
}
