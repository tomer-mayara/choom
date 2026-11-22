import { createHash } from 'node:crypto';
import { assert, object } from './record-checks.ts';
import type { CaptureExclusions } from './stage-1-exclusions.ts';
import { gitIdentityTool, stageOneGaps } from './stage-1-gaps.ts';
import type { DiscoveryGap } from './tool-gaps.ts';

// The Git identity of a Stage 1 snapshot: the commit, the branch and the local
// changes of the target folder, without history. Stage 1 capture runs Git on
// the target folder after the copy, never on the snapshot. The design forbids
// running target code, so Git runs only commands that read refs and objects.
// It does not run `git status`, which can run the clean and process filters of
// the target's settings when it compares file contents. Choom compares the
// snapshot with the commit itself, by the Git object ID of each file.
export interface GitCall { args: string[]; env: Record<string, string> }
// `error` is set when Git did not run or did not end normally.
export interface GitResult { status: number | null; stdout: Buffer; stderr: string; error: string | null }
export type RunGit = (call: GitCall) => GitResult;
// The snapshot files by their path relative to the target folder, and a reader of their saved content.
export interface SnapshotFiles { snapshotRef: string; paths: string[]; read: (path: string) => Buffer }
export interface GitIdentityInput { target: string; environment: NodeJS.ProcessEnv; snapshot: SnapshotFiles; exclusions: CaptureExclusions }
export interface LocalChanges {
  changed: string[]; notInCommit: string[]; notInSnapshot: string[]; outsideCaptureScope: string[]; submodules: string[];
}
interface GitGap { kind: string; subjectRefs: string[]; reason: string }
type ObjectFormat = 'sha1' | 'sha256';
interface Identity { formatVersion: 1; snapshotRef: string; gitVersion: string | null; gaps: GitGap[] }
export type GitIdentityRecord = Identity & ({ status: 'available'; commit: string; objectFormat: ObjectFormat;
  branch: string | null; targetPrefix: string; localChanges: LocalChanges; limits: string[] } |
  { status: 'not-available'; reason: string });
interface TreeEntry { type: string; id: string }

export const gitIdentityPath = 'evidence/git-identity.json';
export const gitIdentityRef = gitIdentityTool.artifactRef;

// Each Git call starts with these arguments and has these variables, and no
// other GIT_* variable. They turn off the target settings that can run a
// program (fsmonitor, hooks and a pager), the system and user Git settings and
// prompts. They also turn off every transport and the lazy fetch: in a partial
// clone that misses an object, a fetch runs commands of the target settings,
// such as remote.<name>.uploadpack. Last, they turn off replacement objects, so
// that the listed tree is the tree of the recorded commit.
const settingArguments = ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null'];
const settingVariables = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: '', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' };
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
// One entry of `git ls-tree -r -z`: mode, type, object ID, a tab and the path.
const treeEntry = /^[0-7]{6} (blob|commit) ([0-9a-f]+)\t(.+)$/s;

// The reason why Git evidence is not available.
class GitUnavailable extends Error {}

const unexpected = (what: string, output: string): GitUnavailable =>
  new GitUnavailable(`Git gave an unexpected ${what}: ${JSON.stringify(output.slice(0, 200))}`);

function gitEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  const kept = Object.entries(environment)
    .filter((entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith('GIT_'));
  return { ...Object.fromEntries(kept), ...settingVariables };
}

// Runs one command with the safety settings. An exit code that is not allowed is a refusal.
function readGit(runGit: RunGit, call: { target: string; env: Record<string, string> }, command: string[],
  allowed = [0]): GitResult {
  const result = runGit({ args: ['-C', call.target, ...settingArguments, ...command], env: call.env });
  const shown = '`git ' + command.join(' ') + '`';
  if (result.error !== null) throw new GitUnavailable(`Git did not run ${shown}: ${result.error}`);
  if (result.status === null || !allowed.includes(result.status))
    throw new GitUnavailable(`${shown} failed with exit code ${result.status}: ` +
      (result.stderr.trim().slice(0, 2000) || 'Git gave no message.'));
  return result;
}

function oneLine(result: GitResult, what: string): string {
  const output = result.stdout.toString('utf8');
  if (!/^[^\n]+\n$/.test(output)) throw unexpected(what, output);
  return output.slice(0, -1);
}

// The folder of the target in the work tree: '' for the top folder, or a path that ends with '/'.
function targetPrefix(result: GitResult): string {
  const output = result.stdout.toString('utf8');
  const lineEnd = output.indexOf('\n');
  const [inside, prefix] = [output.slice(0, lineEnd), output.slice(lineEnd + 1, -1)];
  if (inside === 'false') throw new GitUnavailable('The target folder is not in the work tree of a Git repository.');
  if (lineEnd < 0 || inside !== 'true' || !output.endsWith('\n') || (prefix !== '' && !prefix.endsWith('/')))
    throw unexpected('work tree answer', output);
  return prefix;
}

// The files and submodules of the commit in the target folder, by their path relative to that folder.
function treeEntries(output: Buffer, prefix: string, idLength: number): Map<string, TreeEntry> {
  const listing = output.toString('utf8');
  if (listing !== '' && !listing.endsWith('\0')) throw unexpected('tree listing', listing);
  const entries = new Map<string, TreeEntry>();
  for (const line of listing === '' ? [] : listing.slice(0, -1).split('\0')) {
    const [, type = '', id = '', path = ''] = treeEntry.exec(line) ?? [];
    const relative = path.slice(prefix.length);
    if (id.length !== idLength || !path.startsWith(prefix) || relative === '' || entries.has(relative))
      throw unexpected('tree entry', line);
    entries.set(relative, { type, id });
  }
  return entries;
}

