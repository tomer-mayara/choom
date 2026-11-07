import type {
  ArchitectureDiagnostic, ArchitectureDocument, DiagnosticReference, ImportVariant,
} from "../domain/generated/contracts.ts";

function importFlags(variant: ImportVariant): string {
  const flag = (value: boolean | undefined) => value === undefined ? "Unknown" : value ? "Yes" : "No";
  return `Type only: ${flag(variant.typeOnly)} · Dynamic: ${flag(variant.dynamic)} · Pre-compilation only: ${flag(variant.preCompilationOnly)}`;
}

function OrderedReferences({ name, references }: { name: string; references: DiagnosticReference[] }) {
  return (
    <div>
      <p className="font-medium">{name}</p>
      <ol aria-label={name} className="list-inside list-decimal space-y-1 break-all text-muted-foreground">
        {references.map((reference, index) => <li key={index}>{reference.kind}: {reference.value}</li>)}
      </ol>
    </div>
  );
}

function FindingDetails({ finding }: { finding: ArchitectureDiagnostic }) {
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

/** Text remains available independently of the canvas, including findings without arrows. */
export function ArchitectureDetails({ document }: { document: ArchitectureDocument }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="recorded-analysis-heading" className="space-y-3">
        <h3 id="recorded-analysis-heading" className="text-lg font-semibold">Recorded analysis</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
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

      <section aria-labelledby="declared-components-heading" className="space-y-3">
        <h3 id="declared-components-heading" className="text-lg font-semibold">Declared components</h3>
        <div role="region" aria-label="Component table" tabIndex={0} className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <table aria-label="Declared components" className="w-full text-left text-sm">
            <thead className="bg-muted text-muted-foreground"><tr>
              <th scope="col" className="px-4 py-3">Component</th>
              <th scope="col" className="px-4 py-3">ID</th>
              <th scope="col" className="px-4 py-3">Parent</th>
              <th scope="col" className="px-4 py-3">Reported files</th>
            </tr></thead>
            <tbody className="divide-y divide-border bg-card">
              {document.components.map((component) => (
                <tr key={component.id}>
                  <th scope="row" className="px-4 py-3 font-medium">{component.name}</th>
                  <td className="px-4 py-3"><code>{component.id}</code></td>
                  <td className="px-4 py-3"><code>{component.parent ?? "—"}</code></td>
                  <td className="whitespace-nowrap px-4 py-3">{component.reportedFiles === 0 ? "No files reported" : `${component.reportedFiles} ${component.reportedFiles === 1 ? "file" : "files"} reported`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="imports-heading" className="space-y-3">
        <h3 id="imports-heading" className="text-lg font-semibold">Imports</h3>
        {document.relationships.length ? document.relationships.map((relationship) => (
          <details key={relationship.id} className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer break-all font-medium">
              {relationship.source} → {relationship.target}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{relationship.evidence.length} {relationship.evidence.length === 1 ? "file pair" : "file pairs"}</span>
            </summary>
            <ul className="mt-3 space-y-4 text-sm">
              {relationship.evidence.map((pair) => (
                <li key={`${pair.sourceFile}\0${pair.targetFile}`} className="space-y-1 break-all">
                  <p><code>{pair.sourceFile}</code> → <code>{pair.targetFile}</code></p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {pair.variants.map((variant, index) => <li key={index}>{importFlags(variant)}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        )) : <p className="text-sm text-muted-foreground">No imports between declared components were reported.</p>}
      </section>

      <section aria-labelledby="findings-heading" className="space-y-3">
        <h3 id="findings-heading" className="text-lg font-semibold">Findings</h3>
        {document.diagnostics.length ? document.diagnostics.map((finding, index) => <FindingDetails key={index} finding={finding} />)
          : <p className="text-sm text-muted-foreground">No findings were reported.</p>}
      </section>
    </div>
  );
}
