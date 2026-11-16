import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The inventory of the saved snapshot of a run, made with the code of the tool
// checkout: the bytes that Stage 1 capture saves as evidence/inventory.json, and
// that the saved inventory.mjs of the run prints. Stage 2 compares these bytes
// with the registered inventory. It does not run inventory.mjs, because the run
// folder holds no trusted code. The walk lists the names of each folder in sorted
// order, and it stops at an entry that is not a regular file or a folder.
export function snapshotInventory(work: string, snapshotId: string): Buffer {
  const root = join(work, 'snapshot');
  const files: { path: string; kind: 'file'; bytes: number; sha256: string }[] = [];
  const visit = (folder: string): void => {
    for (const name of readdirSync(join(root, folder)).sort()) {
      const path = folder ? folder + '/' + name : name;
      const entry = lstatSync(join(root, path));
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        const bytes = readFileSync(join(root, path));
        files.push({ path, kind: 'file', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      } else throw new Error('Unsupported filesystem item: ' + path);
    }
  };
  visit('');
  return Buffer.from(JSON.stringify({ formatVersion: 1, snapshotId, files }, null, 2) + '\n');
}
