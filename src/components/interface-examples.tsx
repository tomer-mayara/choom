import type { BaselineDocumentedEntry, BaselineDocumentationExample } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { RecordedStatus } from "./interface-overview.tsx";
import { Button } from "./ui/button.tsx";

function SampleText({ name, text }: { name: string; text: string }) {
  return <div role="group" aria-label={name} className="space-y-2">
    <p className="font-semibold">{name}</p>
    <pre className="select-text rounded-lg border border-border bg-muted p-3 whitespace-pre-wrap wrap-anywhere text-xs">{text}</pre>
  </div>;
}

export function InterfaceExamples({ entry, example, selectExample, resultOpen, setResultOpen, showEntryId, onCopy, copyFeedback }: {
  entry?: ReadonlyData<BaselineDocumentedEntry>; example?: ReadonlyData<BaselineDocumentationExample>;
  selectExample: (id: string) => void; resultOpen: boolean; setResultOpen: (open: boolean) => void; showEntryId: boolean;
  onCopy: () => void; copyFeedback: string;
}) {
  if (!entry) return <p className="text-sm">No examples recorded.</p>;
  return <section className="space-y-4 text-sm">
    <div><p className="text-xs text-muted-foreground">Selected entry</p><h3 className="font-semibold">{entry.name}</h3>
      {showEntryId ? <code className="text-xs text-muted-foreground">{entry.id}</code> : null}</div>
    {!example ? <p>No example recorded for this entry.</p> : <>
      <div role="group" aria-label="Saved examples" className="flex flex-col gap-2">
        {entry.examples.map((candidate) => <Button key={candidate.id} variant="outline" aria-label={`${candidate.name}, ${candidate.id}`}
          aria-pressed={example.id === candidate.id} onClick={() => selectExample(candidate.id)}
          className="h-auto justify-start whitespace-normal text-left wrap-anywhere aria-pressed:border-primary aria-pressed:bg-muted">
          <span>{candidate.name}{entry.examples.some((other) => other.id !== candidate.id && other.name === candidate.name)
            ? <code className="block text-xs text-muted-foreground">{candidate.id}</code> : null}</span>
        </Button>)}
      </div>
      <div className="space-y-1">
        <h4 className="font-semibold">{example.name}</h4>
        <p>{example.basis === "source-reviewed" ? "Source-reviewed (recorded)" : "Illustrative example"}</p>
        <RecordedStatus status={example.content.status} />
        <p className="text-xs text-muted-foreground">Choom has not run this example.</p>
      </div>
      <SampleText name="Example" text={example.content.value.text} />
      <Button variant="outline" onClick={onCopy}>Copy example</Button>
      <p role="status" className="text-xs text-muted-foreground">{copyFeedback}</p>
      {example.content.value.input === undefined ? <p className="text-muted-foreground">No input recorded for this example.</p>
        : <SampleText name="Example input" text={example.content.value.input} />}
      {example.content.value.result === undefined ? <p className="text-muted-foreground">No result recorded for this example.</p>
        : <section aria-label="Example outcome" className="space-y-2">
          <h4 className="font-semibold">Example outcome</h4>
          <p className="whitespace-pre-wrap">{example.content.value.result.summary}</p>
          <details data-section="example-result" open={resultOpen} onToggle={(event) => setResultOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Detailed result</summary>
            {resultOpen ? <div className="space-y-2 pt-2">
              <SampleText name={example.content.value.result.scope === "excerpt" ? "Result excerpt" : "Complete recorded result"} text={example.content.value.result.text} />
            </div> : null}
          </details>
        </section>}
    </>}
  </section>;
}
