// Generated from TypeSpec by bun run contracts:generate. Do not edit.

import type * as ChoomDomain from "../../../domain/generated/contracts";

export interface CompletedDepCruiserReport {
  json: string;
  version: string;
  workingDirectory: ".";
  generatedAt: string;
}

export interface DepCruiserConversionOperations {
  convert(input: DepCruiserConversionRequest): DepCruiserConversionOutcome;
}

export type DepCruiserConversionOutcome = ChoomDomain.AnalysisSuccess | ChoomDomain.AnalysisFailure;

export interface DepCruiserConversionRequest {
  request: ChoomDomain.AnalysisRequest;
  completed: CompletedDepCruiserReport;
}
