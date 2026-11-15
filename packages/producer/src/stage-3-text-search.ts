import type { RipgrepRun } from './ripgrep.ts';
import { assert, type Fields, hash, object } from './record-checks.ts';
import { captureExclusionRules } from './stage-1-exclusions.ts';
import { checkIndexedSource, type IndexedFile, type RegisteredArtifact, safePath, type StageState } from './stage-3-inputs.ts';

// The Stage 3 text search: ripgrep searches the text of the saved snapshot, and the
// helper saves one tool-call record for each search. The record names the query,
// the ripgrep version and arguments, the searched scope, the limits, the outcome,
// the matches and the digests of the raw output, as the design asks for each
// tool-call record. A search with no match records its scope in the same way.
export interface TextQuery { text: string; kind: 'fixed-string' | 'pattern' }
export interface TextMatch { path: string; sha256: string; line: number; text: string; truncated: boolean; validUtf8: boolean }
export interface TextSearch { matches: TextMatch[]; matchedLines: number; searchedFiles: number; filesAtMatchLimit: string[] }
export type TextSearchOutcome = 'match' | 'no-match' | 'truncated';
// The tool fields that Stage 3 start records in its tool versions.
export interface RipgrepTool { version: string; program: string; sha256: string }
export interface CaptureExclusions { ref: string; path: string; sha256: string; rules: string[] }
export interface SearchScope {
  root: unknown; inventoryRef: unknown; indexedRegularFiles: number; searchedFiles: number; symbolicLinks: number;
  captureExclusions: CaptureExclusions;
}
export interface TextSearchInput {
  attemptId: string; snapshotRef: unknown; query: TextQuery; tool: RipgrepTool; args: string[]; exitCode: number | null;
  scope: SearchScope; search: TextSearch; output: { stdout: string; stdoutSha256: string; stderr: string; stderrSha256: string };
}
interface RipgrepMessage { type: string; data: Fields }

// The bounds of one search. ripgrep stops each file at maxMatchesPerFile matching
// lines; the record keeps the first maxMatches matches and cuts each line at
// maxLineCodeUnits UTF-16 code units.
export const textSearchLimits = {
  maxMatchesPerFile: 20, maxMatches: 200, maxLineCodeUnits: 4096, maxOutputBytes: 16 * 1024 * 1024, timeoutMs: 120_000,
} as const;
export type TextSearchLimits = typeof textSearchLimits;
const maxQueryLength = 1000;

// The operator's query: the text, then --pattern for a ripgrep pattern.
export function textQuery(args: readonly string[]): TextQuery {
  const [text = ''] = args;
  assert(text.length >= 1 && text.length <= maxQueryLength && !/[\u0000-\u001f\u007f]/.test(text),
    'Use a search text of 1 to ' + maxQueryLength + ' characters without line breaks or other control characters.');
  return { text, kind: args[1] === '--pattern' ? 'pattern' : 'fixed-string' };
}

// ripgrep reads no configuration file, prints JSON, and searches every file below
// the snapshot root, also hidden files and files that ignore files name. It does
// not follow symbolic links and does not decompress files; these are its defaults,
// and the arguments say so. --sort=path makes the order of the matches fixed. The
// query is the value of --regexp, so a query that starts with a dash is not an option.
export function ripgrepArgs(query: TextQuery, snapshotRoot: string): string[] {
  return ['--no-config', '--json', '--hidden', '--no-ignore', '--no-follow', '--no-search-zip', '--case-sensitive',
    '--line-number', '--sort=path', '--max-count=' + textSearchLimits.maxMatchesPerFile,
    ...(query.kind === 'fixed-string' ? ['--fixed-strings'] : []), '--regexp=' + query.text, '--', snapshotRoot];
}

function messages(stdout: string): RipgrepMessage[] {
  return stdout.split('\n').filter(line => line !== '').map((line, index) => {
    let value: unknown;
    try { value = JSON.parse(line); } catch { value = undefined; }
    assert(object(value) && typeof value.type === 'string' && object(value.data),
      'Ripgrep printed an unexpected line ' + (index + 1) + '.');
    return value as unknown as RipgrepMessage;
  });
}

