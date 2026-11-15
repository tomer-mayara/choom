import { isDeepStrictEqual } from 'node:util';
import { assert, type Fields } from './record-checks.ts';
import { type ScanFile, syntaxCandidates, syntaxLimits, type SyntaxTools } from './stage-5-syntax.ts';

// The evidence that Stage 5 collect saves from the checked run state: the
// owner-null units with their graph and syntax references, the reviewed ranges of
// every mapped file, the syntax candidates and the first excerpts. The query scope
// is fixed at start, and every action reads indexed files through checked reads.
export interface IndexedFile { path: string; kind: string; bytes: number; sha256: string }
// A selected entry analysis, or one of its saved predecessors.
export interface EntryAnalysis { ref: string; analysis: Fields }
export interface QueryState {
  header: { formatVersion: number; attemptId: string; runRef: unknown; snapshotRef: unknown };
  indexed: Map<string, IndexedFile>;
  // The folder of the saved snapshot.
  snapshotRoot: string;
  mapping: Fields; mappingRef: string;
  graph: Fields; graphRef: string;
  sourceSites: Fields; sourceSitesRef: string;
  entryChain: EntryAnalysis[];
  // The checked bytes of an indexed file of at most maxBytes.
  readIndexed(path: string, maxBytes: number): Buffer;
}
export interface SavedScope { syntaxScope: ScanFile[]; initialExcerpts: { path: string; first: number; last: number; indexed: boolean }[] }
interface Edge { id: unknown; from: string; to: string; specifier: unknown; dynamic: unknown; targetKind: string }
interface ReviewedFile { id: string; path: string; sha256: string; snapshotRef: unknown; lines: [number, number] }

const excerptLimits = { lines: 300, outputBytes: 100 * 1024, inputBytes: 2 * 1024 * 1024 };
const initialExcerptLimit = 20;
const focusName = /(?:^|\/)(?:README(?:\.[^/]+)?|package\.json|component\.ya?ml|tsconfig(?:\.[^/]+)?\.json|bunfig\.toml|(?:vitest|jest|cucumber)(?:\.config)?\.[cm]?[jt]s|(?:setup|preload|global-setup)\.[cm]?[jt]sx?)$/i;
const importKinds = ['import', 're-export', 'dynamic-import', 'import-equals', 'import-type', 'require-candidate',
  'require-resolve-candidate'];

function textLines(bytes: Buffer, path: string): string[] {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text).equals(bytes), 'Not UTF-8 text: ' + path);
  const lines = text ? text.split(/\r\n|\r|\n/) : [];
  if (/[\r\n]$/.test(text)) lines.pop();
  return lines;
}

function graphScope(state: QueryState): ScanFile[] {
  const scope = new Map<string, ScanFile>();
  for (const [index, context] of (state.graph.contexts as Fields[]).entries()) {
    assert(Array.isArray(context.scanFiles), 'Missing saved graph scan scope: ' + context.id);
    const contextRef = state.graphRef + '#/contexts/' + index;
    for (const path of new Set(context.scanFiles as string[])) {
      const file = state.indexed.get(path);
      assert(file, 'Saved graph scan file is not indexed: ' + path);
      if (!scope.has(path)) scope.set(path, { path, sha256: file.sha256, contextRefs: [] });
      scope.get(path)?.contextRefs.push(contextRef);
    }
  }
  return [...scope.values()].sort((left, right) => left.path < right.path ? -1 : Number(left.path > right.path));
}

export function scopeFor(state: QueryState): SavedScope & Fields {
  const focus = [...state.indexed.keys()].filter(path => focusName.test(path)).sort();
  return {
    ...state.header,
    mappingRef: state.mappingRef,
    graphRef: state.graphRef,
    sourceSitesRef: state.sourceSitesRef,
    selectedEntryAnalysisRef: (state.entryChain[0] as EntryAnalysis).ref,
    historicalEntryAnalysisRefs: state.entryChain.slice(1).map(item => item.ref),
    syntaxScope: graphScope(state),
    initialExcerpts: focus.slice(0, initialExcerptLimit).map(path => ({ path, first: 1, last: 200, indexed: true })),
    initialExcerptSelection: { method: 'bounded filename conventions, sorted by snapshot-relative path',
      limit: initialExcerptLimit, matched: focus.length, omittedPaths: focus.slice(initialExcerptLimit) },
    limits: { excerpt: excerptLimits, syntaxQuery: syntaxLimits },
  };
}

function pushTo<Value>(map: Map<string, Value[]>, key: string, value: Value): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)?.push(value);
}

// The saved import sites by path, and by path, literal specifier and dynamic flag.
function importSites(state: QueryState): { sites: Map<string, string[]>; bySpecifier: Map<string, string[]> } {
  const sites = new Map<string, string[]>();
  const bySpecifier = new Map<string, string[]>();
  for (const [index, site] of (state.sourceSites.sites as Fields[]).entries()) {
    if (!importKinds.includes(site.kind as string)) continue;
    const ref = state.sourceSitesRef + '#/sites/' + index;
    pushTo(sites, site.path as string, ref);
    if (typeof site.specifier !== 'string') continue;
    pushTo(bySpecifier, JSON.stringify([site.path, site.specifier, site.dynamic === true]), ref);
  }
  return { sites, bySpecifier };
}

