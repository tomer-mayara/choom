import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from "@xyflow/react";
import { ArchitectureDiagram } from "../../src/components/architecture-diagram.tsx";
import type { Baseline } from "../../src/domain/generated/contracts.ts";
import type { ArchitectureLayout } from "../../src/lib/architecture-layout.ts";

function CaptureViewport({ capture }: { capture: (viewport: ReactFlowInstance) => void }) {
  const viewport = useReactFlow();
  useEffect(() => capture(viewport), [capture, viewport]);
  return null;
}

export async function renderDiagramWithViewport(baseline: Baseline, layout: ArchitectureLayout): Promise<ReactFlowInstance> {
  let viewport: ReactFlowInstance | undefined;
  const capture = (instance: ReactFlowInstance) => { viewport = instance; };
  render(<ReactFlowProvider initialWidth={500} initialHeight={500}>
    <ArchitectureDiagram baseline={baseline} layout={layout} />
    <CaptureViewport capture={capture} />
  </ReactFlowProvider>);
  return waitFor(() => {
    if (!viewport?.viewportInitialized) throw new Error("The diagram viewport must be available.");
    return viewport;
  });
}
