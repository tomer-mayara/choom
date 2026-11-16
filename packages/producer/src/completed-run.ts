import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { assert, type Fields, hash, object, text } from './record-checks.ts';

// A run that Stage 6 completed. Its manifest run.yaml selects the published
// baseline, and its artifact registry gives the path and SHA-256 of each saved
// file. The baseline decide command reads the run through this module and
// changes no file of it.

export interface RegisteredFile {
  readonly ref: string;
  // Relative to the run folder.
  readonly path: string;
  readonly sha256: string;
}
export interface CompletedRun {
  // The canonical path of the run folder.
  readonly folder: string;
  // The published baseline, baselines/<baseline ID>/baseline.yaml.
  readonly baseline: RegisteredFile;
  // Every registered file, in the order of the registry.
  readonly files: readonly RegisteredFile[];
}

const manifestLimit = 256 * 1024 * 1024;

// A relative path with "/" between plain names: no empty, "." or ".." part, no
// backslash and no control character.
const plainPath = (path: unknown): path is string => text(path) && !/[\\\u0000-\u001f\u007f]/.test(path) &&
  path.split('/').every(part => part !== '' && part !== '.' && part !== '..');

function readManifest(folder: string): Fields {
  const path = join(folder, 'run.yaml');
  const entry = lstatSync(path, { throwIfNoEntry: false });
  const size = entry?.isFile() ? entry.size : undefined;
  assert(size !== undefined, `The folder ${folder} has no run.yaml. Give the folder of a run that Stage 6 completed.`);
  assert(size <= manifestLimit, `run.yaml is larger than the read limit of ${manifestLimit} bytes.`);
  let manifest: unknown;
  try {
    manifest = parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error('Cannot read run.yaml: ' + (error as Error).message);
  }
  assert(object(manifest), 'run.yaml is not a run manifest.');
  return manifest;
}

function registeredFiles(manifest: Fields): RegisteredFile[] {
  assert(object(manifest.artifacts), 'run.yaml has no artifact registry.');
  return Object.entries(manifest.artifacts).map(([ref, record]) => {
    const fields = object(record) ? record : {};
    assert(plainPath(fields.path) && typeof fields.sha256 === 'string' && /^[a-f0-9]{64}$/.test(fields.sha256),
      'The artifact registry of run.yaml has an invalid entry: ' + ref + '.');
    return { ref, path: fields.path, sha256: fields.sha256 };
  });
}

export function readCompletedRun(runFolder: string): CompletedRun {
  assert(statSync(runFolder, { throwIfNoEntry: false })?.isDirectory(), `The run folder ${runFolder} does not exist or is not a folder.`);
  const folder = realpathSync(runFolder);
  const manifest = readManifest(folder);
  const progress = object(manifest.progress) ? manifest.progress : {};
  assert(manifest.formatVersion === 1 && manifest.status === 'completed' && progress.baselineRecovery === 'complete' &&
    text(manifest.baselineRef), 'The run has no published baseline. Record decisions after Stage 6 publishes the baseline of the run.');
  const files = registeredFiles(manifest);
  const baselinePath = `baselines/${manifest.baselineRef}/baseline.yaml`;
  const baseline = files.find(file => file.ref === manifest.baselineRef && file.path === baselinePath);
  assert(baseline, `run.yaml does not register the published baseline ${baselinePath}.`);
  return { folder, baseline, files };
}

// The bytes of one registered file, after the checks that it is a regular file in
// the run folder, within the read limit, with the SHA-256 that run.yaml records.
export function readRegisteredFile(run: CompletedRun, file: RegisteredFile, limit: number): Buffer {
  const path = join(run.folder, file.path);
  const entry = lstatSync(path, { throwIfNoEntry: false });
  const size = entry?.isFile() && realpathSync(path) === path ? entry.size : undefined;
  assert(size !== undefined, `The registered file ${file.path} is missing or is not a regular file in the run folder.`);
  assert(size <= limit, `The registered file ${file.path} is larger than the read limit of ${limit} bytes.`);
  const bytes = readFileSync(path);
  assert(hash(bytes) === file.sha256,
    `The registered file ${file.path} changed after it was saved: its SHA-256 is not the one in run.yaml.`);
  return bytes;
}
