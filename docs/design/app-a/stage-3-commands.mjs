import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeFileSync, writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const self = fileURLToPath(import.meta.url);
const [action, ...args] = process.argv.slice(2);
const { CHOOM_WORK, CHOOM_TOOLS, CHOOM_STAGE3_ID: id } = process.env;
const helper = 'stage-3-commands.mjs';
const finalizer = 'stage-3-finish.mjs';
const cookbook = 'step-3-cookbook.md';
const toolInputs = [helper, finalizer, cookbook];
const drafts = ['run.yaml', 'discovery.yaml', 'baseline.yaml'];
const checkpoint = name => name.replace('.yaml', '.before.yaml');
const frozen = [...drafts.map(checkpoint), ...toolInputs, 'handoff.json'];
const commandLog = 'commands.md';
const initialExcerptLimit = 20;
const reviewFiles = ['entry-analysis.yaml', 'llm/analysis-prompt.md', 'llm/analysis-response.md',
  'llm/analysis-call.yaml', 'llm/review-scope.json'];
const extensions = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const processes = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync']);
const constructors = ['Worker', 'SharedWorker', 'URL', 'Glob', 'Function'];
const mentionLimit = 250;
const expressionLimit = 4096;
const excerptBytes = 100 * 1024;
const excerptSourceBytes = 2 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const utc = () => new Date().toISOString();
const exists = path => Boolean(lstatSync(path, { throwIfNoEntry: false }));
const errorText = error => String(error.message ?? error).slice(0, 500);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safePath(path) {
  return typeof path === 'string' && !/[\\\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

function directory(path) {
  assert(isAbsolute(path ?? '') && lstatSync(path).isDirectory() && realpathSync(path) === path,
    'Expected a canonical directory: ' + path);
  return path;
}

function read(path) {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical regular file: ' + path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular file: ' + path);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

assert(/^s3-[a-z0-9-]+$/.test(id ?? ''), 'Set CHOOM_STAGE3_ID to an s3-... ID.');
assert((['start', 'collect'].includes(action) && args.length === 0) ||
  (action === 'excerpt' && args.length === 3) || (action === 'save-review' && args.length === 1),
  'Use start, collect, excerpt PATH FIRST LAST, or save-review REVIEW_DIR.');
const work = directory(CHOOM_WORK);
const tools = directory(CHOOM_TOOLS);
assert(work !== tools && !tools.startsWith(work + '/'), 'Use a trusted tool checkout outside CHOOM_WORK.');
const evidence = directory(join(work, 'evidence'));
const attempt = join(evidence, id);
const savedHelper = join(attempt, helper);
const sourceHelper = join(tools, 'docs/design/app-a', helper);
function saved(name) {
  assert(safePath(name), 'Invalid attempt path: ' + name);
  return read(join(attempt, name));
}
const save = (name, bytes) => writeFileSync(join(attempt, name), bytes, { flag: 'wx' });
const saveJson = (name, value) => save(name, JSON.stringify(value, null, 2) + '\n');
const artifactId = name => id + '-file@' + encodeURIComponent(name);
const digests = names => Object.fromEntries(names.map(name => [name, hash(saved(name))]));
const logs = prefix => ['.started.json', '.stdout.txt', '.stderr.txt'].map(suffix => prefix + suffix);
const require = createRequire(join(tools, 'package.json'));
const modules = join(tools, 'node_modules') + '/';

function loadTools() {
  function load(name) {
    const path = require.resolve(name);
    assert(path.startsWith(modules + name + '/'), 'Install ' + name + ' in the trusted tool checkout.');
    read(path);
    return require(path);
  }

  const { parse } = load('yaml');
  const ts = load('typescript');
  const toolFiles = Object.keys(require.cache).filter(path => path.startsWith(modules)).sort();
  return { parse, ts, versions: {
    node: process.version, typescript: ts.version,
    modules: Object.fromEntries(toolFiles.map(path => [path.slice(modules.length), hash(read(path))])),
  } };
}

function handoffState(parse) {
  const inputs = Object.fromEntries(drafts.map(name => [name, read(join(work, name))]));
  const [run, discovery, baseline] = drafts.map(name => parse(inputs[name].toString()));
  assert(run?.formatVersion === 1 && run.mode === 'A' && run.status === 'in-progress' &&
    run.progress?.inventory === 'complete' && run.progress.entryAnalysis === 'complete' &&
    run.progress.inspectionPriorities !== 'complete' &&
    run.progress.baselineRecovery === 'pending' && run.snapshot?.root === 'snapshot' &&
    typeof run.snapshot.id === 'string' && object(run.artifacts), 'Expected a completed Stage 2 handoff.');
  assert(discovery?.formatVersion === 1 && discovery.kind === 'architecture-discovery' &&
    discovery.runRef === run.id && typeof discovery.entryAnalysisRef === 'string', 'Expected selected entry analysis.');
  assert(baseline?.formatVersion === 1 && typeof baseline.id === 'string' && baseline.parentId === null &&
    ['components', 'interfaces', 'resources', 'rules'].every(key =>
      Array.isArray(baseline[key]) && baseline[key].length === 0), 'Expected an empty initial baseline.');

  const artifacts = new Map();
  for (const [ref, record] of Object.entries(run.artifacts)) {
    assert(safePath(record?.path) && !drafts.includes(record.path) &&
      !record.path.startsWith('evidence/' + id + '/') && sha256(record.sha256), 'Invalid registered artifact: ' + ref);
    const bytes = read(join(work, record.path));
    assert(hash(bytes) === record.sha256, 'Changed registered artifact: ' + ref);
    artifacts.set(ref, { path: record.path, ref, bytes });
  }
  function artifact(ref) {
    const record = artifacts.get(ref);
    assert(record, 'Missing registered artifact: ' + ref);
    return record;
  }

  const { id: snapshotRef, inventoryRef } = run.snapshot;
  const snapshot = directory(join(work, run.snapshot.root));
  const { dev, ino } = lstatSync(snapshot);
  const inventoryArtifact = artifact(inventoryRef);
  const inventory = JSON.parse(inventoryArtifact.bytes);
  assert(inventory?.formatVersion === 1 && inventory.snapshotId === snapshotRef &&
    Array.isArray(inventory.files), 'Inventory snapshot mismatch.');
  const files = new Map();
  for (const entry of inventory.files) {
    assert(safePath(entry?.path) && !files.has(entry.path) &&
      (entry.kind === 'symlink' || (entry.kind === 'file' && sha256(entry.sha256))),
    'Invalid or repeated inventory path: ' + entry?.path);
    files.set(entry.path, entry);
  }

  const { entryAnalysisRef } = discovery;
  const analysis = parse(artifact(entryAnalysisRef).bytes.toString());
  assert(analysis?.formatVersion === 1 && analysis.kind === 'entry-analysis' && analysis.snapshotRef === snapshotRef,
    'Selected entry analysis must describe this snapshot.');
  const { planRef, knipRunsRef } = analysis;
  const plan = JSON.parse(artifact(planRef).bytes);
  const runsArtifact = artifact(knipRunsRef);
  const runs = JSON.parse(runsArtifact.bytes);
  assert(plan?.formatVersion === 1 && plan.snapshotRef === snapshotRef &&
    runs?.formatVersion === 1 && runs.snapshotRef === snapshotRef && Array.isArray(runs.runs),
  'Selected plan and Knip runs must describe this snapshot.');
  const facts = {
    runRef: run.id, snapshotRef, inventoryRef, snapshot: { path: snapshot, dev, ino },
    entryAnalysisRef, planRef, knipRunsRef, registeredArtifacts: artifacts.size,
    indexedRegularFiles: [...files.values()].filter(file => file.kind === 'file').length,
    checkpointDigests: Object.fromEntries(drafts.map(name => [checkpoint(name), hash(inputs[name])])),
  };
  return { facts, inputs, files, artifacts, runsArtifact, runs, analysis };
}

function readSource(state, path, maxBytes = Infinity) {
  const file = state.files.get(path);
  assert(safePath(path) && file?.kind === 'file', 'Path is outside the indexed regular files: ' + path);
  const absolute = join(state.facts.snapshot.path, path);
  const stat = lstatSync(absolute);
  assert(stat.isFile() && stat.size === file.bytes && realpathSync(absolute) === absolute, 'Changed indexed source: ' + path);
  if (file.bytes > maxBytes) {
    const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      assert(fstatSync(fd).isFile(), 'Expected a regular saved source: ' + path);
      const digest = createHash('sha256'); const chunk = Buffer.alloc(64 * 1024); let size = 0; let count;
      while ((count = readSync(fd, chunk, 0, chunk.length, null)) > 0) { digest.update(chunk.subarray(0, count)); size += count; }
      assert(size === file.bytes && digest.digest('hex') === file.sha256, 'Changed indexed source: ' + path);
    } finally { closeSync(fd); }
    const error = new Error('Excerpt source exceeds 2 MiB: ' + path);
    error.code = 'EXCERPT_SOURCE_TOO_LARGE';
    throw error;
  }
  const bytes = read(absolute);
  assert(bytes.length === file.bytes && hash(bytes) === file.sha256, 'Changed indexed source: ' + path);
  return bytes;
}

function reportTargets(state) {
  assert(state.runs.runs.length === 2, 'Expected recorded normal and production Knip modes.');
  const reports = [];
  const targets = new Map();
  const modes = new Set();
  for (const run of state.runs.runs) {
    const { mode, status, stdout, exitCode } = run;
    assert(['normal', 'production'].includes(mode) && !modes.has(mode) &&
      ['completed', 'failed', 'skipped'].includes(status), 'Invalid Knip mode or status.');
    modes.add(mode);
    const summary = { mode, status, exitCode: exitCode ?? null, reportRef: null };
    reports.push(summary);
    let report;
    if (stdout != null) {
      assert(safePath(stdout), 'Invalid raw Knip report path.');
      const path = join(dirname(state.runsArtifact.path), stdout);
      const records = [...state.artifacts.values()].filter(record => record.path === path);
      assert(records.length === 1, 'Expected one registered raw Knip report: ' + path);
      [report] = records;
      summary.reportRef = report.ref;
    }
    if (status !== 'completed') continue;
    assert(report && [0, 1].includes(exitCode) && run.report?.valid === true, 'Invalid completed Knip run: ' + mode);
    const { issues } = JSON.parse(report.bytes);
    assert(Array.isArray(issues), 'Invalid Knip issues: ' + mode);
    for (const issue of issues) {
      assert(safePath(issue?.file), 'Invalid file in Knip issues: ' + mode);
      for (const kind of ['exports', 'types']) {
        if (!Object.hasOwn(issue, kind)) continue;
        assert(Array.isArray(issue[kind]), 'Invalid Knip issue category: ' + kind);
        for (const { name } of issue[kind]) {
          assert(typeof name === 'string' && name.length > 0, 'Invalid reported symbol name.');
          const key = JSON.stringify([issue.file, name]);
          if (!targets.has(key)) targets.set(key, {
            reportedFile: issue.file, name, issueKinds: [], reportRefs: [], mentions: [], mentionCount: 0,
          });
          const target = targets.get(key);
          if (!target.issueKinds.includes(kind)) target.issueKinds.push(kind);
          if (!target.reportRefs.includes(report.ref)) target.reportRefs.push(report.ref);
        }
      }
    }
  }
  return { reports, targets: [...targets.values()] };
}

function candidate(ts, node) {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;
  const callee = node.expression;
  const property = ts.isPropertyAccessExpression(callee) ? callee.name.text
    : ts.isElementAccessExpression(callee) && ts.isStringLiteral(callee.argumentExpression) ? callee.argumentExpression.text
      : undefined;
  const name = ts.isIdentifier(callee) ? callee.text : property;
  if (ts.isNewExpression(node)) {
    if (constructors.includes(name)) return 'new ' + name;
    return;
  }
  if (callee.kind === ts.SyntaxKind.ImportKeyword) {
    const first = node.arguments[0];
    return first && ts.isStringLiteralLike(first) ? 'import-literal' : 'import-computed';
  }
  if (name === 'require' && !property) return 'require';
  if (property === 'resolve' && ts.isIdentifier(callee.expression) && callee.expression.text === 'require')
    return 'require.resolve';
  if (property === 'glob' && ts.isMetaProperty(callee.expression) &&
    callee.expression.keywordToken === ts.SyntaxKind.ImportKeyword && callee.expression.name.text === 'meta')
    return 'import.meta.glob';
  if (processes.has(name) || name === 'eval') return name;
  if (property === 'scan' || property === 'register') return '.' + property;
}

function location(source, pos) {
  const { line, character } = source.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, column: character + 1 };
}

