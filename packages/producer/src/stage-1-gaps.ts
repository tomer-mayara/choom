import { assert, strings, text } from './record-checks.ts';

// The gaps that a Stage 1 tool record lists, as discovery gaps. Stage 1 finish
// adds them to the review gaps, so a gap that a tool found does not depend on the
// review. Each gap gets a stable ID from the record name and its position, and
// cites its place in the record as evidence.
export interface DiscoveryGap { id: string; kind: string; subjectRefs: string[]; reason: string; evidenceRefs: string[] }
// A saved tool record: its name in the gap IDs, its artifact ID and its gaps.
export interface ToolRecord { name: string; artifactRef: string; gaps: unknown[] }
interface RecordGap { kind?: unknown; subjectRefs?: unknown; reason?: unknown }

export function toolGaps({ name, artifactRef, gaps }: ToolRecord): DiscoveryGap[] {
  return gaps.map((value, index) => {
    const pointer = artifactRef + '#/gaps/' + index;
    const gap = value as RecordGap | null;
    assert(text(gap?.kind) && strings(gap.subjectRefs) && text(gap.reason), 'Invalid gap in the tool record: ' + pointer);
    return { id: 's1-' + name + '-gap-' + String(index + 1).padStart(3, '0'), kind: gap.kind, subjectRefs: [...gap.subjectRefs],
      reason: gap.reason, evidenceRefs: [pointer] };
  });
}
