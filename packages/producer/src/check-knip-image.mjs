import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const toolRoot = process.env.CHOOM_KNIP_TOOLS || '/opt/choom-tools';
const knipRoot = join(toolRoot, 'node_modules/knip');
const result = {
  formatVersion: 1, checkedAt: new Date().toISOString(), node: process.version,
  platform: process.platform, arch: process.arch, toolRoot, knip: null, packageLock: null,
  imageId: process.env.CHOOM_KNIP_IMAGE_ID ?? null,
  environment: { KNIP_DISABLE_RAW_TRANSFER: process.env.KNIP_DISABLE_RAW_TRANSFER ?? null },
  check: { status: 'failed', parser: [], runs: [], error: null },
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function makeFixture(pluginNames) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'choom-tool-check-')));
  const root = join(base, 'fixture');
  mkdirSync(join(root, 'app'), { recursive: true });
  mkdirSync(join(root, 'test'));
  const files = {
    'package.json': '{"name":"choom-tool-check","type":"module","private":true}',
    'app/main-ts.ts': 'import { value } from "./used-ts.ts"; console.log(value);',
    'app/used-ts.ts': 'export const value: number = 1;',
    'app/unused.ts': 'export const oldValue = 1;',
    'app/main-js.js': 'import { value } from "./used-js.js"; console.log(value);',
    'app/used-js.js': 'export const value = 1;',
    'app/unused.js': 'export const oldValue = 1;',
    'test/main.ts': 'import { value } from "./used.ts"; console.log(value);',
    'test/used.ts': 'export const value = 1;',
    'test/unused.ts': 'export const oldValue = 1;',
  };
  for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source);
  const profile = {
    ...Object.fromEntries(pluginNames.map(name => [name, false])), preprocessor: [],
    workspaces: { '.': {
      entry: ['app/main-ts.ts!', 'app/main-js.js!', 'test/main.ts'],
      project: ['app/*.{js,ts}!', 'test/*.ts'],
    } },
  };
  const config = join(base, 'knip.json');
  writeFileSync(config, JSON.stringify(profile));
  return { root, config, files };
}

function checkParser(fixture, parseFile) {
  for (const [name, expected] of [
    ['app/main-ts.ts', './used-ts.ts'], ['app/main-js.js', './used-js.js'], ['test/main.ts', './used.ts'],
  ]) {
    const record = { file: name, imports: null, errors: null, error: null };
    result.check.parser.push(record);
    try {
      const parsed = parseFile(join(fixture.root, name), fixture.files[name]);
      record.imports = parsed.module.staticImports.map(item => item.moduleRequest.value);
      record.errors = parsed.errors;
      assert(!record.errors.length && JSON.stringify(record.imports) === JSON.stringify([expected]),
        'Parser did not preserve the fixture import: ' + name);
    } catch (error) {
      record.error = error.stack || error.message;
      throw error;
    }
  }
}

function checkMode(fixture, mode) {
  const args = [join(knipRoot, 'bin/knip.js'), '--config', fixture.config,
    '--reporter', 'json', '--no-progress', '--no-gitignore'];
  if (mode === 'production') args.push('--production');
  const child = spawnSync(process.execPath, args, {
    cwd: fixture.root, env: { ...process.env, KNIP_DISABLE_RAW_TRANSFER: '1' },
    encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
  });
  const run = { mode, cwd: fixture.root, args, exitCode: child.status, signal: child.signal,
    stdout: child.stdout ?? '', stderr: child.stderr ?? '', error: child.error?.message ?? null };
  result.check.runs.push(run);
  assert(!child.error && !child.signal && child.status === 1, 'Fixture CLI failed in ' + mode + ' mode.');
  const report = JSON.parse(run.stdout);
  assert(Array.isArray(report.issues), 'Missing fixture issue records.');
  const expected = ['app/unused.js', 'app/unused.ts', ...(mode === 'normal' ? ['test/unused.ts'] : [])];
  const unused = report.issues.filter(item => item.files?.length).map(item => item.file).sort();
  assert(JSON.stringify(unused) === JSON.stringify(expected), 'Unexpected unused files in ' + mode + ': ' + JSON.stringify(unused));
  assert(report.issues.every(item => Object.entries(item).every(([key, value]) =>
    key === 'file' || key === 'files' || (Array.isArray(value) && value.length === 0))),
  'Unexpected non-file issue in ' + mode + ' mode.');
}

try {
  assert(process.env.KNIP_DISABLE_RAW_TRANSFER === '1', 'Use KNIP_DISABLE_RAW_TRANSFER=1 for the check and analysis.');
  result.knip = JSON.parse(readFileSync(join(knipRoot, 'package.json'))).version;
  assert(result.knip === '6.44.1', 'Unexpected Knip version.');
  const lock = join(toolRoot, 'package-lock.json');
  if (existsSync(lock)) result.packageLock = JSON.parse(readFileSync(lock));
  assert(result.packageLock || process.env.CHOOM_KNIP_TOOLS, 'The image must contain its installed package lock.');
  const { pluginNames } = await import(pathToFileURL(join(knipRoot, 'dist/types/PluginNames.js')));
  const { _parseFile } = await import(pathToFileURL(join(knipRoot, 'dist/typescript/ast-nodes.js')));
  const fixture = makeFixture(pluginNames);
  checkParser(fixture, _parseFile);
  for (const mode of ['normal', 'production']) checkMode(fixture, mode);
  result.check.status = 'passed';
} catch (error) {
  result.check.error = error.stack || error.message;
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(result, null, 2));
}
