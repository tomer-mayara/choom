import { assert, strings, text } from './record-checks.ts';

// The gaps that a stage gives from the records of its tools, so that a gap that a
// tool found does not depend on the review. Each gap gets a stable ID from the ID
// prefix of the stage, the name of the tool record and the position of the gap,
// such as s1-settings-gap-001, and cites its place in the tool record as evidence.
export interface DiscoveryGap { id: string; kind: string; subjectRefs: string[]; reason: string; evidenceRefs: string[] }
// A saved tool record: its name in the gap IDs, its artifact ID and its gaps.
export interface ToolRecord { readonly name: string; readonly artifactRef: string; readonly gaps: readonly unknown[] }
interface RecordGap { kind?: unknown; subjectRefs?: unknown; reason?: unknown }

export class ToolGaps {
  readonly #prefix: string;

  // `prefix` starts each gap ID, such as s1- for Stage 1.
  constructor(prefix: string) {
    this.#prefix = prefix;
  }

  // The ID of gap N (from 0) of the named tool record: the prefix, the name, -gap- and N + 1 in three digits.
  id(name: string, index: number): string {
    return this.#prefix + name + '-gap-' + String(index + 1).padStart(3, '0');
  }

  // The gaps that a tool record lists, each with the kind, subjects and reason of the record.
  fromRecord({ name, artifactRef, gaps }: ToolRecord): DiscoveryGap[] {
    return gaps.map((value, index) => {
      const pointer = artifactRef + '#/gaps/' + index;
      const gap = value as RecordGap | null;
      assert(text(gap?.kind) && strings(gap.subjectRefs) && text(gap.reason), 'Invalid gap in the tool record: ' + pointer);
      return { id: this.id(name, index), kind: gap.kind, subjectRefs: [...gap.subjectRefs], reason: gap.reason,
        evidenceRefs: [pointer] };
    });
  }
}