// ripgrep gives a path or a line as text when it is valid UTF-8, and otherwise as base64 bytes.
function decoded(value: unknown): { text: string; validUtf8: boolean } {
  const { text, bytes } = (object(value) ? value : {}) as { text?: unknown; bytes?: unknown };
  if (typeof text === 'string') return { text, validUtf8: true };
  assert(typeof bytes === 'string', 'Ripgrep printed a path or a line without text.');
  return { text: Buffer.from(bytes, 'base64').toString('utf8'), validUtf8: false };
}

function indexedFile(value: unknown, root: string, files: ReadonlyMap<string, IndexedFile>): IndexedFile {
  const { text, validUtf8 } = decoded(value);
  const inside = text.startsWith(root + '/');
  const path = inside ? text.slice(root.length + 1) : text;
  const file = inside && validUtf8 && safePath(path) ? files.get(path) : undefined;
  assert(file?.kind === 'file', 'Ripgrep matched a path that is not an indexed regular file: ' + path);
  return file;
}

// The line without its line ending, cut at the limit but not inside a surrogate pair.
function lineText(value: unknown, limit: number): Pick<TextMatch, 'text' | 'truncated' | 'validUtf8'> {
  const { text, validUtf8 } = decoded(value);
  const line = text.replace(/\r?\n$/, '');
  if (line.length <= limit) return { text: line, truncated: false, validUtf8 };
  const high = line.charCodeAt(limit - 1);
  return { text: line.slice(0, high >= 0xd800 && high <= 0xdbff ? limit - 1 : limit), truncated: true, validUtf8 };
}

function addMatch(search: TextSearch, data: Fields, root: string, files: ReadonlyMap<string, IndexedFile>,
  limits: TextSearchLimits): void {
  const file = indexedFile(data.path, root, files);
  const line = data.line_number;
  assert(typeof line === 'number' && Number.isSafeInteger(line) && line >= 1, 'Ripgrep printed a match without a line number.');
  search.matchedLines += 1;
  if (search.matches.length < limits.maxMatches)
    search.matches.push({ path: file.path, sha256: file.sha256, line, ...lineText(data.lines, limits.maxLineCodeUnits) });
}

// The matches of ripgrep --json output. Each match must be in an indexed regular file.
export function parseRipgrepJson(stdout: string, root: string, files: ReadonlyMap<string, IndexedFile>,
  limits: TextSearchLimits = textSearchLimits): TextSearch {
  const all = messages(stdout);
  const summary = all.at(-1);
  assert(summary?.type === 'summary' && all.filter(({ type }) => type === 'summary').length === 1,
    'Ripgrep output has no summary.');
  const search: TextSearch = { matches: [], matchedLines: 0, searchedFiles: 0, filesAtMatchLimit: [] };
  for (const { type, data } of all.slice(0, -1)) {
    if (type === 'match') addMatch(search, data, root, files, limits);
    else if (type === 'end') {
      const file = indexedFile(data.path, root, files);
      const stats = data.stats as Fields | undefined;
      if (Number(stats?.matched_lines) >= limits.maxMatchesPerFile) search.filesAtMatchLimit.push(file.path);
    } else assert(type === 'begin', 'Unexpected ripgrep message: ' + type);
  }
  const stats = summary.data.stats as Fields | undefined;
  assert(typeof stats?.searches === 'number' && Number.isSafeInteger(stats.searches) &&
    stats.matched_lines === search.matchedLines, 'The ripgrep summary does not match its output.');
  search.searchedFiles = stats.searches;
  return search;
}

// A partial list cannot show that a text is absent, so a cut list is truncated.
export function searchOutcome(search: TextSearch): TextSearchOutcome {
  if (search.matchedLines > search.matches.length || search.filesAtMatchLimit.length > 0) return 'truncated';
  return search.matchedLines > 0 ? 'match' : 'no-match';
}

function checkRun({ exitCode, signal, errorCode, errorMessage, stderr }: RipgrepRun, limits: TextSearchLimits): void {
  assert(errorCode !== 'ENOBUFS', 'Ripgrep output exceeds ' + limits.maxOutputBytes / 1024 / 1024 + ' MiB. ' +
    'Search for a longer text or a narrower pattern.');
  assert(errorCode !== 'ETIMEDOUT', 'Ripgrep did not finish in ' + limits.timeoutMs / 1000 + ' seconds.');
  assert(errorMessage === null, 'Cannot run ripgrep: ' + errorMessage);
  assert(signal === null, 'Ripgrep stopped with signal ' + signal + '.');
  assert(exitCode === 0 || exitCode === 1,
    'Ripgrep failed with exit code ' + exitCode + ': ' + stderr.toString('utf8').trim().slice(0, 500));
}

