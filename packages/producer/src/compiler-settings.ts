import { assert, type Fields, object } from './record-checks.ts';
import { type ProjectSettings, snapshotPath } from './snapshot-project.ts';
import { type CompilerContext, compilerContexts, type SourceFile } from './stage-4-graph-profile.ts';

// The compiler settings of one source file of the snapshot, chosen by the rule of
// the Stage 4 graph groups: the first fully parsed configuration of the settings
// record that selects the file, else the named Choom parsing profile, else no
// settings. The Stage 3 exports action and the Stage 4 references action open the
// snapshot project with these settings and save their description in the record.
export interface FileSettings {
  // The name of the compiler context of the file, as the Stage 4 graph profile names its group.
  group: string;
  // The reference of the settings in the settings record, or null for no settings.
  ref: string | null;
  project: ProjectSettings;
  // The description of the settings that a record saves.
  record: Fields;
}

// Stage 1 finish registers the selected settings record with this ID.
export const settingsRef = 'settings-001';

// The registered settings record of the snapshot, from its saved bytes.
export function savedSettings(bytes: Buffer | undefined, snapshotRef: unknown): Fields {
  assert(bytes, 'The run has no registered settings record ' + settingsRef + '.');
  const settings = JSON.parse(bytes.toString()) as unknown;
  assert(object(settings) && settings.snapshotId === snapshotRef,
    'The settings record ' + settingsRef + ' does not describe this snapshot.');
  return settings;
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];

// The compiler settings of the first compiler context of the file. otherContextRefs
// names the settings of the other contexts that select the file.
export function fileSettings(settings: Fields, file: SourceFile): FileSettings {
  const { groups, parsingProfile } = compilerContexts(settings, [{ path: file.path, sha256: file.sha256 }], settingsRef);
  const [context, ...others] = groups as [CompilerContext, ...CompilerContext[]];
  const otherContextRefs = others.map(other => other.ref);
  const { name: group, config, ref } = context;
  if (config !== null) {
    const configPath = String(config.path);
    const compilerOptions = object(config.compilerOptions) ? config.compilerOptions : {};
    return { group, ref, project: { ref, configPath, files: strings((config.declared as Fields | undefined)?.files), compilerOptions },
      record: { source: 'configuration', configPath: snapshotPath(configPath),
        reason: 'The first fully parsed configuration of ' + settingsRef + ' that selects the file.', compilerOptions,
        otherContextRefs } };
  }
  const noConfig = 'No parsed configuration of ' + settingsRef + ' selects the file, and the record names ';
  if (parsingProfile !== null) {
    const compilerOptions = { ...parsingProfile.compilerOptions };
    return { group, ref, project: { ref, configPath: null, files: [], compilerOptions },
      record: { source: 'parsing-profile', profileId: parsingProfile.id, reason: noConfig + 'the Choom parsing profile.',
        compilerOptions, otherContextRefs } };
  }
  return { group, ref: null, project: { ref: null, configPath: null, files: [], compilerOptions: {} },
    record: { source: 'fallback', reason: noConfig + 'no parsing profile. The project uses no compiler settings, as the ' +
      'configuration-free fallback of the Stage 4 graph profile does.', compilerOptions: {}, otherContextRefs } };
}