// The saved graph edges of every context, by source file and by indexed internal target.
function graphEdges(state: QueryState, bySpecifier: Map<string, string[]>): { incoming: Map<string, Fields[]>; outgoing: Map<string, Fields[]> } {
  const incoming = new Map<string, Fields[]>();
  const outgoing = new Map<string, Fields[]>();
  for (const [contextIndex, context] of (state.graph.contexts as Fields[]).entries()) {
    const contextRef = state.graphRef + '#/contexts/' + contextIndex;
    assert(Array.isArray(context.edges), 'Missing saved edges for graph context: ' + context.id);
    const stopped = new Set((context.reachability as Fields | undefined)?.stoppedEdges as unknown[] | undefined ?? []);
    for (const [edgeIndex, edge] of (context.edges as Edge[]).entries()) {
      const evidence = {
        contextRef,
        edgeRef: contextRef + '/edges/' + edgeIndex,
        targetKind: edge.targetKind,
        stoppedInTraversal: stopped.has(edge.id),
        sourceSiteRefs: bySpecifier.get(JSON.stringify([edge.from, edge.specifier, edge.dynamic === true])) ?? [],
      };
      pushTo(outgoing, edge.from, evidence);
      if (['internal', 'context-boundary'].includes(edge.targetKind) && state.indexed.has(edge.to))
        pushTo(incoming, edge.to, evidence);
    }
  }
  return { incoming, outgoing };
}

function remainingUnits(state: QueryState): Fields {
  const { sites, bySpecifier } = importSites(state);
  const candidates = new Map<string, string[]>();
  const selected = state.entryChain[0] as EntryAnalysis;
  for (const [index, candidate] of (selected.analysis.candidates as Fields[]).entries())
    if (candidate.path !== null) pushTo(candidates, candidate.path as string, selected.ref + '#/candidates/' + index);
  const { incoming, outgoing } = graphEdges(state, bySpecifier);
  return {
    ...state.header,
    codeMappingRef: state.mappingRef,
    graphRef: state.graphRef,
    sourceSitesRef: state.sourceSitesRef,
    entryAnalysisRef: selected.ref,
    units: (state.mapping.units as Fields[]).flatMap((unit, index) => unit.owner !== null ? [] : [{
      path: unit.path,
      sha256: unit.sha256,
      roles: unit.roles,
      mappingRef: state.mappingRef + '#/units/' + index,
      entryCandidateRefs: candidates.get(unit.path as string) ?? [],
      sourceSiteRefs: sites.get(unit.path as string) ?? [],
      incomingEdges: incoming.get(unit.path as string) ?? [],
      outgoingEdges: outgoing.get(unit.path as string) ?? [],
    }]),
    limits: [
      'Includes every owner-null mapped file, including documents, test inputs, and assets.',
      'Incoming references include indexed internal and context-boundary targets. The traversal flag shows whether the saved context recorded that edge as stopped. Outgoing references retain unresolved and external edges.',
      'Syntax pointers match the saved source path, literal specifier, and dynamic flag. They do not resolve a binding.',
      'Contexts remain separate. No new resolution, traversal, ownership, or unused-code decision was made.',
      'An empty edge list describes the saved graph evidence. It does not prove no references exist.',
    ],
  };
}

function rangeCoverage(ranges: [number, number][], total: number | undefined): string {
  let end = 0;
  for (const [first, last] of [...ranges].sort(([left], [right]) => left - right)) {
    if (first > end + 1) return 'partial';
    end = Math.max(end, last);
  }
  return end === total ? 'complete' : 'partial';
}

// The saved review ranges of the selected entry analysis and of its predecessors, by path.
function reviewedRanges(state: QueryState): { current: Map<string, Fields[]>; history: Map<string, Fields[]>; sourceCounts: Map<string, number> } {
  const current = new Map<string, Fields[]>();
  const history = new Map<string, Fields[]>();
  const sourceCounts = new Map<string, number>();
  for (const [position, { ref, analysis }] of state.entryChain.entries()) {
    for (const [index, record] of (analysis.reviewedFiles as (ReviewedFile | null | undefined)[]).entries()) {
      const file = state.indexed.get(record?.path as string);
      assert(file && file.sha256 === record?.sha256 && record.snapshotRef === state.header.snapshotRef &&
        typeof record.id === 'string' && Array.isArray(record.lines) && record.lines.length === 2 &&
        record.lines.every(Number.isSafeInteger) && record.lines[0] >= 1 && record.lines[1] >= record.lines[0],
      'Invalid saved source review range: ' + record?.id);
      if (!sourceCounts.has(record.path)) {
        const text = state.readIndexed(record.path, excerptLimits.inputBytes);
        sourceCounts.set(record.path, textLines(text, record.path).length);
      }
      assert(record.lines[1] <= (sourceCounts.get(record.path) as number), 'Saved review range exceeds file: ' + record.path);
      const evidence = { sourceRef: record.id, recordRef: ref + '#/reviewedFiles/' + index, lines: record.lines };
      if (position === 0) pushTo(current, record.path, evidence);
      else pushTo(history, record.path, { analysisRef: ref, ...evidence });
    }
  }
  return { current, history, sourceCounts };
}

