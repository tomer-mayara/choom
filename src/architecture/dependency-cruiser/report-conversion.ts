import type { DepCruiserConversionOperations } from "./generated/contracts.ts";

type ConvertData = DepCruiserConversionOperations["convert"];

export interface ReportConversion {
  readonly convert: (input: Parameters<ConvertData>[0]) => Promise<ReturnType<ConvertData>>;
}
