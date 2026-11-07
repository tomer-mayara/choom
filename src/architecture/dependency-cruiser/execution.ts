import type { AnalysisControl } from "../../domain/architectural-layer.ts";
import type { DepCruiserExecutionOperations } from "./generated/contracts.ts";

type RunData = DepCruiserExecutionOperations["run"];

export interface DepCruiserExecution {
  run(request: Parameters<RunData>[0], control: AnalysisControl): Promise<ReturnType<RunData>>;
}
