import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'yaml';
import type { CompletedRun } from './completed-run.ts';
import { assert, hash } from './record-checks.ts';
import { readBoundedYaml } from './stage-6-records.ts';

// The decision record of a run: a YAML decision file that baseline decide checked
// and saved, unchanged, as decisions/<id>.yaml in the run folder. The decide
// command reads a new decision file, and a later command reads a saved record,
// with the same rules: the producer's bounded YAML profile of a baseline (one
// UTF-8 document of at most 16 MiB within the YAML limits, the core schema, no
// merge keys, anchors, aliases, tags or directives, unique string keys and
// JSON-compatible values). Each refusal of the profile starts with "Decision file".

export interface DecisionRecord {
  // Relative to the run folder.
  path: string;
  bytes: Buffer;
  sha256: string;
  // The parsed decision file. validateDecisions of @choom/baseline-model checks it.
  value: unknown;
}

export const decisionFileLimit = 16 * 1024 * 1024;
const recordId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const decisionRecordPath = (id: string): string => `decisions/${id}.yaml`;

// The size check before a decision file is read, with the message of the profile.
export function checkDecisionFileSize(size: number): void {
  assert(size <= decisionFileLimit, 'Decision file exceeds the 16 MiB file limit.');
}

/** The value of a decision file, read with the producer's bounded YAML profile. */
export function parseDecisionYaml(bytes: Buffer): unknown {
  return readBoundedYaml(bytes, yaml, 'Decision file');
}

/** The saved decision record `id` of a completed run, read with the rules of baseline decide. */
export function readDecisionRecord(run: CompletedRun, id: string): DecisionRecord {
  assert(recordId.test(id) && id.length <= 128, `Not a decision record ID: ${JSON.stringify(id)}.`);
  const path = decisionRecordPath(id);
  const file = join(run.folder, path);
  const entry = lstatSync(file, { throwIfNoEntry: false });
  const size = entry?.isFile() && realpathSync(file) === file ? entry.size : undefined;
  assert(size !== undefined, `The run has no decision record ${id}: ${path} is missing or is not a regular file.`);
  checkDecisionFileSize(size);
  const bytes = readFileSync(file);
  return { path, bytes, sha256: hash(bytes), value: parseDecisionYaml(bytes) };
}
