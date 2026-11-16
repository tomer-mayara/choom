import { isDeepStrictEqual } from 'node:util';
import * as yaml from 'yaml';
import type { Baseline } from '@choom/baseline-model/contracts';
import { checkBaselineDocument, type VersionDecisions } from './record-baseline.ts';
import { assert } from './record-checks.ts';
import { readBaselineYaml } from './stage-6-records.ts';

// The checks of the saved form of a next baseline version. baseline next runs
// them before it saves the version. baseline decide runs them before it saves a
// decision record, with the link that the saved record will have, so that it
// never saves a record from which baseline next cannot make the version.

/** Refuses the command with its problems. Each command gives its own first line. */
export type Refuse = (problems: readonly string[]) => never;

// The YAML text of the version, after the checks of its saved form: the bounded
// YAML profile, the shared baseline rules and the producer profile of a next
// version accept it, and it gives the data of the version.
export function nextVersionText(version: Baseline, made: VersionDecisions, refuse: Refuse): Buffer {
  const bytes = Buffer.from(yaml.stringify(version, { aliasDuplicateObjects: false, lineWidth: 0 }));
  let saved: Baseline;
  try {
    saved = checkBaselineDocument(readBaselineYaml(bytes, yaml), made);
  } catch (error) {
    refuse([(error as Error).message]);
  }
  assert(isDeepStrictEqual(saved, version), 'The YAML text of the next version does not give the data of the version.');
  return bytes;
}
