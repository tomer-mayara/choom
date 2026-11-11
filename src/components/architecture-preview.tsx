import { useEffect, useState } from "react";
import { starterBaseline } from "../domain/starter-baseline.ts";
import { layoutBaseline, type ArchitectureLayout } from "../lib/architecture-layout.ts";
import { ArchitectureDiagram } from "./architecture-diagram.tsx";

export default function ArchitecturePreview() {
  const [layout, setLayout] = useState<ArchitectureLayout | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void layoutBaseline(starterBaseline).then(
      (prepared) => { if (active) setLayout(prepared); },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, []);
  if (error) return <p role="alert">The example baseline could not be laid out.</p>;
  if (!layout) return <p role="status">Laying out the example…</p>;
  return <div className="flex h-full min-h-0 flex-col"><ArchitectureDiagram baseline={starterBaseline} layout={layout} /></div>;
}
