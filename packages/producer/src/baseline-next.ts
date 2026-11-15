import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as yaml from 'yaml';
import { nextBaselineVersion, type SavedBaseline } from '@choom/baseline-model/baseline-decisions';
import type { Baseline, BaselineDecisions } from '@choom/baseline-model/contracts';
import { publishedBaseline } from './baseline-decide.ts';
import { type CompletedRun, readCompletedRun } from './completed-run.ts';
import { checkDecider, type ModelCall, runModelCalls } from './decider-check.ts';
import { type DecisionRecord, readDecisionRecord } from './decision-record.ts';
import { checkBaselineDocument, type VersionDecisions } from './record-baseline.ts';
import { assert, hash } from './record-checks.ts';
import { readBaselineYaml } from './stage-6-records.ts';

// The next action of the baseline command. It makes the next version of the
// published baseline of a run that Stage 6 completed, from a decision record that
// baseline decide saved as decisions/<id>.yaml: nextBaselineVersion of
// @choom/baseline-model accepts the decided statements. The command checks the
// decider as baseline decide does. It checks the YAML text of the version with the
// bounded YAML profile, the shared baseline rules and the producer profile of a
// next version. Then it saves the version once as baselines/<version ID>/baseline.yaml,
// and last its version record baselines/<version ID>/version.json, which links
// the version to its parent and its decision record by path and SHA-256. No other
// file of the run changes: the published baseline, the discovery result, run.yaml
// and the decision record stay as they are. The new version has no discovery
// result until a new run maps it.

/** A saved file of the run: its ID, its path in the run folder and the SHA-256 of its bytes. */
export interface FileLink { id: string; path: string; sha256: string }

/** The version record, baselines/<version ID>/version.json. */
export interface VersionRecord { formatVersion: 1; baseline: FileLink; parent: FileLink; decisions: FileLink }

export interface MadeVersion {
  status: 'version-made';
  id: string;
  // The saved version, relative to the run folder, and the SHA-256 of its bytes.
  path: string;
  sha256: string;
  parent: FileLink;
  decisions: FileLink;
  versionRecord: { path: string; sha256: string };
  statements: { action: string; statement: string }[];
  deciderCheck: { llmCallRecords: string[]; models: string[] };
  limits: string[];
  writes: string[];
}

interface DecidedVersion { version: Baseline; decisions: BaselineDecisions; calls: ModelCall[] }

const limits = [
  'The new version has no discovery result until a new run maps it. The discovery result of the run stays with the published baseline.',
  'The decider check compares the decider name with the model names in the LLM call records of the run. ' +
    'It is a process rule: it does not prove that a person made the decisions.',
  'Making the version does not change the published baseline, the discovery result, run.yaml or the decision record.',
];

function refuse(record: DecisionRecord, problems: readonly string[]): never {
  throw new Error(`Cannot make the next version from ${record.path}:\n` + problems.map(problem => '- ' + problem).join('\n'));
}

// The version that the saved decision record makes, after the checks of baseline
// decide: the shared decision rules against the published baseline, the ID of the
// file, and the decider.
function decidedVersion(run: CompletedRun, parent: SavedBaseline, record: DecisionRecord, id: string): DecidedVersion {
  const made = nextBaselineVersion(parent, record.value);
  if (made.status === 'invalid') refuse(record, made.problems);
  const { baseline: version, decisions } = made;
  if (decisions.id !== id) refuse(record, [`The record has the ID ${decisions.id}. A saved decision record has the ID of its file name.`]);
  const calls = runModelCalls(run);
  try {
    checkDecider(decisions.decider.name, calls);
  } catch (error) {
    refuse(record, [(error as Error).message]);
  }
  return { version, decisions, calls };
}

// The YAML text of the version, after the checks of its saved form: the bounded
// YAML profile, the shared baseline rules and the producer profile of a next
// version accept it, and it gives the data of the version.
function versionText(record: DecisionRecord, version: Baseline, made: VersionDecisions): Buffer {
  const bytes = Buffer.from(yaml.stringify(version, { aliasDuplicateObjects: false, lineWidth: 0 }));
  let saved: Baseline;
  try {
    saved = checkBaselineDocument(readBaselineYaml(bytes, yaml), made);
  } catch (error) {
    refuse(record, [(error as Error).message]);
  }
  assert(isDeepStrictEqual(saved, version), 'The YAML text of the next version does not give the data of the version.');
  return bytes;
}

// Saves the files once, in a new folder for the version. A saved version is never
// replaced, also when the content is the same. The last file is the version record.
function saveVersion(run: CompletedRun, id: string, files: readonly (readonly [string, Buffer])[]): void {
  const folder = `baselines/${id}`;
  try {
    mkdirSync(join(run.folder, folder));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error(`Cannot make the folder ${folder}: ${(error as Error).message}`);
    throw new Error(`The baseline version ${id} is saved already: ${folder}. A saved version does not change. ` +
      'Make another version from a new decision record.');
  }
  for (const [path, bytes] of files) {
    writeFileSync(join(run.folder, path), bytes, { flag: 'wx' });
    assert(hash(readFileSync(join(run.folder, path))) === hash(bytes), 'The saved file changed while it was saved: ' + path);
  }
}

export function makeNextVersion(runFolder: string, decisionsId: string): MadeVersion {
  const run = readCompletedRun(runFolder);
  const record = readDecisionRecord(run, decisionsId);
  const parent = publishedBaseline(run);
  const { version, decisions, calls } = decidedVersion(run, parent, record, decisionsId);
  const link: FileLink = { id: decisions.id, path: record.path, sha256: record.sha256 };
  const bytes = versionText(record, version, { link, saved: { sha256: record.sha256, decisions } });
  const folder = `baselines/${version.id}`;
  const versionRecord: VersionRecord = { formatVersion: 1, baseline: { id: version.id, path: `${folder}/baseline.yaml`, sha256: hash(bytes) },
    parent: { id: parent.baseline.id, path: run.baseline.path, sha256: parent.sha256 }, decisions: link };
  const recordBytes = Buffer.from(JSON.stringify(versionRecord, null, 2) + '\n');
  const files = [[versionRecord.baseline.path, bytes], [`${folder}/version.json`, recordBytes]] as const;
  saveVersion(run, version.id, files);
  return { status: 'version-made', id: version.id, path: versionRecord.baseline.path, sha256: versionRecord.baseline.sha256,
    parent: versionRecord.parent, decisions: link, versionRecord: { path: `${folder}/version.json`, sha256: hash(recordBytes) },
    statements: decisions.entries.map(({ action, itemId, field }) => ({ action, statement: `${itemId}.${field}` })),
    deciderCheck: { llmCallRecords: calls.map(call => call.path), models: [...new Set(calls.map(call => call.model))] },
    limits, writes: files.map(([path]) => path) };
}