function numberedExcerpt(state, path, first, last, focused) {
  const bytes = readSource(state, path, excerptSourceBytes);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const all = text ? text.replace(/(?:\r\n|[\r\n])$/, '').split(/\r\n|[\r\n]/) : [];
  assert(focused || last <= all.length, 'Requested lines exceed the indexed file: ' + path);
  const lines = [];
  let size = 0;
  for (let line = first; line <= Math.min(last, all.length); line++) {
    const numbered = line + ': ' + all[line - 1];
    size += Buffer.byteLength(numbered) + (lines.length ? 1 : 0);
    if (size > excerptBytes) {
      assert(focused, 'Requested excerpt exceeds 100 KiB: ' + path);
      break;
    }
    lines.push(numbered);
  }
  const end = first + lines.length - 1;
  return {
    snapshotRef: state.facts.snapshotRef, path, sha256: state.files.get(path).sha256,
    lines: lines.length ? [first, end] : null, excerpt: lines.join('\n'), totalLineCount: all.length,
    truncated: first > 1 || end < all.length,
  };
}

function collect(state, { ts, versions }, output) {
  const { reports, targets } = reportTargets(state);
  const targetsByName = new Map();
  for (const target of targets) {
    if (!targetsByName.has(target.name)) targetsByName.set(target.name, []);
    targetsByName.get(target.name).push(target);
  }

  const scope = [];
  const matches = [];
  const diagnostics = [];
  const { snapshotRef } = state.facts;
  const paths = [...state.files.keys()].filter(path => state.files.get(path).kind === 'file' &&
    extensions.test(path)).sort();
  for (const path of paths) {
    const bytes = readSource(state, path);
    const { sha256 } = state.files.get(path);
    scope.push({ path, sha256 });
    const source = ts.createSourceFile(path, new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
      ts.ScriptTarget.Latest, true);
    for (const diagnostic of source.parseDiagnostics) {
      diagnostics.push({
        path, code: diagnostic.code, at: location(source, diagnostic.start ?? 0),
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      });
    }

    function visit(node) {
      const kind = candidate(ts, node);
      if (kind) {
        const start = node.getStart(source);
        const expression = source.text.slice(start, Math.min(node.end, start + expressionLimit));
        const lines = [location(source, start).line, location(source, node.end - 1).line];
        matches.push({ path, sha256, kind, lines, expression, truncated: expression.length < node.end - start });
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
  }

  const context = { formatVersion: 1, snapshotRef, scope };
  const limits = [
    'Tool content reads and syntactic candidates only. They do not record LLM source review.',
    'No project load, binding, alias or type resolution, config execution, or reachability analysis.',
    'Names can be shadowed. Computed expressions, templates and aliases are not resolved.',
    'Native code, excluded inputs and all files outside the recorded scope were outside the query.',
    'Parser recovery can affect matches in files with diagnostics. A completed no-match describes this query only.',
  ];
  output('loading-search.json', { ...context, status: 'completed', outcome: matches.length ? 'matches' : 'no-match',
    matches, diagnostics, limits,
    query: { profile: 'stage-3-loading-syntax-v2', parser: 'TypeScript createSourceFile (Latest)',
      selection: 'all indexed regular files with a JavaScript or TypeScript source extension',
      extensions: extensions.source, maxExpressionCodeUnits: expressionLimit, versions,
      candidateKinds: ['import-literal', 'import-computed', 'require', 'require.resolve', 'import.meta.glob',
        ...constructors.map(name => 'new ' + name), ...processes, '.scan', '.register', 'eval'] } });

  const completed = reports.filter(report => report.status === 'completed').length;
  const symbolStatus = completed === reports.length ? 'completed' : completed > 0 ? 'partial'
    : reports.some(report => report.status === 'failed') ? 'unavailable' : 'skipped';
  output('symbol-mentions.json', { ...context, knipRunsRef: state.facts.knipRunsRef, status: symbolStatus,
    reports, maxMentionsPerTarget: mentionLimit, parserDiagnosticsRef: artifactId('loading-search.json'),
    limits: [...limits,
      'Identifier name matches include declarations and unrelated names. They do not establish resolved references, file reachability, or proof of use.',
      'Only reported exports and types from completed modes are queried. Other issue categories are outside this query.'],
    targets: targets.map(target => ({ ...target, truncated: target.mentionCount > target.mentions.length })) });

  const excerpts = [];
  const missingPaths = [];
  const focusPaths = [...new Set([
    ...state.analysis.candidates.map(item => item.path).filter(path => typeof path === 'string'),
    ...matches.map(item => item.path), ...targets.map(item => item.reportedFile),
  ])];
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
      const value = numberedExcerpt(state, path, 1, 200, true);
      if (value.lines === null) missingPaths.push({ path, status: 'skipped', reason: 'Empty file or no line fits the initial excerpt byte limit.' });
      else excerpts.push({ id: id + '-source-' + encodeURIComponent(path), ...value });
    } catch (error) {
      if (error.code === 'EXCERPT_SOURCE_TOO_LARGE')
        missingPaths.push({ path, status: 'skipped', reason: error.message });
      else if (error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA')
        missingPaths.push({ path, status: 'skipped', reason: 'The saved file is not UTF-8 text.' });
      else throw error;
    }
  }
  output('source-excerpts.json', { formatVersion: 1, snapshotRef, excerpts, missingPaths,
    limits: ['First 200 lines per indexed path, up to 100 KiB of numbered text from a UTF-8 file of at most 2 MiB. Saving an excerpt records a tool read only.',
      'At most 20 initial paths, in entry-candidate, loading-match, then reported-symbol order. Other paths require an excerpt request.'] });
  return `Parsed ${scope.length} files. Saved ${matches.length} loading candidates, ${diagnostics.length} parser diagnostics, ${targets.length} symbol targets and ${excerpts.length} excerpts. ${missingPaths.length} excerpt paths skipped.`;
}

function reviewPrompt({ entryAnalysisRef }) {
  const body = saved(cookbook).toString().replaceAll('\r\n', '\n');
  const pattern = /^<!-- stage3-review-prompt:start -->\n\x60\x60\x60text\n([\s\S]*?)^\x60\x60\x60\n<!-- stage3-review-prompt:end -->$/gm;
  const blocks = [...body.matchAll(pattern)];
  assert(blocks.length === 1, 'Expected one review prompt in the frozen Stage 3 cookbook.');
  const tokens = { WORK: work, ATTEMPT: attempt, ID: id, PREVIOUS_ENTRY_REF: entryAnalysisRef };
  const prompt = blocks[0][1].replace(/\{\{([^{}\n]+)\}\}/g, (_, token) => {
    assert(Object.hasOwn(tokens, token), 'Unknown review prompt token: ' + token);
    return tokens[token];
  });
  assert(!prompt.includes('{{'), 'Unresolved token in review prompt.');
  return prompt;
}

function reserve() {
  const command = {
    args: [process.execPath, self, action, ...args], cwd: process.cwd(),
    environment: { CHOOM_WORK: work, CHOOM_TOOLS: tools, CHOOM_STAGE3_ID: id },
  };
  for (let index = 1; ; index++) {
    const phase = action === 'excerpt' ? 'excerpt-' + String(index).padStart(3, '0') : action;
    const prefix = 'operator-' + phase;
    const started = { formatVersion: 1, attemptId: id, action, phase, command, startedAt: utc() };
    try {
      saveJson(prefix + '.started.json', started);
      return { phase, prefix, started };
    } catch (error) {
      if (action === 'excerpt' && error.code === 'EEXIST') continue;
      throw error;
    }
  }
}

function logCommand(entry) {
  const path = join(attempt, commandLog);
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical command log.');
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular command log.');
    const bytes = Buffer.from('\n\x60\x60\x60json\n' + JSON.stringify(entry) + '\n\x60\x60\x60\n');
    assert(writeSync(fd, bytes) === bytes.length, 'Incomplete command log write.');
  } finally {
    closeSync(fd);
  }
}

