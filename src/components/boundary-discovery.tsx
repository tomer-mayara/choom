import { useContext, useMemo } from "react";
import { DiscoveryContext, ItemDiscovery } from "./discovery-records.tsx";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inspectedWalkthroughs(value: unknown, componentId: string) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record: unknown) => {
    if (!object(record) || !Array.isArray(record.componentIds) || !record.componentIds.includes(componentId)
      || typeof record.description !== "string" || !Array.isArray(record.steps)) return [];
    return [{ description: record.description, steps: record.steps.flatMap((step: unknown) =>
      object(step) && typeof step.action === "string" ? [step.action] : []) }];
  });
}

/** Historical questions and the notes linked to them remain available in the opted-in evidence. */
export function BoundaryDiscovery({ componentId }: { componentId: string }) {
  const attached = useContext(DiscoveryContext);
  const evidence = useMemo(() => {
    if (!attached) return null;
    const { result, placement } = attached;
    const own = placement.items.get(componentId);
    const subjects = new Set([...(own?.questions ?? []), ...(own?.gaps ?? []), ...(own?.deferred ?? [])].map(({ id }) => id));
    const linked = [...result.questions, ...result.gaps].filter((note) => note.subjectRefs.some((ref) => subjects.has(ref)));
    return { paths: inspectedWalkthroughs(result.inspectedPaths, componentId), linked };
  }, [attached, componentId]);
  return <>
    <ItemDiscovery itemId={componentId} kind="component" />
    {evidence?.paths.map((path, index) => <section key={index} aria-label="Walkthrough" className="space-y-2"><h4>Walkthrough</h4>
      <p>{path.description}</p><ol className="ml-4 list-decimal">{path.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
    </section>)}
    {evidence && evidence.linked.length > 0 && <section aria-label="Linked answers"><h4>Linked answers</h4>
      <ul>{evidence.linked.map((note) => <li key={note.id}>{note.id} · {"text" in note ? note.text : note.reason}
        <p>Answers · {note.subjectRefs.join(", ")}</p><p>Evidence · {note.evidenceRefs.join(", ")}</p>
      </li>)}</ul>
    </section>}
  </>;
}
