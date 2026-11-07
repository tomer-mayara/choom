import { z } from "zod";
import type { AnalysisControl, ArchitecturalLayer } from "../../domain/architectural-layer.ts";
import type { AnalysisOutcome, AnalysisProgress, AnalysisRequest, AnalysisStage } from "../../domain/generated/contracts.ts";
import { ComponentCatalog } from "../../domain/component-catalog.ts";
import { directoryPathSchema, filePathSchema } from "../../domain/architecture-paths.ts";
import type { DepCruiserExecution } from "./execution.ts";
import type { ReportConversion } from "./report-conversion.ts";
import { boundedText } from "./report.ts";

const requestSchema = z.strictObject({
  repositorySession: boundedText(128),
  components: ComponentCatalog.declarationsSchema.refine((items) => items.length <= 256 && items.every((item) =>
    boundedText(4096).safeParse(item.id).success && boundedText(1024).safeParse(item.name).success && item.name.trim().length > 0)),
  analysis: z.strictObject({ enforcer: boundedText(128), config: filePathSchema.pipe(boundedText(4096)), inputs: z.array(directoryPathSchema.pipe(boundedText(4096))).min(1).max(128) }),
}) satisfies z.ZodType<AnalysisRequest>;

/** Coordinates the matching execution and report-conversion collaborators. */
export class DepCruiserArchitecturalLayer implements ArchitecturalLayer {
  private readonly execution: DepCruiserExecution;
  private readonly conversion: ReportConversion;

  constructor(execution: DepCruiserExecution, conversion: ReportConversion) {
    this.execution = execution;
    this.conversion = conversion;
  }

  async analyze(request: AnalysisRequest, control: AnalysisControl): Promise<AnalysisOutcome> {
    if (control.signal.aborted) return { status: "cancelled" };
    const input = requestSchema.safeParse(request);
    if (!input.success) return { status: "failure", stage: "setup", code: "invalid-request", message: "Analysis needs valid component declarations and an analyzer descriptor." };
    if (input.data.analysis.enforcer !== "dependency-cruiser") return { status: "failure", stage: "setup", code: "unsupported", message: "This architectural layer supports dependency-cruiser." };
    const startedAt = performance.now();
    let elapsed = 0;
    const progress = (event: AnalysisProgress) => {
      elapsed = Math.max(elapsed, event.elapsedMs ?? 0, performance.now() - startedAt);
      try { control.onProgress({ stage: event.stage, elapsedMs: elapsed }); } catch { /* A caller's observer must not interrupt resource cleanup. */ }
    };
    let stage: AnalysisStage = "analysis";
    try {
      const completed = await this.execution.run({ repositorySession: input.data.repositorySession, config: input.data.analysis.config, inputs: input.data.analysis.inputs }, { signal: control.signal, onProgress: progress });
      if (completed.status === "failure") return completed.stage !== "cleanup" && control.signal.aborted ? { status: "cancelled" } : completed;
      if (completed.status === "cancelled" || control.signal.aborted) return { status: "cancelled" };
      stage = "conversion";
      progress({ stage });
      if (control.signal.aborted) return { status: "cancelled" };
      const outcome = await this.conversion.convert({ request: input.data, completed: completed.report });
      if (control.signal.aborted) return { status: "cancelled" };
      if (outcome.status === "success") progress({ stage: "validation" });
      return control.signal.aborted ? { status: "cancelled" } : outcome;
    } catch {
      if (control.signal.aborted) return { status: "cancelled" };
      return { status: "failure", stage, code: stage === "conversion" ? "invalid-observations" : "execution-failed", message: "The architecture analysis could not be completed." };
    }
  }
}