function main() {
  let toolchain;
  let state;
  let sourceInputs;
  if (action === 'start') {
    assert(self === sourceHelper && !exists(attempt), 'Start from CHOOM_TOOLS with a fresh attempt ID.');
    toolchain = loadTools();
    state = handoffState(toolchain.parse);
    sourceInputs = Object.fromEntries(toolInputs.map(name => [name, read(join(dirname(self), name))]));
    mkdirSync(attempt);
  } else {
    directory(attempt);
    assert(self === savedHelper, 'Use the frozen helper in the attempt directory.');
  }

  const { phase, prefix, started } = reserve();
  const outputNames = [];
  function output(name, value) {
    saveJson(name, value);
    outputNames.push(name);
  }

  let message = '';
  let errorMessage = null;
  try {
    if (action === 'start') {
      save(commandLog, '# Stage 3 commands\n\n' +
        'Set CHOOM_WORK, CHOOM_TOOLS and CHOOM_STAGE3_ID before running these commands.\n\n' +
        '\x60\x60\x60sh\nnode "$CHOOM_TOOLS/docs/design/app-a/stage-3-commands.mjs" start\n' +
        'node "$CHOOM_WORK/evidence/$CHOOM_STAGE3_ID/stage-3-commands.mjs" collect\n' +
        'node "$CHOOM_WORK/evidence/$CHOOM_STAGE3_ID/stage-3-commands.mjs" excerpt PATH FIRST LAST\n' +
        'node "$CHOOM_WORK/evidence/$CHOOM_STAGE3_ID/stage-3-commands.mjs" save-review REVIEW_DIR\n' +
        'node "$CHOOM_WORK/evidence/$CHOOM_STAGE3_ID/stage-3-finish.mjs"\n\x60\x60\x60\n\n' +
        '## Recorded invocations\n');
      for (const name of drafts) save(checkpoint(name), state.inputs[name]);
      for (const [name, bytes] of Object.entries(sourceInputs)) save(name, bytes);
      saveJson('handoff.json', { formatVersion: 1, attemptId: id, work, tools, ...state.facts,
        versions: toolchain.versions, toolInputDigests: digests(toolInputs),
        initialCommandsSha256: hash(saved(commandLog)) });
      outputNames.push(...frozen);
      message = `Saved ${id} for ${state.facts.snapshotRef}. Verified ${state.facts.registeredArtifacts} registered artifacts and indexed ${state.facts.indexedRegularFiles} regular-file records.`;
    } else {
      const start = JSON.parse(saved('operator-start.json'));
      assert(start?.attemptId === id && start.action === 'start' && start.status === 'completed' &&
        isDeepStrictEqual(start.digests, digests(frozen)) &&
        isDeepStrictEqual(start.logDigests, digests(logs('operator-start'))),
      'Frozen inputs changed or start did not complete.');
      const handoff = JSON.parse(saved('handoff.json'));
      toolchain = loadTools();
      state = handoffState(toolchain.parse);
      assert(handoff.work === work && handoff.tools === tools && isDeepStrictEqual(handoff.versions, toolchain.versions) &&
        Object.entries(state.facts).every(([key, value]) => isDeepStrictEqual(handoff[key], value)),
      'Work, snapshot, checkpoints or trusted tools changed since start.');
      if (action === 'collect') {
        const prompt = reviewPrompt(state.facts);
        const summary = collect(state, toolchain, output);
        save('review-prompt.md', prompt);
        outputNames.push('review-prompt.md');
        const known = [...frozen, 'operator-start.json', ...logs('operator-start'),
          prefix + '.started.json', ...outputNames];
        output('artifact-map.json', {
          formatVersion: 1, attemptId: id, snapshotRef: state.facts.snapshotRef, status: 'proposed',
          limits: ['Proposed IDs for immutable evidence available to the review.',
            'The map omits the mutable command log, itself, and later files.'],
          artifacts: Object.fromEntries(known.map(name => [
            artifactId(name), { path: 'evidence/' + id + '/' + name, sha256: hash(saved(name)) },
          ])),
        });
        message = summary;
      } else if (action === 'save-review') {
        const review = directory(args[0]);
        assert(review !== work && !review.startsWith(work + '/'), 'Keep the review packet outside the saved run.');
        const supplied = Object.fromEntries(reviewFiles.map(name => [name, read(join(review, name))]));
        assert(reviewFiles.every(name => supplied[name].length > 0), 'Review packet files must not be empty.');
        mkdirSync(join(attempt, 'llm'));
        for (const name of reviewFiles) { save(name, supplied[name]); outputNames.push(name); }
        message = 'Saved the review packet. Run stage-3-finish.mjs to validate and register it.';
      } else {
        const [path, firstText, lastText] = args;
        const [first, last] = [Number(firstText), Number(lastText)];
        assert([firstText, lastText].every(value => /^[1-9][0-9]*$/.test(value)) &&
          [first, last].every(Number.isSafeInteger) && first <= last && last - first < 300,
        'Use an inclusive range of at most 300 lines.');
        const name = phase + '.json';
        output(name, { formatVersion: 1, id: id + '-source-' + phase, ...numberedExcerpt(state, path, first, last, false),
          limit: 'Saving an excerpt records a tool read only.' });
        message = `Saved ${artifactId(name)} at ${join(attempt, name)} (SHA-256 ${hash(saved(name))}).`;
      }
    }
  } catch (error) {
    errorMessage = errorText(error);
  }
  const finishedAt = utc();
  const outcome = () => errorMessage ? { status: 'failed', exitCode: 1 } : { status: 'completed', exitCode: 0 };
  try {
    logCommand({ ...started, ...outcome(), finishedAt });
  } catch (error) {
    errorMessage = [errorMessage, errorText(error)].filter(Boolean).join(' | ');
  }
  process.exitCode = outcome().exitCode;
  save(prefix + '.stdout.txt', message ? message + '\n' : '');
  save(prefix + '.stderr.txt', errorMessage ? errorMessage + '\n' : '');
  saveJson(prefix + '.json', {
    ...started, ...outcome(), finishedAt, digests: digests(outputNames),
    logDigests: digests(logs(prefix)),
  });
  if (errorMessage) console.error(errorMessage);
  else console.log(message);
}

try {
  main();
} catch (error) {
  console.error(errorText(error));
  process.exitCode = 1;
}
