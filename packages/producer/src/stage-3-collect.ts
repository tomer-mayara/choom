import { dirname, join } from 'node:path';
import type { ts as TypeScript } from 'ts-morph';
import { assert, type Fields } from './record-checks.ts';
import { openSnapshotProject, type ProjectSettings, type ProjectTools } from './snapshot-project.ts';
import { type Excerpt, numberedExcerpt, type RegisteredArtifact, safePath, type StageState } from './stage-3-inputs.ts';

// The evidence that Stage 3 collect saves: the loading syntax search of every
// indexed JavaScript and TypeScript file, the identifier mentions of the exports
// and types that Knip reported, and the first excerpts of the focused paths.
type Ts = typeof TypeScript;
export type Output = (name: string, value: unknown) => void;
// ts-morph, with the TypeScript that the loading search uses, and the tool versions to record.
export interface CollectTools { tsMorph: ProjectTools; versions: unknown }
interface Target {
  reportedFile: string; name: string; issueKinds: string[]; reportRefs: string[]; mentions: Fields[]; mentionCount: number;
}
interface ReportSummary { mode: unknown; status: unknown; exitCode: unknown; reportRef: string | null }
interface LoadingMatch { path: string; sha256: string; kind: string; lines: number[]; expression: string; truncated: boolean }
interface Scan { scope: { path: string; sha256: string }[]; matches: LoadingMatch[]; diagnostics: Fields[] }
interface MissingPath { path: string; status: 'skipped'; reason: string }
interface Member { receiver: TypeScript.Expression | undefined; property: string | undefined }

const initialExcerptLimit = 20;
// The JavaScript and TypeScript source files of the loading search and the exports action.
export const sourceExtensions = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const processes = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync']);
const constructors = ['Worker', 'SharedWorker', 'URL', 'Glob', 'Function'];
const mentionLimit = 250;
const expressionLimit = 4096;
// The loading search reads syntax only. Without compiler settings, TypeScript parses at the latest language level.
const syntaxOnly: ProjectSettings = { ref: null, configPath: null, files: [], compilerOptions: {} };

// Adds the exports and types of one Knip issue record to the reported symbols.
function addReportedSymbols(targets: Map<string, Target>, issue: Fields, report: RegisteredArtifact): void {
  for (const kind of ['exports', 'types']) {
    if (!Object.hasOwn(issue, kind)) continue;
    assert(Array.isArray(issue[kind]), 'Invalid Knip issue category: ' + kind);
    for (const { name } of issue[kind] as { name: unknown }[]) {
      assert(typeof name === 'string' && name.length > 0, 'Invalid reported symbol name.');
      const key = JSON.stringify([issue.file, name]);
      if (!targets.has(key)) targets.set(key, {
        reportedFile: issue.file as string, name, issueKinds: [], reportRefs: [], mentions: [], mentionCount: 0,
      });
      const target = targets.get(key) as Target;
      if (!target.issueKinds.includes(kind)) target.issueKinds.push(kind);
      if (!target.reportRefs.includes(report.ref)) target.reportRefs.push(report.ref);
    }
  }
}

// The two Knip modes of the selected runs, and the exports and types that completed modes reported.
function reportTargets(state: StageState): { reports: ReportSummary[]; targets: Target[] } {
  const runs = state.runs.runs as Fields[];
  assert(runs.length === 2, 'Expected recorded normal and production Knip modes.');
  const reports: ReportSummary[] = [];
  const targets = new Map<string, Target>();
  const modes = new Set<unknown>();
  for (const run of runs) {
    const { mode, status, stdout, exitCode } = run;
    assert(['normal', 'production'].includes(mode as string) && !modes.has(mode) &&
      ['completed', 'failed', 'skipped'].includes(status as string), 'Invalid Knip mode or status.');
    modes.add(mode);
    const summary: ReportSummary = { mode, status, exitCode: exitCode ?? null, reportRef: null };
    reports.push(summary);
    let report: RegisteredArtifact | undefined;
    if (stdout !== null && stdout !== undefined) {
      assert(safePath(stdout), 'Invalid raw Knip report path.');
      const path = join(dirname(state.runsArtifact.path), stdout);
      const records = [...state.artifacts.values()].filter(record => record.path === path);
      assert(records.length === 1, 'Expected one registered raw Knip report: ' + path);
      [report] = records;
      summary.reportRef = (report as RegisteredArtifact).ref;
    }
    if (status !== 'completed') continue;
    assert(report && [0, 1].includes(exitCode as number) && (run.report as Fields | null | undefined)?.valid === true,
      'Invalid completed Knip run: ' + mode);
    const { issues } = JSON.parse(report.bytes.toString()) as Fields;
    assert(Array.isArray(issues), 'Invalid Knip issues: ' + mode);
    for (const issue of issues as (Fields | null | undefined)[]) {
      assert(safePath(issue?.file), 'Invalid file in Knip issues: ' + mode);
      addReportedSymbols(targets, issue as Fields, report);
    }
  }
  return { reports, targets: [...targets.values()] };
}

