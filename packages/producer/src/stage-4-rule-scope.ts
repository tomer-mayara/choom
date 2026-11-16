import { entryQuery, type EntryQuery } from './behavior-entry-calls.ts';
import { type FileSettings, fileSettings } from './compiler-settings.ts';
import type { Fields } from './record-checks.ts';
import { openSnapshotProject, type OutsideRead, type ProjectTools } from './snapshot-project.ts';
import type { SnapshotFiles } from './stage-1-settings.ts';
import type { SourceFile } from './stage-4-graph-profile.ts';
import { importPass, queryOptions } from './stage-4-references.ts';

// The source files of the graph scope as the records of the Stage 4 rule lists read
// them. Each graph group of the scope, in the order of its first file, opens the
// snapshot project with the compiler settings of the group, chosen as the references
// action chooses them, and with allowJs; the type checker reads the files of its
// import pass. The records save each group, the candidates in the order of the scope
// files, the gaps, and the requests of the projects for paths that the snapshot does
// not hold.
export interface ScopeInput {
  // The indexed files of the saved snapshot and its folder, which the snapshot project reads.
  snapshot: SnapshotFiles;
  // The checked graph profile and its artifact ID, and the registered settings record.
  profile: Fields; profileRef: string; settings: Fields;
  tsMorph: ProjectTools;
}
// The candidates are in the order of the scope files, and those of a file in the order that its reader gives.
export interface ScopeRead { groups: Fields[]; candidates: Fields[]; gaps: unknown[]; outsideReads: OutsideRead[] }
// The candidates and the gaps that a reader finds in one file of the scope.
export interface FileFindings { candidates: Fields[]; gaps: unknown[] }
// Reads one file of the scope with the type checker of its group.
export type FileReader = (query: EntryQuery, file: SourceFile, graphContext: string) => FileFindings;
// The candidates of a Stage 4 rule record, in the order of the record. The record
// saves the first ones up to its limit, and omitted counts the others.
export interface CandidateList { saved: Fields[]; omitted: number; add(found: Iterable<Fields>): void }
// The files of the scope that one graph group reads, with its settings and its import pass.
interface Group { settings: FileSettings; index: number; pass: Fields; files: SourceFile[] }

// The limit of the candidates that each Stage 4 rule record saves. The notes of the records name it.
export const candidateLimit = 10000;

export function candidateList(): CandidateList {
  const list: CandidateList = {
    saved: [], omitted: 0,
    add(found) {
      for (const candidate of found) {
        if (list.saved.length < candidateLimit) list.saved.push(candidate);
        else list.omitted++;
      }
    },
  };
  return list;
}

// The graph groups of the scope, in the order of their first file: the files whose
// first compiler context is the group, its settings and its import pass.
function groupsOf(profile: Fields, settings: Fields): Group[] {
  const groups = new Map<string, Group>();
  for (const file of profile.sourceFiles as SourceFile[]) {
    const chosen = fileSettings(settings, file);
    const group = groups.get(chosen.group) ?? { settings: chosen, ...importPass(profile, chosen, file.path), files: [] };
    groups.set(chosen.group, group);
    group.files.push(file);
  }
  return [...groups.values()];
}

// Reads each file of the scope. The gaps of a group are the gaps of its files and then
// the compiler inputs that the snapshot does not hold, each gap once. The files of the
// groups can interleave in the scope, so the candidates of each file wait until all
// groups are read.
export function readScope(input: ScopeInput, read: FileReader): ScopeRead {
  const gaps = new Map<string, unknown>(); const outsideReads = new Map<string, OutsideRead>();
  const found = new Map<string, Fields[]>();
  const groups = groupsOf(input.profile, input.settings).map(group => {
    const project = openSnapshotProject(input.snapshot, { ...group.settings.project,
      compilerOptions: { ...group.settings.project.compilerOptions, ...queryOptions } }, input.tsMorph);
    for (const path of group.pass.sourceFiles as string[]) project.sourceFile(path);
    const query = entryQuery(project);
    for (const file of group.files) {
      const findings = read(query, file, group.pass.id as string);
      found.set(file.path, findings.candidates);
      for (const gap of findings.gaps) gaps.set(JSON.stringify(gap), gap);
    }
    for (const gap of project.gaps()) gaps.set(JSON.stringify(gap), gap);
    for (const outside of project.outsideReads()) outsideReads.set(outside.operation + ' ' + outside.path, outside);
    return { graphContext: group.pass.id, graphContextRef: input.profileRef + '#/contexts/' + group.index,
      compilerSettingsRef: group.settings.ref, files: group.files.map(file => file.path) };
  });
  const candidates = (input.profile.sourceFiles as SourceFile[]).flatMap(file => found.get(file.path) ?? []);
  return { groups, candidates, gaps: [...gaps.values()], outsideReads: [...outsideReads.values()] };
}
