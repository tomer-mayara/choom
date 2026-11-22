import { ToolGaps } from './tool-gaps.ts';

// A Stage 1 tool record: its name in the gap IDs and its artifact ID.
export interface ToolRecordName { readonly name: string; readonly artifactRef: string }

// The tool records whose gaps Stage 1 finish adds to the discovery gaps.
export const settingsTool: ToolRecordName = { name: 'settings', artifactRef: 'settings-001' };
export const gitIdentityTool: ToolRecordName = { name: 'git-identity', artifactRef: 'git-identity-001' };
export const stageOneTools: readonly ToolRecordName[] = [settingsTool, gitIdentityTool];

// The gaps of the Stage 1 tool records, as discovery gaps. Stage 1 finish adds
// them to the review gaps. Their IDs start with s1-, such as s1-settings-gap-001.
export const stageOneGaps = new ToolGaps('s1-');
