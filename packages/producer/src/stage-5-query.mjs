import { isDeepStrictEqual } from 'node:util';

export const excerptLimits = { lines: 300, outputBytes: 100 * 1024, inputBytes: 2 * 1024 * 1024 };
const queryLimits = { inputBytes: 2 * 1024 * 1024, perFile: 120, total: 2400, expressionChars: 400, diagnosticsPerFile: 50 };
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const registrationNames = new Set([
  'addEventListener', 'afterAll', 'afterEach', 'After', 'AfterAll', 'AfterStep',
  'beforeAll', 'beforeEach', 'Before', 'BeforeAll', 'BeforeStep', 'defineParameterType',
  'Given', 'listen', 'on', 'once', 'register', 'registerCommand', 'setDefaultTimeout',
  'setDefinitionFunctionWrapper', 'setWorldConstructor', 'setup', 'subscribe', 'Then', 'use', 'When',
]);
const initialExcerptLimit = 20;
const focusName = /(?:^|\/)(?:README(?:\.[^/]+)?|package\.json|component\.ya?ml|tsconfig(?:\.[^/]+)?\.json|bunfig\.toml|(?:vitest|jest|cucumber)(?:\.config)?\.[cm]?[jt]s|(?:setup|preload|global-setup)\.[cm]?[jt]sx?)$/i;

const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function textLines(bytes, path) {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text).equals(bytes), 'Not UTF-8 text: ' + path);
  const lines = text ? text.split(/\r\n|\r|\n/) : [];
  if (/[\r\n]$/.test(text)) lines.pop();
  return lines;
}

function graphScope(state) {
  const scope = new Map();
  for (const [index, context] of state.graph.contexts.entries()) {
    assert(Array.isArray(context.scanFiles), 'Missing saved graph scan scope: ' + context.id);
    const contextRef = state.graphRef + '#/contexts/' + index;
    for (const path of new Set(context.scanFiles)) {
      const file = state.indexed.get(path);
      assert(file, 'Saved graph scan file is not indexed: ' + path);
      if (!scope.has(path)) scope.set(path, { path, sha256: file.sha256, contextRefs: [] });
      scope.get(path).contextRefs.push(contextRef);
    }
  }
  return [...scope.values()].sort((left, right) => left.path < right.path ? -1 : Number(left.path > right.path));
}

export function scopeFor(state) {
  const focus = [...state.indexed.keys()].filter(path => focusName.test(path)).sort();
  return {
    ...state.header,
    mappingRef: state.mappingRef,
    graphRef: state.graphRef,
    sourceSitesRef: state.sourceSitesRef,
    selectedEntryAnalysisRef: state.entryChain[0].ref,
    historicalEntryAnalysisRefs: state.entryChain.slice(1).map(item => item.ref),
    syntaxScope: graphScope(state),
    initialExcerpts: focus.slice(0, initialExcerptLimit).map(path => ({ path, first: 1, last: 200, indexed: true })),
    initialExcerptSelection: { method: 'bounded filename conventions, sorted by snapshot-relative path',
      limit: initialExcerptLimit, matched: focus.length, omittedPaths: focus.slice(initialExcerptLimit) },
    limits: { excerpt: excerptLimits, syntaxQuery: queryLimits },
  };
}