// The Git object ID of a file content: the hash of "blob <size>", a NUL byte and the content.
const blobId = (bytes: Buffer, format: ObjectFormat): string =>
  createHash(format).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function localChanges(entries: Map<string, TreeEntry>, { snapshot, exclusions }: GitIdentityInput,
  format: ObjectFormat): LocalChanges {
  const submodules = [...entries].filter(([, entry]) => entry.type === 'commit').map(([path]) => path);
  const inSubmodule = (path: string): boolean => submodules.some(folder => path.startsWith(folder + '/'));
  const changes: LocalChanges = { changed: [], notInCommit: [], notInSnapshot: [], outsideCaptureScope: [], submodules };
  for (const path of snapshot.paths.filter(path => !inSubmodule(path))) {
    const entry = entries.get(path);
    if (entry === undefined) changes.notInCommit.push(path);
    else if (entry.type !== 'blob' || blobId(snapshot.read(path), format) !== entry.id) changes.changed.push(path);
  }
  const captured = new Set(snapshot.paths);
  for (const [path, entry] of entries) {
    if (entry.type !== 'blob' || captured.has(path)) continue;
    if (exclusions.readable && exclusions.excludes(path)) changes.outsideCaptureScope.push(path);
    else changes.notInSnapshot.push(path);
  }
  for (const paths of Object.values(changes)) paths.sort();
  return changes;
}

function limits(exclusions: CaptureExclusions): string[] {
  return [
    'Git read the target folder after the copy. If the target folder changed during the capture, this record can ' +
      'differ from the snapshot.',
    'The record names the commit, the branch and the local changes. It does not record the history.',
    'A file is changed when the Git object ID of its snapshot content differs from the commit. A Git filter, such as ' +
      'line-ending conversion or Git LFS, can make a file look changed. File modes, such as the executable bit, are ' +
      'not compared.',
    'Git ignore rules do not set the capture scope, so notInCommit can list files that Git ignores.',
    'Each submodule is listed by its path. The files in a submodule are not compared.',
    exclusions.readable
      ? 'The commit files that the capture exclusions leave out are in outsideCaptureScope. They are not compared, ' +
        'and they do not count as deleted.'
      : `The capture exclusions have a rule that Choom does not read: ${JSON.stringify(exclusions.rule)}. So ` +
        'notInSnapshot can list a commit file that the capture exclusions left out, not only a file that was deleted ' +
        'in the target folder.',
  ];
}

function notAvailable(snapshotRef: string, gitVersion: string | null, reason: string): GitIdentityRecord {
  return { formatVersion: 1, snapshotRef, status: 'not-available', gitVersion, reason,
    gaps: [{ kind: 'git-unavailable', subjectRefs: [snapshotRef], reason: 'Git evidence is not available, so the ' +
      'commit, the branch and the local changes of the snapshot are unknown. ' + reason }] };
}

// The Git identity record of the snapshot. When Git refuses a command or gives
// an unexpected answer, the record says that Git evidence is not available,
// with the reason and a gap, and the capture continues.
export function gitIdentity(runGit: RunGit, input: GitIdentityInput): GitIdentityRecord {
  const call = { target: input.target, env: gitEnvironment(input.environment) };
  const { snapshotRef } = input.snapshot;
  let gitVersion: string | null = null;
  try {
    gitVersion = oneLine(readGit(runGit, call, ['version']), 'version');
    const prefix = targetPrefix(readGit(runGit, call, ['rev-parse', '--is-inside-work-tree', '--show-prefix']));
    const commit = oneLine(readGit(runGit, call, ['rev-parse', '--verify', 'HEAD^{commit}']), 'commit ID');
    if (!objectId.test(commit)) throw unexpected('commit ID', commit);
    const head = readGit(runGit, call, ['symbolic-ref', '-q', 'HEAD'], [0, 1]);
    const ref = head.status === 0 ? oneLine(head, 'branch') : null;
    const branch = ref?.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
    const objectFormat = commit.length === 40 ? 'sha1' : 'sha256';
    const entries = treeEntries(readGit(runGit, call, ['ls-tree', '-r', '-z', '--full-name', commit]).stdout, prefix,
      commit.length);
    return { formatVersion: 1, snapshotRef, status: 'available', gitVersion, commit, objectFormat, branch,
      targetPrefix: prefix, localChanges: localChanges(entries, input, objectFormat), limits: limits(input.exclusions), gaps: [] };
  } catch (error) {
    if (!(error instanceof GitUnavailable)) throw error;
    return notAvailable(snapshotRef, gitVersion, error.message);
  }
}

// The discovery gaps that Stage 1 finish adds from the saved Git identity record:
// the git-unavailable gap when Git evidence is not available, and none when it is.
export function gitIdentityGaps(record: unknown, snapshotRef: string): DiscoveryGap[] {
  const gaps: unknown = object(record) ? record.gaps : undefined;
  const kinds = Array.isArray(gaps) ? gaps.map(gap => object(gap) ? gap.kind : undefined) : undefined;
  assert(object(record) && record.formatVersion === 1 && record.snapshotRef === snapshotRef && Array.isArray(gaps) &&
    ((record.status === 'available' && kinds?.length === 0) ||
      (record.status === 'not-available' && kinds?.length === 1 && kinds[0] === 'git-unavailable')),
  `The Git identity record ${gitIdentityPath} is not valid. Start a new run.`);
  return stageOneGaps.fromRecord({ ...gitIdentityTool, gaps });
}