// The receiver and the property name of a member callee, such as require and resolve
// in require.resolve() or require['resolve'](). An element name that is not a string
// literal has no property name.
function member(ts: Ts, callee: TypeScript.Expression): Member {
  if (ts.isPropertyAccessExpression(callee)) return { receiver: callee.expression, property: callee.name.text };
  if (ts.isElementAccessExpression(callee)) return { receiver: callee.expression,
    property: ts.isStringLiteral(callee.argumentExpression) ? callee.argumentExpression.text : undefined };
  return { receiver: undefined, property: undefined };
}

// The loading candidate kind of a call, or undefined.
function callKind(ts: Ts, node: TypeScript.CallExpression, name: string | undefined, { receiver, property }: Member):
string | undefined {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const first = node.arguments[0];
    return first && ts.isStringLiteralLike(first) ? 'import-literal' : 'import-computed';
  }
  if (name === 'require' && !property) return 'require';
  if (property === 'resolve' && receiver && ts.isIdentifier(receiver) && receiver.text === 'require')
    return 'require.resolve';
  if (property === 'glob' && receiver && ts.isMetaProperty(receiver) &&
    receiver.keywordToken === ts.SyntaxKind.ImportKeyword && receiver.name.text === 'meta')
    return 'import.meta.glob';
  if (processes.has(name as string) || name === 'eval') return name;
  if (property === 'scan' || property === 'register') return '.' + property;
}

// The loading candidate kind of a call or new expression, or undefined.
function candidate(ts: Ts, node: TypeScript.Node): string | undefined {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;
  const callee = node.expression;
  const found = member(ts, callee);
  const name = ts.isIdentifier(callee) ? callee.text : found.property;
  if (ts.isNewExpression(node)) return constructors.includes(name as string) ? 'new ' + name : undefined;
  return callKind(ts, node, name, found);
}

function location(source: TypeScript.SourceFile, pos: number): { line: number; column: number } {
  const { line, character } = source.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, column: character + 1 };
}

