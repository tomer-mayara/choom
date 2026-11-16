import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, realpathSync, rmdirSync,
  type Stats, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { assert, text } from './record-checks.ts';

// The file operations of the Stage 6 helper: bounded reads of canonical regular
// files that check that a file did not change while it was read, the file set of a
// folder, new files and folders that an action owns and can remove again, and the
// publication lock.
export const maxArtifactBytes = 128 * 1024 * 1024;

// A new file that an action saved, with the identity of the file that it created.
export interface OwnedFile { path: string; bytes: Buffer; stat: Stats | null }
// A folder that an action created, with its identity.
export interface OwnedFolder { path: string; stat: Stats }
// An inventory record of a snapshot file.
export interface IndexedFile { path: string; bytes: number; sha256: string }

export const present = (path: string): boolean => Boolean(lstatSync(path, { throwIfNoEntry: false }));

export function safe(name: unknown): name is string {
  return text(name) && !isAbsolute(name) && !/[\\\u0000-\u001f\u007f]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..');
}

export function directory(path: string | undefined): string {
  assert(isAbsolute(path ?? '') && lstatSync(path as string).isDirectory() && realpathSync(path as string) === path,
    'Expected a canonical directory: ' + path);
  return path as string;
}

// Opens the canonical regular file `name` below `root` without following links,
// gives its descriptor and its state to `read`, and checks that the file did not
// change before the end of the read.
function readChecked<T>(root: string, name: unknown, read: (fd: number, before: Stats) => T): T {
  assert(safe(name), 'Invalid saved path: ' + name);
  const path = join(root, name);
  const listed = lstatSync(path);
  assert(listed.isFile() && realpathSync(path) === path, 'Expected a canonical regular file: ' + path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    assert(before.isFile() && before.dev === listed.dev && before.ino === listed.ino,
      'File changed before opening: ' + path);
    const result = read(fd, before);
    const after = fstatSync(fd);
    const current = lstatSync(path);
    assert(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs &&
      current.dev === before.dev && current.ino === before.ino && realpathSync(path) === path,
    'Saved file changed while reading: ' + path);
    return result;
  } finally { closeSync(fd); }
}

// The bytes of a saved file of at most `maxBytes` bytes.
export function file(root: string, name: unknown, maxBytes = maxArtifactBytes): Buffer {
  return readChecked(root, name, (fd, before) => {
    assert(before.size <= maxBytes, 'Saved file exceeds byte limit: ' + name);
    const bytes = Buffer.allocUnsafe(before.size);
    for (let offset = 0; offset < bytes.length;) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null);
      assert(count > 0, 'Saved file shrank while reading: ' + name);
      offset += count;
    }
    return bytes;
  });
}

// Checks the size and the digest of an indexed snapshot file without keeping its bytes.
export function checkIndexedFile(root: string, indexed: IndexedFile): void {
  readChecked(root, indexed.path, (fd, before) => {
    assert(before.size === indexed.bytes, 'Indexed size changed: ' + indexed.path);
    const stream = createHash('sha256');
    const block = Buffer.allocUnsafe(64 * 1024);
    let count = 0;
    for (let length: number; (length = readSync(fd, block, 0, block.length, null)) > 0;) {
      stream.update(block.subarray(0, length));
      count += length;
    }
    assert(count === indexed.bytes && stream.digest('hex') === indexed.sha256, 'Indexed content changed: ' + indexed.path);
  });
}

// The paths of all files below `root`, in path order. A link or another kind of file is refused.
export function fileNames(root: string, prefix = ''): string[] {
  return readdirSync(join(root, prefix), { encoding: 'buffer' }).flatMap(bytes => {
    const name = bytes.toString('utf8');
    const relative = prefix ? prefix + '/' + name : name;
    assert(Buffer.from(name).equals(bytes) && safe(relative), 'Invalid saved filename: ' + relative);
    const path = join(root, relative);
    const info = lstatSync(path);
    assert(!info.isSymbolicLink() && realpathSync(path) === path && (info.isFile() || info.isDirectory()), 'Invalid saved path: ' + path);
    return info.isDirectory() ? fileNames(root, relative) : [relative];
  }).sort();
}

export function requireNames(actual: Iterable<string>, expected: Iterable<string>, label: string): void {
  assert(same([...actual].sort(), [...expected].sort()), 'Unexpected ' + label + ' file set.');
}

// Saves a new file and records it in `tracked`, so that a failure can remove it again.
export function saveNew(path: string, bytes: Buffer, tracked: Map<string, OwnedFile>): OwnedFile {
  const fd = openSync(path, 'wx');
  const record: OwnedFile = { path, bytes, stat: null };
  tracked.set(path, record);
  try {
    record.stat = fstatSync(fd);
    writeFileSync(fd, bytes);
  } finally { closeSync(fd); }
  assert(stillOwned(record), 'Output changed after writing: ' + path);
  return record;
}

// True when the file at the path of the record is still the file that the action
// created, with the bytes that it wrote.
export function stillOwned(record: OwnedFile): boolean {
  const current = lstatSync(record.path, { throwIfNoEntry: false });
  return current?.isFile() === true && record.stat !== null && current.dev === record.stat.dev && current.ino === record.stat.ino &&
    file(dirname(record.path), record.path.slice(dirname(record.path).length + 1)).equals(record.bytes);
}

export function ensureDirectory(path: string, tracked: OwnedFolder[]): string {
  if (!present(path)) {
    mkdirSync(path);
    tracked.push({ path, stat: lstatSync(path) });
  }
  return directory(path);
}

// Removes a file that the action still owns. A changed file, or one that cannot be
// checked, stays and joins the leftovers.
export function removeOwned(record: OwnedFile, leftovers: string[]): void {
  try {
    if (!present(record.path)) return;
    if (stillOwned(record)) unlinkSync(record.path);
    else leftovers.push(record.path);
  } catch { leftovers.push(record.path); }
}

// Removes the created folders, the last one first. A folder that is not empty, or
// that another folder replaced, stays and joins the leftovers.
export function removeOwnedDirectories(directories: OwnedFolder[], leftovers: string[]): void {
  for (const { path, stat } of [...directories].reverse()) {
    try {
      const current = lstatSync(path, { throwIfNoEntry: false });
      if (!current) continue;
      if (current.isDirectory() && stat.dev === current.dev && stat.ino === current.ino) rmdirSync(path);
      else leftovers.push(path);
    } catch { leftovers.push(path); }
  }
}

// Runs `invoke` while it holds the publication lock, a folder that only one
// publication can create. A lock that cannot be removed afterwards stays: the
// result or the failure says so.
export function withLock<T extends object>(lockPath: string, invoke: () => T): T {
  try { mkdirSync(lockPath, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error('Another publication owns the lock or cleanup is pending: ' + lockPath);
    throw error;
  }
  const lock = lstatSync(lockPath);
  let result: T | undefined;
  let failure: Error | undefined;
  try { result = invoke(); } catch (error) { failure = error as Error; }
  let cleanup: string | undefined;
  try {
    const current = lstatSync(lockPath, { throwIfNoEntry: false });
    assert(current?.isDirectory() && current.dev === lock.dev && current.ino === lock.ino, 'Lock identity changed.');
    rmdirSync(lockPath);
  } catch (error) {
    cleanup = 'Publication lock cleanup pending at ' + lockPath + ': ' + (error as Error).message;
  }
  if (failure) throw new Error(failure.message + (cleanup ? ' ' + cleanup : ''));
  if (cleanup) return { ...result, lockCleanup: 'pending', warning: cleanup } as T;
  return result as T;
}