function inspectionCoverage(state: QueryState): Fields {
  const { current, history, sourceCounts } = reviewedRanges(state);
  return {
    ...state.header,
    codeMappingRef: state.mappingRef,
    selectedEntryAnalysisRef: (state.entryChain[0] as EntryAnalysis).ref,
    historicalEntryAnalysisRefs: state.entryChain.slice(1).map(item => item.ref),
    units: (state.mapping.units as Fields[]).map((unit, index) => {
      const ranges = current.get(unit.path as string) ?? [];
      return {
        path: unit.path, sha256: unit.sha256, owner: unit.owner,
        mappingRef: state.mappingRef + '#/units/' + index,
        current: {
          status: ranges.length ? rangeCoverage(ranges.map(record => record.lines as [number, number]),
            sourceCounts.get(unit.path as string)) : 'unreviewed',
          ranges,
        },
        historicalRanges: history.get(unit.path as string) ?? [],
      };
    }),
    limits: [
      'Current ranges come only from the selected Stage 4 entry analysis. Historical ranges follow its saved predecessor chain.',
      'Complete means the union of listed ranges covers the saved file text. It does not establish comprehension, runtime execution, or compliance.',
      'File hashing and graph or syntax parsing are tool reads. They do not count as saved LLM source inspection.',
    ],
  };
}

export function excerpt(state: QueryState, path: string, first: number, last: number, { focusRange = false } = {}): Fields {
  assert(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first >= 1 && last >= first &&
    last - first + 1 <= excerptLimits.lines, 'Use an inclusive range of at most 300 lines.');
  const file = state.indexed.get(path);
  assert(file, 'File is outside the inventory: ' + path);
  const all = textLines(state.readIndexed(path, excerptLimits.inputBytes), path);
  assert(first <= all.length && (focusRange || last <= all.length), 'Range exceeds saved file: ' + path);
  const end = Math.min(last, all.length);
  const lines: string[] = [];
  let byteCount = 0;
  for (let line = first; line <= end; line++) {
    const value = line + ': ' + all[line - 1];
    const size = Buffer.byteLength(value) + Number(lines.length > 0);
    if (byteCount + size > excerptLimits.outputBytes) {
      assert(focusRange, 'Excerpt exceeds 100 KiB: ' + path);
      break;
    }
    lines.push(value);
    byteCount += size;
  }
  assert(lines.length > 0, 'No complete line fits the excerpt budget: ' + path);
  const savedEnd = first + lines.length - 1;
  return {
    snapshotRef: state.header.snapshotRef, path, sha256: file.sha256,
    lines: [first, savedEnd], totalLines: all.length, excerpt: lines.join('\n'),
    truncated: first > 1 || savedEnd < all.length,
    omittedRanges: [[1, first - 1], [savedEnd + 1, all.length]].filter(([from, to]) => (from as number) <= (to as number)),
    limit: 'Saving an excerpt records a tool read only.',
  };
}

function initialExcerpts(state: QueryState, scope: SavedScope): Fields {
  const excerpts: Fields[] = [];
  const skipped: Fields[] = [];
  for (const { path, first, last, indexed } of scope.initialExcerpts) {
    if (!indexed) { skipped.push({ path, lines: [first, last], reason: 'not-indexed' }); continue; }
    if ((state.indexed.get(path) as IndexedFile).bytes > excerptLimits.inputBytes) {
      skipped.push({ path, lines: [first, last], reason: 'input-byte-limit' }); continue;
    }
    try {
      excerpts.push({ id: state.header.attemptId + '-source-' + encodeURIComponent(path),
        ...excerpt(state, path, first, last, { focusRange: true }) });
    } catch (error) {
      // Integrity errors abort the action. A bounded or non-text input is a recorded gap.
      if (!/^(Not UTF-8 text|Range exceeds saved file|No complete line fits)/.test((error as Error).message)) throw error;
      skipped.push({ path, lines: [first, last], reason: (error as Error).message });
    }
  }
  return { ...state.header, excerpts, skipped, limits: excerptLimits };
}

export function collectEvidence(state: QueryState, savedScope: SavedScope, tools: SyntaxTools): Record<string, Fields> {
  assert(isDeepStrictEqual(scopeFor(state), savedScope), 'Stage 5 scope changed after start.');
  return {
    'remaining-units.json': remainingUnits(state),
    'inspection-coverage.json': inspectionCoverage(state),
    'source-candidates.json': syntaxCandidates(state, savedScope, tools),
    'source-excerpts.json': initialExcerpts(state, savedScope),
  };
}
