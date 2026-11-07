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

export interface DepCruiserExecutionCompleted {
  status: "completed";
  report: CompletedDepCruiserReport;
  durationMs: number;
}

export interface DepCruiserExecutionOperations {
  run(request: DepCruiserExecutionRequest): DepCruiserRunOutcome;
}

export interface DepCruiserExecutionRequest {
  repositorySession: string;
  config: string;
  inputs: Array<string>;
}

export type DepCruiserRunOutcome = DepCruiserExecutionCompleted | ChoomDomain.AnalysisFailure | ChoomDomain.AnalysisCancelled;
