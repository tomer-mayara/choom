import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert, hash } from './record-checks.ts';

// The folder of a new baseline version in a run, baselines/<version ID>, saved
// all or nothing. The files are written into a new temporary folder in
// baselines/, on the same file system, and read back there. Its name starts with
// ".next-", so it cannot be a baseline ID. Then one rename gives the folder its
// final name. A version folder that exists is never replaced. After any failure,
// the temporary folder is removed, so no part of the version stays. Only a hard
// stop of the process, such as a power loss, can leave a temporary folder.

export interface VersionFile { readonly name: string; readonly bytes: Buffer }
// Writes one new file. The producer writes with the flag wx; a test can give a
// write that fails.
type WriteFile = (path: string, bytes: Buffer) => void;

const writeNewFile: WriteFile = (path, bytes) => writeFileSync(path, bytes, { flag: 'wx' });

export function saveVersionFolder(runFolder: string, id: string, files: readonly VersionFile[], write = writeNewFile): void {
  const folder = `baselines/${id}`;
  assert(lstatSync(join(runFolder, folder), { throwIfNoEntry: false }) === undefined, `The baseline version ${id} is saved ` +
    `already: ${folder}. A saved version does not change. Make another version from a new decision record.`);
  const temporary = join(runFolder, 'baselines', `.next-${randomUUID()}`);
  try {
    mkdirSync(temporary);
    for (const { name, bytes } of files) {
      write(join(temporary, name), bytes);
      assert(hash(readFileSync(join(temporary, name))) === hash(bytes), `The saved file changed while it was saved: ${folder}/${name}`);
    }
    renameSync(temporary, join(runFolder, folder));
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw new Error(`Cannot make the folder ${folder}: ${(error as Error).message}`);
  }
}
