import type { ArchitecturalLayer } from "../domain/architectural-layer.ts";
import { DesktopAnalyzerAccess } from "../platform/analyzer.ts";
import type { PrepareDepCruiserRequest } from "../platform/generated/contracts.ts";
import { DesktopRepositoryAccess } from "../platform/repository.ts";
import { DepCruiserArchitecturalLayer } from "./dependency-cruiser/architectural-layer.ts";
import { DepCruiserReportConverter } from "./dependency-cruiser/converter.ts";
import { DesktopDepCruiserRunner } from "./dependency-cruiser/runner.ts";

export function createArchitecturalLayer(options: Pick<PrepareDepCruiserRequest, "nodeExecutable"> = {}): ArchitecturalLayer {
  return new DepCruiserArchitecturalLayer(
    new DesktopDepCruiserRunner(new DesktopAnalyzerAccess(), options),
    new DepCruiserReportConverter(new DesktopRepositoryAccess()),
  );
}
