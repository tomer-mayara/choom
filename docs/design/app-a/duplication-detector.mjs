import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { assert, hash, register, safePath, savedFile, toolRoot } from './duplication-files.mjs';
import { readDetectorEdn } from './duplication-edn.mjs';

const version = '5.4.2';
const maxFileBytes = 1024 * 1024;
const excluded = /(?:^|\/)(?:node_modules|dist|build|target|coverage|test|tests|__tests__|generated)(?:\/|$)|\.(?:test|spec)\.[^.]+$/;

export function uncompletedCollection(status, reason) {
  return { status, tool: { name: 'jscpd', version }, profile: 'javascript-typescript-ast-v1',
    counts: { examined: null, excluded: null, unsupported: null, helperOnly: null, unmapped: null },
    observations: [], scope: [], diagnostics: [reason, 'No completed detector result is available; candidate counts are unknown.'] };
}

function range(value, root, json = false) {
  const raw = json ? value?.name : value?.file;
  assert(typeof raw === 'string', 'Invalid detector source path.');
  const path = isAbsolute(raw) ? relative(root, raw).split('\\').join('/') : raw.replace(/^\.\//, '');
  assert(safePath(path), 'Detector source is outside the saved snapshot.');
  const lines = json ? [value.start, value.end] : [value['start-line'], value['end-line']];
  assert(lines.every(line => Number.isSafeInteger(line) && line > 0) && lines[1] >= lines[0], 'Invalid detector source lines.');
  return { path, lines };
}

const pairKey = observation => JSON.stringify([observation.left, observation.right].map(value => JSON.stringify(value)).sort());

export function normalizeDetector(json, text, root) {
  const edn = readDetectorEdn(text);
  assert(Array.isArray(edn?.candidates) && Array.isArray(edn.clones) && Array.isArray(json?.duplicates), 'Invalid detector report.');
  assert(Number.isSafeInteger(json.statistics?.total?.sources) && json.statistics.total.sources >= 0 &&
    json.statistics.total.clones === json.duplicates.length, 'Invalid detector report counts.');
  const candidates = edn.candidates.map(item => {
    assert(Number.isFinite(item.score) && item.score >= 0 && item.score <= 1 &&
      Number.isSafeInteger(item['left-nodes']) && Number.isSafeInteger(item['right-nodes']), 'Invalid AST observation.');
    return { origin: 'jscpd-ast', method: 'normalized-ast', toolVersion: version, score: item.score,
      left: range(item.left, root), right: range(item.right, root) };
  });
  const clones = edn.clones.map(item => {
    assert(item.kind === 'exact' && Number.isSafeInteger(item.tokens) && item.tokens > 0, 'Unexpected token clone.');
    // One denotes exact equality under this token profile, not equal capabilities.
    return { origin: 'jscpd-token', method: 'exact-token-block', toolVersion: version, score: 1,
      left: range(item.left, root), right: range(item.right, root) };
  });
  const observed = new Map([...candidates, ...clones].map(item => [item.origin + pairKey(item), item]));
  let astLinks = 0;
  let tokenLinks = 0;
  for (const link of json.duplicates) {
    const ast = link.method === 'ast';
    const key = (ast ? 'jscpd-ast' : 'jscpd-token') + pairKey({ left: range(link.firstFile, root, true), right: range(link.secondFile, root, true) });
    const match = observed.get(key);
    // The JSON reporter rounds scores to three decimals; EDN retains precision.
    assert(match && (!ast || Math.abs(match.score - link.similarity) <= 0.000500001), 'Cannot reconcile JSON link with EDN observations.');
    if (ast) astLinks++; else tokenLinks++;
  }
  assert(tokenLinks === clones.length, 'Cannot reconcile token clone counts.');
  return { observations: [...candidates, ...clones], accounting: { astCandidates: candidates.length,
    tokenClones: clones.length, jsonAstLinks: astLinks, jsonTokenLinks: tokenLinks, examined: json.statistics.total.sources } };
}

function trustedBinary() {
  const require = createRequire(join(toolRoot, 'package.json'));
  const launcher = require.resolve('jscpd/package.json');
  const { getPlatformKey, PLATFORM_MAP } = require(join(dirname(launcher), 'platform-map.js'));
  const name = PLATFORM_MAP[getPlatformKey()]?.packageName;
  assert(name, 'No pinned jscpd binary for this host.');
  const metadataPath = require.resolve(name + '/package.json');
  assert(JSON.parse(readFileSync(metadataPath)).version === version, 'Unexpected jscpd package version.');
  return realpathSync(join(dirname(metadataPath), 'bin', process.platform === 'win32' ? 'jscpd.exe' : 'jscpd'));
}

export function collectDetector(state) {
  const { output, manifest, inputs } = state;
  const files = inputs.inventory.files;
  const eligible = files.filter(file => /\.(?:[cm]?[jt]sx?)$/i.test(file.path));
  const omitted = eligible.filter(file => excluded.test(file.path) || file.bytes > maxFileBytes);
  const scope = eligible.filter(file => !omitted.includes(file));
  const config = { path: [inputs.snapshot], format: ['typescript', 'tsx', 'javascript', 'jsx'], minLines: 3,
    minTokens: 100, minNodes: 20, mode: 'weak', similarity: 0.8, threshold: 0, maxSize: '1mb',
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/target/**', '**/coverage/**',
      '**/test/**', '**/tests/**', '**/__tests__/**', '**/generated/**', '**/*.test.*', '**/*.spec.*'] };
  register(output, manifest, 'evidence/profile.json', config, 'profile');
  const base = { tool: { name: 'jscpd', version }, profile: 'javascript-typescript-ast-v1',
    counts: { examined: null, excluded: omitted.length, unsupported: files.length - eligible.length, helperOnly: null, unmapped: null },
    observations: [], diagnostics: ['AST excludes test files, bodyless declarations and small functions. Eligible-function counts are unknown.'],
    scope: scope.map(file => file.path) };
  if (!scope.length) return { ...base, status: 'skipped', diagnostics: [...base.diagnostics, 'The selected detector scope is empty.'] };
  const binary = trustedBinary();
  const check = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  assert(check.status === 0 && check.stdout.trim() === 'jscpd ' + version, 'Unexpected detector version.');
  const destination = join(output, 'evidence/detector');
  mkdirSync(destination);
  const args = ['--config', join(output, 'evidence/profile.json'), '--similarity=0.8', '--min-nodes', '20',
    '--workers', '1', '--reporters', 'json,edn', '--output', destination, '--no-colors', '--no-tips', '--no-gitignore', '--fail-on-empty', inputs.snapshot];
  const result = spawnSync(binary, args, { cwd: output, encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  const invocation = { binary, binarySha256: hash(readFileSync(binary)), args, cwd: output,
    exitStatus: result.status, signal: result.signal, error: result.error?.message ?? null };
  register(output, manifest, 'evidence/detector.stdout.txt', result.stdout ?? '', 'detector-stdout');
  register(output, manifest, 'evidence/detector.stderr.txt', result.stderr ?? '', 'detector-stderr');
  try {
    const json = savedFile(output, 'evidence/detector/jscpd-report.json');
    const edn = savedFile(output, 'evidence/detector/jscpd-report.edn');
    manifest.artifacts['detector-json'] = { path: 'evidence/detector/jscpd-report.json', sha256: hash(json) };
    manifest.artifacts['detector-edn'] = { path: 'evidence/detector/jscpd-report.edn', sha256: hash(edn) };
    const normalized = normalizeDetector(JSON.parse(json), edn.toString('utf8'), inputs.snapshot);
    assert(!result.error && !result.signal && (result.status === 0 || (result.status === 1 && normalized.observations.length)), 'Detector execution failed.');
    assert(normalized.accounting.examined > 0, 'Detector analyzed no files.');
    const uncounted = normalized.accounting.examined < scope.length;
    const diagnostics = [...base.diagnostics];
    if (uncounted) diagnostics.push('The detector counted fewer files than the selected source inventory. It does not identify every omitted file or reason; total exclusions are unknown.');
    return { ...base, ...normalized, status: uncounted ? 'partial' : 'completed', invocation,
      diagnostics, explicitExcludedFiles: omitted.map(file => file.path),
      counts: { ...base.counts, examined: normalized.accounting.examined, excluded: uncounted ? null : omitted.length } };
  } catch (error) {
    const detail = error.code === 'ENOENT' ? 'Required detector report files were not produced.' : error.message;
    return { ...base, status: 'failed', invocation, diagnostics: [...base.diagnostics, detail] };
  }
}
