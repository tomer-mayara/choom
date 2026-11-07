import type {
  ArchitectureDiagnostic, ArchitectureDocument, DiagnosticReference, ImportVariant,
} from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";

export type ArchitecturePanel =
  | { kind: "analysis" }
  | { kind: "findings" }
  | { kind: "component"; componentId: string };

function importFlags(variant: ImportVariant): string {
  const flag = (value: boolean | undefined) => value === undefined ? "Unknown" : value ? "Yes" : "No";
  return `Type only: ${flag(variant.typeOnly)} · Dynamic: ${flag(variant.dynamic)} · Pre-compilation only: ${flag(variant.preCompilationOnly)}`;
}

function OrderedReferences({ name, references }: { name: string; references: ReadonlyData<DiagnosticReference[]> }) {
  return (
    <div>
      <p className="font-medium">{name}</p>
      <ol aria-label={name} className="list-inside list-decimal space-y-1 break-all text-muted-foreground">
        {references.map((reference, index) => <li key={index}>{reference.kind}: {reference.value}</li>)}
      </ol>
    </div>
  );
}

function FindingDetails({ finding }: { finding: ReadonlyData<ArchitectureDiagnostic> }) {
  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer break-words font-medium">
        <span className="capitalize">{finding.severity}</span>: {finding.message}
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p>Finding: <code>{finding.code}</code>{finding.rule ? <> · Rule: <code>{finding.rule}</code></> : null}</p>
        <ul className="space-y-1 break-all">
          {finding.subjects.map((subject, index) => (
            <li key={index}>{subject.role[0]?.toUpperCase()}{subject.role.slice(1)} {subject.kind}: {subject.value}</li>
          ))}
        </ul>
        {finding.cycle ? <OrderedReferences name="Cycle" references={finding.cycle} /> : null}
        {finding.via ? <OrderedReferences name="Via" references={finding.via} /> : null}
        {finding.metrics ? (
          <dl className="grid gap-1" aria-label="Finding metrics">
            {Object.entries(finding.metrics).map(([name, value]) => (
              <div key={name} className="flex flex-wrap gap-x-2"><dt className="break-all">{name}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        ) : null}
      </div>
    </details>
  );
}

function RecordedAnalysis({ document }: { document: ReadonlyData<ArchitectureDocument> }) {
  return (
    <section aria-labelledby="recorded-analysis-heading" className="space-y-3">
      <h3 id="recorded-analysis-heading" className="sr-only">Recorded analysis</h3>
      <dl className="grid gap-3 text-sm">
        <div><dt className="text-muted-foreground">Analyzer</dt><dd>{document.analysis.enforcer} {document.analysis.version}</dd></div>
        <div><dt className="text-muted-foreground">Generated at</dt><dd><time dateTime={document.analysis.generatedAt}>{document.analysis.generatedAt}</time></dd></div>
        <div><dt className="text-muted-foreground">Configuration</dt><dd className="break-all"><code>{document.analysis.config}</code></dd></div>
        <div><dt className="text-muted-foreground">Source inputs</dt><dd className="break-all">{document.analysis.inputs.join(", ")}</dd></div>
      </dl>
      {document.analysis.scopeNotes.length ? (
        <ul aria-label="Analysis scope" className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          {document.analysis.scopeNotes.map((note, index) => <li key={index}>{note}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function ComponentDetails({ document, componentId }: {
  document: ReadonlyData<ArchitectureDocument>; componentId: string;
}) {
  const component = document.components.find(({ id }) => id === componentId);
  if (!component) return null;
  const children = document.components.filter(({ parent }) => parent === componentId);
  const relationships = document.relationships.filter(({ source, target }) => source === componentId || target === componentId);
  return (
    <div className="space-y-6">
      <section aria-labelledby="declared-components-heading" className="space-y-3">
        <h3 id="declared-components-heading" className="text-lg font-semibold">Declared components</h3>
        <dl className="grid gap-3 break-words text-sm">
          <div><dt className="text-muted-foreground">Component</dt><dd className="font-medium">{component.name}</dd></div>
          <div><dt className="text-muted-foreground">ID</dt><dd className="break-all"><code>{component.id}</code></dd></div>
          <div><dt className="text-muted-foreground">Parent</dt><dd className="break-all"><code>{component.parent ?? "—"}</code></dd></div>
          <div><dt className="text-muted-foreground">Reported files</dt><dd>{component.reportedFiles === 0 ? "No files reported" : `${component.reportedFiles} ${component.reportedFiles === 1 ? "file" : "files"} reported`}</dd></div>
        </dl>
        {children.length ? <div className="space-y-2 text-sm">
          <h4 className="font-medium">Declared children</h4>
          <ul className="space-y-2 break-words">
            {children.map((child) => <li key={child.id}>{child.name} <code className="break-all text-muted-foreground">{child.id}</code></li>)}
          </ul>
        </div> : null}
      </section>

      <section aria-labelledby="imports-heading" className="space-y-3">
        <h3 id="imports-heading" className="text-lg font-semibold">Imports</h3>
        {relationships.length ? relationships.map((relationship) => (
          <details key={relationship.id} className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer break-all font-medium">
              {relationship.source === componentId ? "Imports from" : "Imported by"} <code>{relationship.source === componentId ? relationship.target : relationship.source}</code>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{relationship.source} → {relationship.target} · {relationship.evidence.length} {relationship.evidence.length === 1 ? "file pair" : "file pairs"}</span>
            </summary>
            <ul className="mt-3 space-y-4 text-sm">
              {relationship.evidence.map((pair) => (
                <li key={`${pair.sourceFile}\0${pair.targetFile}`} className="space-y-1">
                  <p className="break-all"><code>{pair.sourceFile}</code> → <code>{pair.targetFile}</code></p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {pair.variants.map((variant, index) => <li key={index}>{importFlags(variant)}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        )) : <p className="text-sm text-muted-foreground">No imports involving this component were reported.</p>}
      </section>
    </div>
  );
}

/** Requested details remain available as text, including findings without arrows. */
export function ArchitectureDetails({ document, panel }: {
  document: ReadonlyData<ArchitectureDocument>; panel: ArchitecturePanel;
}) {
  if (panel.kind === "analysis") return <RecordedAnalysis document={document} />;
  if (panel.kind === "component") return <ComponentDetails document={document} componentId={panel.componentId} />;
  return (
    <section aria-labelledby="findings-heading" className="space-y-3">
      <h3 id="findings-heading" className="sr-only">Findings</h3>
      {document.diagnostics.length ? document.diagnostics.map((finding, index) => <FindingDetails key={index} finding={finding} />)
        : <p className="text-sm text-muted-foreground">No findings were reported.</p>}
    </section>
  );
}
