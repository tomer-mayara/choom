import { createContext, useContext, useMemo, useState } from "react";
import type { Baseline, DiscoveryGap, DiscoveryQuestion, DiscoveryResult } from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import { type DiscoveryPlacement, type DiscoveryRecords, placeDiscovery } from "../lib/discovery-placement.ts";

/** The attached discovery result and its placement on the items of the open baseline. */
export interface DiscoveryReading {
  readonly result: ReadonlyData<DiscoveryResult>;
  readonly placement: DiscoveryPlacement;
}

/** A baseline view provides the attached discovery result; null means that none is attached. */
export const DiscoveryContext = createContext<DiscoveryReading | null>(null);

/**
 * The attached result placed on the baseline items, and the counts of the
 * component headers: the records that name a component or one of its fields.
 */
export function useDiscoveryReading(baseline: ReadonlyData<Baseline>, attachment: DiscoveryControls["discovery"]) {
  const result = attachment?.result;
  return useMemo(() => {
    const componentCounts = new Map<string, { questions: number; gaps: number }>();
    if (!result) return { reading: null, componentCounts };
    const placement = placeDiscovery(baseline, result);
    for (const { id } of baseline.components) {
      const records = placement.items.get(id);
      if (records) componentCounts.set(id, { questions: records.questions.length, gaps: records.gaps.length + records.deferred.length });
    }
    return { reading: { result, placement }, componentCounts };
  }, [baseline, result]);
}

/** The props of a baseline view that can attach one discovery result. */
export interface DiscoveryControls {
  discovery?: { readonly result: ReadonlyData<DiscoveryResult> } | null;
  onOpenDiscoveryResult?: () => void;
  onRemoveDiscoveryResult?: () => void;
}

// The question and gap lists keep their history: a later note can answer an
// earlier question, and both records stay. So the words are "recorded", never
// "open" or "unresolved", and no attachment is not "no questions" (CR-004).
export const noDiscoveryResult = "No discovery result attached";
export const notDefects = "These are recorded questions and gaps to review, not defects.";

const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
export const recordedQuestions = (count: number): string => counted(count, "recorded question", "recorded questions");
export const recordedGaps = (count: number): string => counted(count, "recorded gap", "recorded gaps");

type DiscoveryRecord = ReadonlyData<DiscoveryQuestion | DiscoveryGap>;

function References({ name, values }: { name: string; values: readonly string[] }) {
  return <div role="group" aria-label={name} className="space-y-1 text-xs">
    <p className="font-semibold">{name}</p>
    <ul className="list-disc pl-5">{values.map((value, index) => <li key={index}><code className="wrap-anywhere">{value}</code></li>)}</ul>
  </div>;
}

function RecordItem({ record, unplacedSubjects }: { record: DiscoveryRecord; unplacedSubjects?: readonly string[] }) {
  return <li className="space-y-2 rounded-lg border border-border p-3" data-discovery-id={record.id}>
    <p className="whitespace-pre-wrap wrap-anywhere">{"kind" in record ? record.reason : record.text}</p>
    {"kind" in record ? <p className="text-xs">Kind: <code className="wrap-anywhere">{record.kind}</code></p> : null}
    <p className="text-xs text-muted-foreground">ID: <code className="wrap-anywhere">{record.id}</code></p>
    {unplacedSubjects ? <References name="Subjects that name no baseline item" values={unplacedSubjects} />
      : <References name="Subjects" values={record.subjectRefs} />}
    <References name="Evidence references" values={record.evidenceRefs} />
  </li>;
}

function RecordItems({ records, subjects }: { records: readonly DiscoveryRecord[]; subjects?: ReadonlyMap<string, readonly string[]> }) {
  return <ul className="space-y-3">
    {records.map((record) => <RecordItem key={record.id} record={record} unplacedSubjects={subjects?.get(record.id)} />)}
  </ul>;
}

function DeferredGaps({ gaps, subjects }: { gaps: readonly DiscoveryRecord[]; subjects?: ReadonlyMap<string, readonly string[]> }) {
  const [open, setOpen] = useState(true);
  return <details data-section="deferred-gaps" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Deferred gaps ({gaps.length})</summary>
    <div className="pt-2"><RecordItems records={gaps} subjects={subjects} /></div>
  </details>;
}

/** Recorded questions, recorded gaps, and the deferred gaps in their own group that the reader can collapse. */
export function DiscoveryRecordList({ records, subjects }: { records: DiscoveryRecords; subjects?: ReadonlyMap<string, readonly string[]> }) {
  return <div className="space-y-4">
    {records.questions.length > 0 ? <section className="space-y-2">
      <h4 className="font-semibold">Recorded questions ({records.questions.length})</h4>
      <RecordItems records={records.questions} subjects={subjects} />
    </section> : null}
    {records.gaps.length > 0 ? <section className="space-y-2">
      <h4 className="font-semibold">Recorded gaps ({records.gaps.length})</h4>
      <RecordItems records={records.gaps} subjects={subjects} />
    </section> : null}
    {records.deferred.length > 0 ? <DeferredGaps gaps={records.deferred} subjects={subjects} /> : null}
  </div>;
}

/** The recorded questions and gaps that name one item or one of its fields. */
export function ItemDiscovery({ itemId, kind }: { itemId: string; kind: "component" | "interface" | "resource" | "rule" }) {
  const discovery = useContext(DiscoveryContext);
  const records = discovery?.placement.items.get(itemId);
  return <section role="region" aria-label="Recorded questions and gaps" className="space-y-3 text-sm wrap-anywhere">
    <h3 className="font-semibold">Recorded questions and gaps</h3>
    {!discovery ? <p className="text-muted-foreground">{noDiscoveryResult}</p>
      : !records ? <p className="text-muted-foreground">No recorded question or gap names this {kind}.</p> : <>
        <p className="text-muted-foreground">{notDefects} Evidence is not loaded.</p>
        <DiscoveryRecordList records={records} />
      </>}
  </section>;
}
