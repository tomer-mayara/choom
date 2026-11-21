import type { Baseline, DiscoveryGap, DiscoveryQuestion, DiscoveryResult } from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import { SubjectItems } from "@choom/baseline-model/subject-items";

type Question = ReadonlyData<DiscoveryQuestion>;
type Gap = ReadonlyData<DiscoveryGap>;

/** Recorded questions and gaps in their saved order. Gaps of kind `deferred` have their own list. */
export interface DiscoveryRecords {
  readonly questions: readonly Question[];
  readonly gaps: readonly Gap[];
  readonly deferred: readonly Gap[];
}

/** The questions and gaps of one discovery result, placed on the items of its baseline. */
export interface DiscoveryPlacement {
  /** The records that name each item, by the ID of a component, interface, resource or rule. */
  readonly items: ReadonlyMap<string, DiscoveryRecords>;
  /** The records with at least one subject reference that names no item. */
  readonly unplaced: DiscoveryRecords;
  /** The subject references of each unplaced record that name no item, by record ID. */
  readonly unplacedSubjects: ReadonlyMap<string, readonly string[]>;
}

interface MutableRecords { questions: Question[]; gaps: Gap[]; deferred: Gap[] }

const emptyRecords = (): MutableRecords => ({ questions: [], gaps: [], deferred: [] });

/** The number of recorded questions and gaps in the records. */
export function recordCount(records: DiscoveryRecords): number {
  return records.questions.length + records.gaps.length + records.deferred.length;
}

/**
 * Places each recorded question and gap on every item that it names, by the rule
 * of SubjectItems, which the producer uses too. A record with a subject reference
 * that names no item, such as a file or an earlier question, is also in the
 * unplaced records. No record is refused or dropped.
 */
export function placeDiscovery(baseline: ReadonlyData<Baseline>, result: ReadonlyData<DiscoveryResult>): DiscoveryPlacement {
  const subjects = new SubjectItems(baseline);
  const items = new Map<string, MutableRecords>();
  const unplaced = emptyRecords();
  const unplacedSubjects = new Map<string, string[]>();
  function add(records: MutableRecords, record: Question | Gap): void {
    if (!("kind" in record)) records.questions.push(record);
    else if (record.kind === "deferred") records.deferred.push(record);
    else records.gaps.push(record);
  }
  for (const record of [...result.questions, ...result.gaps]) {
    const named = new Set<string>();
    const outside: string[] = [];
    for (const reference of record.subjectRefs) {
      const id = subjects.namedItem(reference);
      if (id === undefined) outside.push(reference);
      else named.add(id);
    }
    for (const id of named) {
      const records = items.get(id) ?? emptyRecords();
      items.set(id, records);
      add(records, record);
    }
    if (outside.length > 0) {
      add(unplaced, record);
      unplacedSubjects.set(record.id, outside);
    }
  }
  return { items, unplaced, unplacedSubjects };
}
