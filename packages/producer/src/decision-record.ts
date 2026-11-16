import { randomUUID } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'yaml';
import type { CompletedRun } from './completed-run.ts';
import { assert, hash } from './record-checks.ts';
import { readBoundedYaml } from './stage-6-records.ts';

// The decision record of a run: a YAML decision file that baseline decide checked
// and saved, unchanged, as decisions/<id>.yaml in the run folder, all or nothing.
// The decide command reads a new decision file, and a later command reads a saved
// record, with the same rules: the producer's bounded YAML profile of a baseline (one
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

// Writes one new file. The producer writes with the flag wx; a test can give a
// write that fails.
type WriteFile = (path: string, bytes: Buffer) => void;
const writeNewFile: WriteFile = (path, bytes) => writeFileSync(path, bytes, { flag: 'wx' });

// Gives the file `temporary` the new name `final` too, and tells whether it could.
// A link never replaces a file: when `final` exists, nothing changes.
function linkNew(temporary: string, final: string): boolean {
  try {
    linkSync(temporary, final);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

/**
 * Saves the bytes of the decision record `id` once, as decisions/<id>.yaml, all or
 * nothing, and returns its path. The bytes go into a new temporary file in
 * decisions/, whose name starts with ".next-" and so cannot be a record ID, and
 * are read back there. Then a hard link gives the file the name of the record,
 * and the temporary name is removed. A record with the same ID is never
 * replaced. After any failure, the temporary file is removed, so no part of the
 * record stays. Only a hard stop of the process, such as a power loss, can leave
 * a temporary file.
 */
export function saveDecisionRecord(run: CompletedRun, id: string, bytes: Buffer, write = writeNewFile): string {
  const folder = join(run.folder, 'decisions');
  if (lstatSync(folder, { throwIfNoEntry: false }) === undefined) mkdirSync(folder, { recursive: true });
  assert(lstatSync(folder).isDirectory(), 'decisions in the run folder is not a folder.');
  const path = decisionRecordPath(id);
  const savedAlready = `The decision record ${id} is saved already: ${path}. A saved decision record does not change. ` +
    'Give new decisions a new ID.';
  assert(lstatSync(join(run.folder, path), { throwIfNoEntry: false }) === undefined, savedAlready);
  const temporary = join(folder, `.next-${randomUUID()}.yaml`);
  let linked = false;
  try {
    write(temporary, bytes);
    assert(readFileSync(temporary).equals(bytes), 'The saved decision record changed while it was saved: ' + path);
    linked = linkNew(temporary, join(run.folder, path));
  } catch (error) {
    throw new Error(`Cannot save the decision record ${path}: ${(error as Error).message}`);
  } finally {
    rmSync(temporary, { force: true });
  }
  assert(linked, savedAlready);
  assert(readDecisionRecord(run, id).sha256 === hash(bytes), 'The saved decision record changed while it was saved: ' + path);
  return path;
}
