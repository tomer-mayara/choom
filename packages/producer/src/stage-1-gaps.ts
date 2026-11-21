import { isDeepStrictEqual as same } from 'node:util';
import { ToolGaps } from './tool-gaps.ts';

// A Stage 1 tool record: its name in the gap IDs and its artifact ID.
export interface ToolRecordName { readonly name: string; readonly artifactRef: string }

// The tool records whose gaps Stage 1 finish adds to the discovery gaps.
export const settingsTool: ToolRecordName = { name: 'settings', artifactRef: 'settings-001' };
export const gitIdentityTool: ToolRecordName = { name: 'git-identity', artifactRef: 'git-identity-001' };
const toolRecords = new Map([settingsTool, gitIdentityTool].map(record => [record.name, record.artifactRef]));

// The gaps of the Stage 1 tool records, as discovery gaps. Stage 1 finish adds
// them to the review gaps. Their IDs start with s1-, such as s1-settings-gap-001.
export const stageOneGaps = new ToolGaps('s1-');

// True when a discovery gap has the form of a gap that Stage 1 finish copied from a
// tool record: the ID that stageOneGaps gives the gap at index N of the record, and
// one evidence reference to that gap of the record. Such a gap keeps the subjects of
// the tool, which can name a missing input or a path outside the snapshot.
export function isToolGap({ id, evidenceRefs }: { id?: unknown; evidenceRefs?: unknown }): boolean {
  const match = /^s1-(.+)-gap-([0-9]{3,})$/.exec(String(id));
  const artifactRef = toolRecords.get(match?.[1] ?? '');
  if (!match || artifactRef === undefined) return false;
  const index = Number(match[2]) - 1;
  return index >= 0 && id === stageOneGaps.id(match[1] as string, index) && same(evidenceRefs, [artifactRef + '#/gaps/' + index]);
}