// The checked result of a ripgrep run: exit code 0 with matches, or 1 without.
export function ripgrepResult(run: RipgrepRun, root: string, files: ReadonlyMap<string, IndexedFile>,
  limits: TextSearchLimits = textSearchLimits): TextSearch {
  checkRun(run, limits);
  const search = parseRipgrepJson(run.stdout.toString('utf8'), root, files, limits);
  assert((run.exitCode === 0) === (search.matchedLines > 0), 'Ripgrep exit code ' + run.exitCode + ' does not match its output.');
  return search;
}

// The capture exclusion rules that run.yaml names and Stage 1 registered.
export function captureExclusions(state: StageState): CaptureExclusions {
  const path = state.snapshotRecord.exclusions;
  const records = [...state.artifacts.values()].filter(record => record.path === path);
  assert(safePath(path) && records.length === 1, 'The run names no registered capture exclusion rules (snapshot.exclusions in run.yaml).');
  const record = records[0] as RegisteredArtifact;
  return { ref: record.ref, path, sha256: hash(record.bytes), rules: captureExclusionRules(record.bytes.toString('utf8')) };
}

// The searched scope. ripgrep must have searched as many files as the inventory
// lists, and each indexed file must still have its inventory digest after the search.
export function searchScope(state: StageState, searchedFiles: number, exclusions: CaptureExclusions): SearchScope {
  const regular = [...state.files.values()].filter(file => file.kind === 'file');
  assert(searchedFiles === regular.length, 'Ripgrep searched ' + searchedFiles + ' files, but the inventory lists ' +
    regular.length + ' regular files. The snapshot does not match its inventory.');
  for (const file of regular) checkIndexedSource(state, file.path);
  return { root: state.snapshotRecord.root, inventoryRef: state.facts.inventoryRef, indexedRegularFiles: regular.length,
    searchedFiles, symbolicLinks: state.files.size - regular.length, captureExclusions: exclusions };
}

const { maxMatchesPerFile, maxMatches, maxLineCodeUnits } = textSearchLimits;
// What each search covers and what it does not, in the words of the record.
export const textSearchNotes = [
  'ripgrep searched every regular file below the snapshot root, also hidden files and files that ignore files such as ' +
    '.gitignore name (--hidden --no-ignore). The capture exclusions decided which files the snapshot holds.',
  'ripgrep does not follow symbolic links and does not decompress files (its defaults; --no-follow --no-search-zip). ' +
    'scope.symbolicLinks counts the symbolic links that the inventory lists; their targets were not searched.',
  'ripgrep stops reading a file at its first NUL byte and reports no match in it (its rule for binary files).',
  'The match is case-sensitive and does not span lines. A fixed-string query matches its text exactly; a pattern ' +
    'uses the ripgrep regular expression syntax. ripgrep reads UTF-8, and UTF-16 with a byte order mark. ' +
    'A line that is not valid UTF-8 has U+FFFD in place of each invalid byte (validUtf8: false).',
  'At most ' + maxMatchesPerFile + ' matching lines per file and ' + maxMatches + ' matches in the record. A file with ' +
    maxMatchesPerFile + ' matching lines can have more; the outcome is then truncated, and a truncated list is partial.',
  'A line longer than ' + maxLineCodeUnits + ' UTF-16 code units is cut, and the match can be after the cut (truncated: true).',
  'A no-match outcome covers only this query and this scope. A text match is not a resolved reference, an import or a use.',
];

// The tool-call record of one search.
export function textSearchRecord({ attemptId, snapshotRef, query, tool, args, exitCode, scope, search, output }:
TextSearchInput): Fields {
  return {
    formatVersion: 1, attemptId, snapshotRef, status: 'completed', outcome: searchOutcome(search), query,
    tool: { name: 'ripgrep', ...tool, arguments: args, removedEnvironment: ['RIPGREP_CONFIG_PATH'], exitCode },
    scope, limits: textSearchLimits, matchedLines: search.matchedLines, matches: search.matches,
    filesAtMatchLimit: search.filesAtMatchLimit, output, notes: textSearchNotes,
  };
}
