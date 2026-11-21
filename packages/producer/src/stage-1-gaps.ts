import { isDeepStrictEqual as same } from 'node:util';
import { assert, strings, text } from './record-checks.ts';

// The gaps that a Stage 1 tool record lists, as discovery gaps. Stage 1 finish
// adds them to the review gaps, so a gap that a tool found does not depend on the
// review. Each gap gets a stable ID from the record name and its position, and
// cites its place in the record as evidence.
export interface DiscoveryGap { id: string; kind: string; subjectRefs: string[]; reason: string; evidenceRefs: string[] }
// A Stage 1 tool record: its name in the gap IDs and its artifact ID.
export interface ToolRecordName { readonly name: string; readonly artifactRef: string }
// A saved tool record: its name in the gap IDs, its artifact ID and its gaps.
export interface ToolRecord extends ToolRecordName { gaps: unknown[] }
interface RecordGap { kind?: unknown; subjectRefs?: unknown; reason?: unknown }

// The tool records whose gaps Stage 1 finish adds to the discovery gaps.
export const settingsTool: ToolRecordName = { name: 'settings', artifactRef: 'settings-001' };
export const gitIdentityTool: ToolRecordName = { name: 'git-identity', artifactRef: 'git-identity-001' };
const toolRecords = new Map([settingsTool, gitIdentityTool].map(record => [record.name, record.artifactRef]));

const gapId = (name: string, index: number): string => 's1-' + name + '-gap-' + String(index + 1).padStart(3, '0');

export function toolGaps({ name, artifactRef, gaps }: ToolRecord): DiscoveryGap[] {
  return gaps.map((value, index) => {
    const pointer = artifactRef + '#/gaps/' + index;
    const gap = value as RecordGap | null;
    assert(text(gap?.kind) && strings(gap.subjectRefs) && text(gap.reason), 'Invalid gap in the tool record: ' + pointer);
    return { id: gapId(name, index), kind: gap.kind, subjectRefs: [...gap.subjectRefs], reason: gap.reason, evidenceRefs: [pointer] };
  });
}

// True when a discovery gap has the form of a gap that Stage 1 finish copied from a
// tool record: the ID that toolGaps gives the gap at index N of the record, and one
// evidence reference to that gap of the record. Such a gap keeps the subjects of the
// tool, which can name a missing input or a path outside the snapshot.
export function isToolGap({ id, evidenceRefs }: { id?: unknown; evidenceRefs?: unknown }): boolean {
  const match = /^s1-(.+)-gap-([0-9]{3,})$/.exec(String(id));
  const artifactRef = toolRecords.get(match?.[1] ?? '');
  if (!match || artifactRef === undefined) return false;
  const index = Number(match[2]) - 1;
  return index >= 0 && id === gapId(match[1] as string, index) && same(evidenceRefs, [artifactRef + '#/gaps/' + index]);
}