function pushTo(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function remainingUnits(state) {
  const incoming = new Map();
  const outgoing = new Map();
  const candidates = new Map();
  const sites = new Map();
  const bySpecifier = new Map();
  for (const [index, site] of state.sourceSites.sites.entries()) {
    if (!['import', 're-export', 'dynamic-import', 'import-equals', 'import-type', 'require-candidate',
      'require-resolve-candidate'].includes(site.kind)) continue;
    const ref = state.sourceSitesRef + '#/sites/' + index;
    pushTo(sites, site.path, ref);
    if (typeof site.specifier !== 'string') continue;
    pushTo(bySpecifier, JSON.stringify([site.path, site.specifier, site.dynamic === true]), ref);
  }
  for (const [index, candidate] of state.entryChain[0].analysis.candidates.entries())
    if (candidate.path !== null) pushTo(candidates, candidate.path, state.entryChain[0].ref + '#/candidates/' + index);
  for (const [contextIndex, context] of state.graph.contexts.entries()) {
    const contextRef = state.graphRef + '#/contexts/' + contextIndex;
    assert(Array.isArray(context.edges), 'Missing saved edges for graph context: ' + context.id);
    const stopped = new Set(context.reachability?.stoppedEdges ?? []);
    for (const [edgeIndex, edge] of context.edges.entries()) {
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
  return {
    ...state.header,
    codeMappingRef: state.mappingRef,
    graphRef: state.graphRef,
    sourceSitesRef: state.sourceSitesRef,
    entryAnalysisRef: state.entryChain[0].ref,
    units: state.mapping.units.flatMap((unit, index) => unit.owner !== null ? [] : [{
      path: unit.path,
      sha256: unit.sha256,
      roles: unit.roles,
      mappingRef: state.mappingRef + '#/units/' + index,
      entryCandidateRefs: candidates.get(unit.path) ?? [],
      sourceSiteRefs: sites.get(unit.path) ?? [],
      incomingEdges: incoming.get(unit.path) ?? [],
      outgoingEdges: outgoing.get(unit.path) ?? [],
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

function rangeCoverage(ranges, total) {
  let end = 0;
  for (const [first, last] of [...ranges].sort(([left], [right]) => left - right)) {
    if (first > end + 1) return 'partial';
    end = Math.max(end, last);
  }
  return end === total ? 'complete' : 'partial';
}

function inspectionCoverage(state) {
  const current = new Map();
  const history = new Map();
  const sourceCounts = new Map();
  for (const [position, { ref, analysis }] of state.entryChain.entries()) {
    for (const [index, record] of analysis.reviewedFiles.entries()) {
      const file = state.indexed.get(record?.path);
      assert(file && file.sha256 === record.sha256 && record.snapshotRef === state.header.snapshotRef &&
        typeof record.id === 'string' && Array.isArray(record.lines) && record.lines.length === 2 &&
        record.lines.every(Number.isSafeInteger) && record.lines[0] >= 1 && record.lines[1] >= record.lines[0],
      'Invalid saved source review range: ' + record?.id);
      if (!sourceCounts.has(record.path)) {
        const text = state.readIndexed(record.path, excerptLimits.inputBytes);
        sourceCounts.set(record.path, textLines(text, record.path).length);
      }
      assert(record.lines[1] <= sourceCounts.get(record.path), 'Saved review range exceeds file: ' + record.path);
      const evidence = { sourceRef: record.id, recordRef: ref + '#/reviewedFiles/' + index, lines: record.lines };
      if (position === 0) pushTo(current, record.path, evidence);
      else pushTo(history, record.path, { analysisRef: ref, ...evidence });
    }
  }
  return {
    ...state.header,
    codeMappingRef: state.mappingRef,
    selectedEntryAnalysisRef: state.entryChain[0].ref,
    historicalEntryAnalysisRefs: state.entryChain.slice(1).map(item => item.ref),
    units: state.mapping.units.map((unit, index) => {
      const ranges = current.get(unit.path) ?? [];
      return {
        path: unit.path, sha256: unit.sha256, owner: unit.owner,
        mappingRef: state.mappingRef + '#/units/' + index,
        current: {
          status: ranges.length ? rangeCoverage(ranges.map(record => record.lines), sourceCounts.get(unit.path)) : 'unreviewed',
          ranges,
        },
        historicalRanges: history.get(unit.path) ?? [],
      };
    }),
    limits: [
      'Current ranges come only from the selected Stage 4 entry analysis. Historical ranges follow its saved predecessor chain.',
      'Complete means the union of listed ranges covers the saved file text. It does not establish comprehension, runtime execution, or compliance.',
      'File hashing and graph or syntax parsing are tool reads. They do not count as saved LLM source inspection.',
    ],
  };
}

function physicalLineLookup(text) {
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\r|\n/g)) starts.push(match.index + match[0].length);
  return position => {
    const bounded = Math.min(position, Math.max(0, text.length - 1));
    let low = 0;
    let high = starts.length;
    while (high - low > 1) {
      const middle = (low + high) >>> 1;
      if (starts[middle] <= bounded) low = middle;
      else high = middle;
    }
    return low + 1;
  };
}

function syntaxCandidates(state, scope, ts) {
  const candidates = [];
  const diagnostics = [];
  const omissions = [];
  const scanned = [];
  const skipped = [];
  function boundedExpression(node, source, lineAt) {
    const start = node.getStart(source);
    const end = node.getEnd();
    const expression = source.text.slice(start, Math.min(end, start + queryLimits.expressionChars));
    const lines = [lineAt(start), lineAt(Math.max(start, end - 1))];
    return { lines, expression, truncated: end - start > queryLimits.expressionChars };
  }
  function callName(node) {
    const target = node.expression;
    if (ts.isIdentifier(target)) return target.text;
    if (ts.isPropertyAccessExpression(target)) return target.name.text;
    if (ts.isElementAccessExpression(target) && target.argumentExpression && ts.isStringLiteral(target.argumentExpression))
      return target.argumentExpression.text;
    return undefined;
  }
  function inspect(file, source, lineAt) {
    let kept = 0;
    const omitted = {};
    function record(node, kind, scope, details = {}) {
      if (kept >= queryLimits.perFile || candidates.length >= queryLimits.total) {
        omitted[kind] = (omitted[kind] ?? 0) + 1;
        return;
      }
      kept++;
      candidates.push({
        id: state.header.attemptId + '-syntax-' + (candidates.length + 1),
        path: file.path, sha256: file.sha256, kind, scope, ...boundedExpression(node, source, lineAt), ...details,
      });
    }
    function visit(node, lexicalScope) {
      const computedName = lexicalScope === 'class-definition-syntax' && node.name && ts.isComputedPropertyName(node.name) &&
        (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent)) ? node.name : undefined;
      if (computedName) record(computedName.expression, 'class-computed-name', 'class-definition-syntax');
      if (ts.isFunctionLike(node)) {
        ts.forEachChild(node, child => visit(child, child === computedName ? lexicalScope : 'nested-function-syntax'));
        return;
      }
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        for (const clause of node.heritageClauses ?? [])
          if (clause.token === ts.SyntaxKind.ExtendsKeyword)
            for (const type of clause.types) record(type.expression, 'class-extends-expression', 'class-definition-syntax');
        ts.forEachChild(node, child => visit(child, 'class-definition-syntax'));
        return;
      }
      if (ts.isClassStaticBlockDeclaration(node)) {
        record(node, 'class-static-block', 'class-static-syntax');
        ts.forEachChild(node, child => visit(child, 'class-static-syntax'));
        return;
      }
      if (ts.isPropertyDeclaration(node) && node.initializer) {
        const isStatic = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false;
        const fieldScope = isStatic ? 'class-static-syntax' : 'instance-field-syntax';
        record(node.initializer, isStatic ? 'class-static-field-initializer' : 'instance-field-initializer', fieldScope);
        ts.forEachChild(node, child => visit(child, child === computedName ? lexicalScope : fieldScope));
        return;
      }
      if (lexicalScope === 'module-level-syntax') {
        if (ts.isImportDeclaration(node) && !node.importClause)
          record(node, 'side-effect-import', lexicalScope);
        if (ts.isVariableDeclaration(node) && node.initializer)
          record(node.initializer, 'module-variable-initializer', lexicalScope);
        if (ts.isExpressionStatement(node))
          record(node.expression, 'module-expression', lexicalScope);
      }
      if (ts.isCallExpression(node)) {
        const name = callName(node);
        if (registrationNames.has(name)) record(node, 'setup-or-registration-call', lexicalScope, { name, binding: 'unknown' });
      }
      ts.forEachChild(node, child => visit(child, lexicalScope));
    }
    visit(source, 'module-level-syntax');
    if (Object.keys(omitted).length) omissions.push({ path: file.path, candidatesByKind: omitted });
  }
  for (const file of scope.syntaxScope) {
    if (!sourceExtension.test(file.path)) { skipped.push({ path: file.path, reason: 'not-js-ts' }); continue; }
    if (state.indexed.get(file.path).bytes > queryLimits.inputBytes) {
      skipped.push({ path: file.path, reason: 'input-byte-limit' });
      continue;
    }
    const bytes = state.readIndexed(file.path, queryLimits.inputBytes);
    const value = bytes.toString('utf8');
    if (!Buffer.from(value).equals(bytes)) { skipped.push({ path: file.path, reason: 'invalid-utf8' }); continue; }
    const source = ts.createSourceFile(file.path, value, ts.ScriptTarget.Latest, true);
    const lineAt = physicalLineLookup(value);
    const parserDiagnostics = source.parseDiagnostics ?? [];
    for (const diagnostic of parserDiagnostics.slice(0, queryLimits.diagnosticsPerFile)) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      diagnostics.push({
        path: file.path, code: diagnostic.code,
        line: diagnostic.start === undefined ? null : lineAt(diagnostic.start),
        message: message.slice(0, 500), messageTruncated: message.length > 500,
      });
    }
    scanned.push({ ...file, parserDiagnostics: parserDiagnostics.length,
      omittedDiagnostics: Math.max(0, parserDiagnostics.length - queryLimits.diagnosticsPerFile) });
    inspect(file, source, lineAt);
  }
  return {
    ...state.header,
    graphRef: state.graphRef,
    parser: { name: 'typescript', version: ts.version },
    scope: scanned,
    skipped,
    candidates,
    diagnostics,
    omissions,
    limits: [
      'Scope is the union of saved graph scan files. Context references show where each file was listed; no edges or traversals were merged.',
      'These are syntax candidates. No project, type, symbol, binding, module, or runtime effect analysis ran.',
      'Module-level candidates exclude nested function bodies. An initializer excerpt can still contain a function literal. Class static and instance-field syntax is labeled separately.',
      'Setup or registration candidates include nested calls with a matching spelling. Binding and execution remain unknown.',
      'Line ranges use CRLF, CR, and LF, like numbered excerpts. U+2028 and U+2029 do not increment the saved line numbers.',
      'Parser recovery can affect results. Omitted candidates, skipped files, and clipped expressions limit coverage.',
    ],
  };
}

export function excerpt(state, path, first, last, { focusRange = false } = {}) {
  assert(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first >= 1 && last >= first &&
    last - first + 1 <= excerptLimits.lines, 'Use an inclusive range of at most 300 lines.');
  const file = state.indexed.get(path);
  assert(file, 'File is outside the inventory: ' + path);
  const all = textLines(state.readIndexed(path, excerptLimits.inputBytes), path);
  assert(first <= all.length && (focusRange || last <= all.length), 'Range exceeds saved file: ' + path);
  const end = Math.min(last, all.length);
  const lines = [];
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
    omittedRanges: [[1, first - 1], [savedEnd + 1, all.length]].filter(([from, to]) => from <= to),
    limit: 'Saving an excerpt records a tool read only.',
  };
}

function initialExcerpts(state, scope) {
  const excerpts = [];
  const skipped = [];
  for (const { path, first, last, indexed } of scope.initialExcerpts) {
    if (!indexed) { skipped.push({ path, lines: [first, last], reason: 'not-indexed' }); continue; }
    if (state.indexed.get(path).bytes > excerptLimits.inputBytes) {
      skipped.push({ path, lines: [first, last], reason: 'input-byte-limit' }); continue;
    }
    try {
      excerpts.push({ id: state.header.attemptId + '-source-' + encodeURIComponent(path),
        ...excerpt(state, path, first, last, { focusRange: true }) });
    } catch (error) {
      // Integrity errors abort the action. A bounded or non-text input is a recorded gap.
      if (!/^(Not UTF-8 text|Range exceeds saved file|No complete line fits)/.test(error.message)) throw error;
      skipped.push({ path, lines: [first, last], reason: error.message });
    }
  }
  return { ...state.header, excerpts, skipped, limits: excerptLimits };
}

export function collectEvidence(state, savedScope, ts) {
  assert(isDeepStrictEqual(scopeFor(state), savedScope), 'Stage 5 scope changed after start.');
  return {
    'remaining-units.json': remainingUnits(state),
    'inspection-coverage.json': inspectionCoverage(state),
    'source-candidates.json': syntaxCandidates(state, savedScope, ts),
    'source-excerpts.json': initialExcerpts(state, savedScope),
  };
}
