import type { AnalysisProgress, ArchitecturalLayerContract } from "./generated/contracts";

type AnalyzeData = ArchitecturalLayerContract["analyze"];

// Live controls stay outside the serializable TypeSpec operation data.
export interface AnalysisControl {
  signal: AbortSignal;
  onProgress(progress: AnalysisProgress): void;
}

export interface ArchitecturalLayer {
  analyze(
    request: Parameters<AnalyzeData>[0],
    control: AnalysisControl,
  ): Promise<ReturnType<AnalyzeData>>;
}