// Parses each selected file once with the snapshot project and collects its loading
// candidates, its parser diagnostics and the identifier mentions of the reported symbols.
function scanSources(state: StageState, tsMorph: ProjectTools, targetsByName: Map<string, Target[]>): Scan {
  const { ts } = tsMorph;
  const scan: Scan = { scope: [], matches: [], diagnostics: [] };
  const project = openSnapshotProject({ files: [...state.files.values()], snapshotRoot: state.facts.snapshot.path },
    syntaxOnly, tsMorph);
  const paths = [...state.files.keys()].filter(path => state.files.get(path)?.kind === 'file' &&
    sourceExtensions.test(path)).sort();
  for (const path of paths) {
    const { sha256 } = state.files.get(path) as { sha256: string };
    scan.scope.push({ path, sha256 });
    const file = project.sourceFile(path);
    const source = file.compilerNode;
    for (const diagnostic of (source as TypeScript.SourceFile & { parseDiagnostics: TypeScript.Diagnostic[] }).parseDiagnostics) {
      scan.diagnostics.push({
        path, code: diagnostic.code, at: location(source, diagnostic.start ?? 0),
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      });
    }

    function visit(node: TypeScript.Node): void {
      const kind = candidate(ts, node);
      if (kind) {
        const start = node.getStart(source);
        const expression = source.text.slice(start, Math.min(node.end, start + expressionLimit));
        const lines = [location(source, start).line, location(source, node.end - 1).line];
        scan.matches.push({ path, sha256, kind, lines, expression, truncated: expression.length < node.end - start });
      }
      if (ts.isIdentifier(node)) {
        for (const target of targetsByName.get(node.text) ?? []) {
          target.mentionCount++;
          if (target.mentions.length >= mentionLimit) continue;
          target.mentions.push({ path, sha256, nodeKind: 'Identifier', parentKind: ts.SyntaxKind[node.parent.kind],
            range: [location(source, node.getStart(source)), location(source, node.end)] });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    // Each file is read once, so the project does not keep it.
    file.forget();
  }
  return scan;
}

// The first 200 lines of each focused path: entry candidates, then loading matches,
// then reported files. At most 20 paths; the others are skipped with a reason.
function initialExcerpts(state: StageState, focusPaths: string[], id: string): { excerpts: Fields[]; missingPaths: MissingPath[] } {
  const excerpts: Fields[] = [];
  const missingPaths: MissingPath[] = [];
  for (const [index, path] of focusPaths.entries()) {
    if (index >= initialExcerptLimit) {
      missingPaths.push({ path, status: 'skipped', reason: 'Initial excerpt limit of ' + initialExcerptLimit + ' paths.' });
      continue;
    }
    if (state.files.get(path)?.kind !== 'file') {
      missingPaths.push({ path, status: 'skipped', reason: 'Not an indexed regular file.' });
      continue;
    }
    try {
      const value: Excerpt = numberedExcerpt(state, path, 1, 200, true);
      if (value.lines === null) missingPaths.push({ path, status: 'skipped', reason: 'Empty file or no line fits the initial excerpt byte limit.' });
      else excerpts.push({ id: id + '-source-' + encodeURIComponent(path), ...value });
    } catch (error) {
      const failure = error as NodeJS.ErrnoException;
      if (failure.code === 'EXCERPT_SOURCE_TOO_LARGE')
        missingPaths.push({ path, status: 'skipped', reason: failure.message });
      else if (failure.code === 'ERR_ENCODING_INVALID_ENCODED_DATA')
        missingPaths.push({ path, status: 'skipped', reason: 'The saved file is not UTF-8 text.' });
      else throw error;
    }
  }
  return { excerpts, missingPaths };
}

function symbolStatus(reports: ReportSummary[]): string {
  const completed = reports.filter(report => report.status === 'completed').length;
  return completed === reports.length ? 'completed' : completed > 0 ? 'partial'
    : reports.some(report => report.status === 'failed') ? 'unavailable' : 'skipped';
}

// Saves loading-search.json, symbol-mentions.json and source-excerpts.json, and returns the summary to print.
export function collect(state: StageState, { tsMorph, versions }: CollectTools, output: Output, id: string): string {
  const { reports, targets } = reportTargets(state);
  const targetsByName = new Map<string, Target[]>();
  for (const target of targets) {
    if (!targetsByName.has(target.name)) targetsByName.set(target.name, []);
    (targetsByName.get(target.name) as Target[]).push(target);
  }

  const { scope, matches, diagnostics } = scanSources(state, tsMorph, targetsByName);
  const { snapshotRef } = state.facts;
  const context = { formatVersion: 1, snapshotRef, scope };
  const limits = [
    'Tool content reads and syntactic candidates only. They do not record LLM source review.',
    'Syntax only: the snapshot project parses each file without compiler settings. No binding, alias or type resolution, ' +
      'config execution, or reachability analysis.',
    'Names can be shadowed. Computed expressions, templates and aliases are not resolved.',
    'Native code, excluded inputs and all files outside the recorded scope were outside the query.',
    'Parser recovery can affect matches in files with diagnostics. A completed no-match describes this query only.',
  ];
  output('loading-search.json', { ...context, status: 'completed', outcome: matches.length ? 'matches' : 'no-match',
    matches, diagnostics, limits,
    query: { profile: 'stage-3-loading-syntax-v3', parser: 'ts-morph snapshot project (TypeScript parser, Latest)',
      selection: 'all indexed regular files with a JavaScript or TypeScript source extension',
      extensions: sourceExtensions.source, maxExpressionCodeUnits: expressionLimit, versions,
      candidateKinds: ['import-literal', 'import-computed', 'require', 'require.resolve', 'import.meta.glob',
        ...constructors.map(name => 'new ' + name), ...processes, '.scan', '.register', 'eval'] } });

  output('symbol-mentions.json', { ...context, knipRunsRef: state.facts.knipRunsRef, status: symbolStatus(reports),
    reports, maxMentionsPerTarget: mentionLimit, parserDiagnosticsRef: id + '-file@' + encodeURIComponent('loading-search.json'),
    limits: [...limits,
      'Identifier name matches include declarations and unrelated names. They do not establish resolved references, file reachability, or proof of use.',
      'Only reported exports and types from completed modes are queried. Other issue categories are outside this query.'],
    targets: targets.map(target => ({ ...target, truncated: target.mentionCount > target.mentions.length })) });

  const focusPaths = [...new Set([
    ...(state.analysis.candidates as Fields[]).map(item => item.path).filter(path => typeof path === 'string'),
    ...matches.map(item => item.path), ...targets.map(item => item.reportedFile),
  ])] as string[];
  const { excerpts, missingPaths } = initialExcerpts(state, focusPaths, id);
  output('source-excerpts.json', { formatVersion: 1, snapshotRef, excerpts, missingPaths,
    limits: ['First 200 lines per indexed path, up to 100 KiB of numbered text from a UTF-8 file of at most 2 MiB. Saving an excerpt records a tool read only.',
      'At most 20 initial paths, in entry-candidate, loading-match, then reported-symbol order. Other paths require an excerpt request.'] });
  return `Parsed ${scope.length} files. Saved ${matches.length} loading candidates, ${diagnostics.length} parser diagnostics, ${targets.length} symbol targets and ${excerpts.length} excerpts. ${missingPaths.length} excerpt paths skipped.`;
}
