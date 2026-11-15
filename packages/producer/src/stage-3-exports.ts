import { assert, type Fields, object } from './record-checks.ts';
import { listExports } from './snapshot-exports.ts';
import { openSnapshotProject, type ProjectSettings, type ProjectTools, snapshotPath, virtualRoot } from './snapshot-project.ts';
import { sourceExtensions } from './stage-3-collect.ts';
import { type IndexedFile, safePath, type StageState } from './stage-3-inputs.ts';
import { type CompilerContext, compilerContexts } from './stage-4-graph-profile.ts';

// The Stage 3 exports action: the exports of one indexed source file, read with
// the snapshot project and the compiler settings that apply to the file. The
// record names the file, the settings and their reference in the Stage 1 settings
// record, the tool versions, the exports, the gaps of the compiler inputs, the
// reads outside the snapshot and what the list does not cover.
export interface ExportsInput {
  attemptId: string; state: StageState; path: string; tsMorph: ProjectTools;
  versions: { tsMorph: string; typescript: string };
}
interface Settings { ref: string | null; project: ProjectSettings; record: Fields }

// Stage 1 finish registers the selected settings record with this ID.
const settingsRef = 'settings-001';

// What each record covers and what it does not, in the words of the record.
export const exportsNotes = [
  'The list comes from the syntax of this file only. The action does not run the file, does not read the files that it ' +
    'imports and does not use the type checker.',
  'Each export statement, exported declaration or export list entry gives one export, in source order. Function overloads ' +
    'are one export. A name can appear more than once when declarations merge, such as an interface and a variable.',
  'An anonymous default export is named default, and export = is named export=. export * from is named *: the names that ' +
    'it re-exports are in the other module, which this list does not read. Ask for the exports of that file.',
  'typeOnly is null when an export names a binding of another module without a type modifier: only that module shows ' +
    'whether the name is a type or a value.',
  'Exports inside declare module and declare global blocks, export as namespace, CommonJS exports (module.exports and ' +
    'exports.NAME assignments) and the JSDoc types of a JavaScript file are not listed. An empty list does not show that ' +
    'the file exports nothing.',
  'A range starts at the first character of the export and ends after its last character. Lines and columns start at 1 ' +
    'and count UTF-16 code units. A byte order mark is not counted.',
  'The compiler settings are chosen as for the Stage 4 graph groups: the first fully parsed configuration of settings-001 ' +
    'that selects the file (otherContextRefs names the others), else the named Choom parsing profile, else no settings. ' +
    'They do not change the list. Their files and types entries decide the gaps.',
  'gaps lists each compiler input that the snapshot does not hold: a files entry of the configuration itself (not one ' +
    'that comes from an extended configuration), a types entry, and a reference path or reference types directive of ' +
    'this file. The modules that the file imports are not checked.',
  'outsideReads lists each request of the project for a path that the snapshot does not hold: a file or folder read, or a ' +
    'check whether it exists. The answer was not found. The project reads only indexed snapshot files, checked against ' +
    'their inventory digests, and paths are as the project sees them below ' + virtualRoot + '.',
];

// The indexed regular source file that the operator named.
function sourceFile(state: StageState, path: string): IndexedFile {
  const file = state.files.get(path);
  assert(safePath(path) && file?.kind === 'file', 'Path is outside the indexed regular files: ' + path);
  assert(sourceExtensions.test(path), 'Path is not a JavaScript or TypeScript source file: ' + path);
  return file;
}

// The settings record that Stage 1 registered for this snapshot.
function settingsRecord(state: StageState): Fields {
  const artifact = state.artifacts.get(settingsRef);
  assert(artifact, 'The run has no registered settings record ' + settingsRef + '.');
  const settings = JSON.parse(artifact.bytes.toString()) as unknown;
  assert(object(settings) && settings.snapshotId === state.facts.snapshotRef,
    'The settings record ' + settingsRef + ' does not describe this snapshot.');
  return settings;
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];

// The compiler settings of the first compiler context of the file, by the rule of the Stage 4 graph groups.
function compilerSettings(settings: Fields, file: IndexedFile): Settings {
  const { groups, parsingProfile } = compilerContexts(settings, [{ path: file.path, sha256: file.sha256 }], settingsRef);
  const [context, ...others] = groups as [CompilerContext, ...CompilerContext[]];
  const otherContextRefs = others.map(other => other.ref);
  const { config, ref } = context;
  if (config !== null) {
    const configPath = String(config.path);
    const compilerOptions = object(config.compilerOptions) ? config.compilerOptions : {};
    return { ref, project: { ref, configPath, files: strings((config.declared as Fields | undefined)?.files), compilerOptions },
      record: { source: 'configuration', configPath: snapshotPath(configPath),
        reason: 'The first fully parsed configuration of ' + settingsRef + ' that selects the file.', compilerOptions,
        otherContextRefs } };
  }
  const noConfig = 'No parsed configuration of ' + settingsRef + ' selects the file, and the record names ';
  if (parsingProfile !== null) {
    const compilerOptions = { ...parsingProfile.compilerOptions };
    return { ref, project: { ref, configPath: null, files: [], compilerOptions },
      record: { source: 'parsing-profile', profileId: parsingProfile.id, reason: noConfig + 'the Choom parsing profile.',
        compilerOptions, otherContextRefs } };
  }
  return { ref: null, project: { ref: null, configPath: null, files: [], compilerOptions: {} },
    record: { source: 'fallback', reason: noConfig + 'no parsing profile. The project uses no compiler settings, as the ' +
      'configuration-free fallback of the Stage 4 graph profile does.', compilerOptions: {}, otherContextRefs } };
}

// The exports record of one source file.
export function exportsRecord({ attemptId, state, path, tsMorph, versions }: ExportsInput): Fields {
  const file = sourceFile(state, path);
  const settings = compilerSettings(settingsRecord(state), file);
  const project = openSnapshotProject({ files: [...state.files.values()], snapshotRoot: state.facts.snapshot.path },
    settings.project, tsMorph);
  const exports = listExports(project, path);
  return {
    formatVersion: 1, attemptId, snapshotRef: state.facts.snapshotRef, status: 'completed', path, sha256: file.sha256,
    settingsRef, compilerSettingsRef: settings.ref, compilerSettings: settings.record,
    tool: { name: 'ts-morph', version: versions.tsMorph, typescript: versions.typescript }, virtualRoot,
    exports, gaps: project.gaps(), outsideReads: project.outsideReads(), notes: exportsNotes,
  };
}
