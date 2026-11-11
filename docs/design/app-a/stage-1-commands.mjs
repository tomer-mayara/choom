import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { appendFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { localRunExclusion, pathsOverlap, runLayout } from './run-layout.mjs';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const text = value => typeof value === 'string' && value.trim().length > 0;
const safe = name => text(name) && !isAbsolute(name) && !/[\\\u0000-\u001f\u007f]/.test(name) &&
  name.split('/').every(part => part && part !== '.' && part !== '..');
const [action, ...args] = process.argv.slice(2);
const self = fileURLToPath(import.meta.url);
const tools = realpathSync(process.env.CHOOM_TOOLS ?? '');
assert(self === join(tools, 'docs/design/app-a/stage-1-commands.mjs'), 'Use the trusted Stage 1 helper.');
const layoutHelper = 'run-layout.mjs';
const layoutSource = join(dirname(self), layoutHelper);
assert(isAbsolute(process.env.CHOOM_WORK ?? ''), 'Set CHOOM_WORK to a new absolute path.');
const work = resolve(process.env.CHOOM_WORK);
const require = createRequire(join(tools, 'package.json'));
const { parse, stringify } = require('yaml');
const utc = () => new Date().toISOString();
const save = (name, bytes) => writeFileSync(join(work, name), bytes, { flag: 'wx' });
const saveJson = (name, value) => save(name, JSON.stringify(value, null, 2) + '\n');
function read(name) {
  assert(safe(name), 'Invalid saved path: ' + name);
  const path = join(work, name);
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular saved file: ' + name);
  return readFileSync(path);
}
const json = name => JSON.parse(read(name));
function present(name) { return Boolean(lstatSync(join(work, name), { throwIfNoEntry: false })); }
function command(program, commandArgs, stem, { timeout = 300_000, input } = {}) {
  const result = spawnSync(program, commandArgs, { cwd: work, env: { ...process.env, CHOOM_WORK: work },
    input, timeout, maxBuffer: 128 * 1024 * 1024 });
  const record = { command: program, args: commandArgs, recordedAt: utc(), exitCode: result.status,
    signal: result.signal, error: result.error?.message ?? null };
  save(stem + '.stdout.txt', result.stdout ?? ''); save(stem + '.stderr.txt', result.stderr ?? '');
  saveJson(stem + '.json', record);
  assert(!result.error && !result.signal && result.status === 0, 'Command failed; see ' + stem + '.stderr.txt');
  return result.stdout;
}
function enumerate(dir = '') {
  const files = [];
  for (const name of readdirSync(join(work, dir)).sort()) {
    const path = dir ? dir + '/' + name : name;
    assert(safe(path), 'Unsupported saved path: ' + path);
    const stat = lstatSync(join(work, path));
    assert(!stat.isSymbolicLink(), 'Symbolic links are unsupported: ' + path);
    if (stat.isDirectory()) files.push(...enumerate(path));
    else { assert(stat.isFile(), 'Unsupported filesystem item: ' + path); files.push(path); }
  }
  return files;
}
function verifyInventory(inventory) {
  const files = enumerate('snapshot').map(path => path.slice('snapshot/'.length));
  assert(isDeepStrictEqual(files, inventory.files.map(file => file.path)), 'Snapshot file set changed.');
  for (const record of inventory.files) {
    const bytes = read('snapshot/' + record.path);
    assert(record.kind === 'file' && bytes.length === record.bytes && hash(bytes) === record.sha256,
      'Snapshot content changed: ' + record.path);
  }
}
function sourceRange(path, first, last, inventory) {
  assert(safe(path), 'Use a snapshot-relative source path.');
  const file = inventory.files.find(file => file.path === path);
  assert(file?.kind === 'file', 'Source is not in the saved inventory: ' + path);
  assert(file.bytes <= 2 * 1024 * 1024, 'Source excerpt input exceeds 2 MiB: ' + path);
  const bytes = read('snapshot/' + path);
  assert(bytes.length === file.bytes && hash(bytes) === file.sha256, 'Source content changed: ' + path);
  const source = bytes.toString('utf8');
  const lines = source ? source.split(/\r\n|\r|\n/) : []; if (/[\r\n]$/.test(source)) lines.pop();
  assert(!source.includes('\0') && Buffer.from(source).equals(bytes), 'Excerpt input must be UTF-8 text.');
  assert(Number.isInteger(first) && Number.isInteger(last) && first >= 1 && last >= first && last <= lines.length && last - first < 300,
    'Source range is outside the saved file.');
  const excerpt = lines.slice(first - 1, last).map((value, index) => `${first + index}: ${value}`).join('\n');
  assert(Buffer.byteLength(excerpt) <= 100 * 1024, 'Numbered excerpt exceeds 100 KiB.');
  return { snapshotRef: inventory.snapshotId, path, sha256: file.sha256, lines: [first, last],
    excerpt, totalLines: lines.length };
}
function settingsRecipe() {
  const cookbook = read('evidence/cookbook.md').toString();
  const matches = [...cookbook.matchAll(/^cat > "\$CHOOM_WORK\/settings\.mjs" <<'JS'\n([\s\S]*?)^JS\n/gm)];
  assert(matches.length === 1, 'Expected one saved settings helper.'); return matches[0][1];
}
function artifactId(path) {
  const fixed = { 'evidence/inventory.json': 'inventory-001', 'evidence/settings.json': 'settings-001',
    'evidence/review.yaml': 'review-001', 'evidence/tools.json': 'tools-001', 'exclusions.txt': 'exclusions-001',
    'evidence/scope-notes.md': 'scope-notes-001', 'evidence/extra-configs.json': 'extra-configs-001',
    'evidence/stage1-discovery.yaml': 'discovery-001', 'evidence/review-scope.json': 'review-scope-001' };
  return fixed[path] ?? 's1-file@' + encodeURIComponent(path);
}
function captureLayout(target) {
  const workLayout = runLayout(work, tools);
  const sameCheckout = target === tools;
  assert(lstatSync(target).isDirectory() && realpathSync(target) === target, 'Use a canonical target directory.');
  assert(!pathsOverlap(target, work) || (sameCheckout && workLayout === 'checkout-local'),
    'Keep the working folder outside the target unless it is a direct child of work-choom in the shared checkout.');
  return { workLayout, requiredExclusion: sameCheckout ? localRunExclusion : null };
}

try {
  assert(['start', 'capture', 'settings', 'excerpt', 'finish', 'verify'].includes(action),
    'Use start, capture, settings, excerpt PATH FIRST LAST REASON, finish REVIEW_FOLDER, or verify.');
  if (action === 'start') {
    assert(args.length === 0 && !lstatSync(work, { throwIfNoEntry: false }), 'Use a new working folder.');
    assert(realpathSync(dirname(work)) === dirname(work), 'Use a canonical working-folder parent.');
    const target = realpathSync(process.env.CHOOM_TARGET ?? '');
    const layout = captureLayout(target);
    const ids = { runRef: process.env.CHOOM_RUN_ID, snapshotRef: process.env.CHOOM_SNAPSHOT_ID,
      baselineId: process.env.CHOOM_BASELINE_ID };
    for (const [key, prefix] of [['runRef', 'run'], ['snapshotRef', 'snapshot'], ['baselineId', 'baseline']])
      assert(new RegExp('^' + prefix + '-[a-z0-9]+(?:-[a-z0-9]+)*$').test(ids[key] ?? ''), 'Set ' + key + ' to a simple new ID.');
    mkdirSync(work); mkdirSync(join(work, 'snapshot')); mkdirSync(join(work, 'evidence'));
    saveJson('evidence/stage1-inputs.json', { formatVersion: 1, ...ids, target, tools, ...layout, startedAt: utc() });
    save('evidence/stage-1-commands.mjs', readFileSync(self));
    save('evidence/' + layoutHelper, readFileSync(layoutSource));
    save('evidence/cookbook.md', readFileSync(join(tools, 'docs/design/app-a/step-1-cookbook.md')));
    saveJson('evidence/tools.json', { node: process.version, tsMorph: require('ts-morph/package.json').version,
      typescript: require('ts-morph').ts.version, yaml: require('yaml/package.json').version });
    const protectedRule = layout.requiredExclusion ? layout.requiredExclusion + '\n' : '';
    save('exclusions.txt', protectedRule +
      '.*/\n.git\nnode_modules\n.env\n.env.*\n.npmrc\n.yarnrc*\n*.pem\n*.key\n/dist/\n/coverage/\n/reports/\n/test-results/\n/target/\n/src-tauri/target/\n');
    save('evidence/scope-notes.md', 'The initial capture excludes dot-prefixed directories, dependencies, common credential files, and listed root build/report folders. Hidden CI and tool settings may be missing. Generated source outside the listed folders remains eligible. Review and amend these exclusions before capture.\n' +
      '\nWorking folder layout: ' + layout.workLayout + '.\n' +
      (protectedRule ? 'The required ' + layout.requiredExclusion + ' exclusion keeps the entire local run area out of the captured tool checkout.\n' : ''));
    saveJson('evidence/extra-configs.json', []);
    save('evidence/commands.md', '# Stage 1 commands\n');
    console.log('Working folder prepared. Review exclusions.txt and scope-notes.md before capture.');
  } else {
    assert(realpathSync(work) === work, 'Use the canonical working-folder path.');
    const inputs = json('evidence/stage1-inputs.json');
    assert(inputs.tools === tools && read('evidence/stage-1-commands.mjs').equals(readFileSync(self)) &&
      read('evidence/' + layoutHelper).equals(readFileSync(layoutSource)),
      'The trusted helper changed since start. Use the saved tool checkout version.');
    if (action !== 'verify') assert(!present('run.yaml'), 'Stage 1 is already published. Use verify, not a repeated stage.');
    if (action === 'capture') {
      assert(args.length === 0 && !present('evidence/capture.json'), 'Capture already attempted; use a new working folder.');
      const layout = captureLayout(inputs.target);
      assert(layout.workLayout === inputs.workLayout && layout.requiredExclusion === inputs.requiredExclusion,
        'Capture layout differs from the saved inputs.');
      const exclusions = read('exclusions.txt');
      const scopeNotes = read('evidence/scope-notes.md');
      assert(exclusions.length && scopeNotes.length, 'Record capture scope first.');
      const protectedArgs = [];
      if (layout.requiredExclusion) {
        const rules = exclusions.toString().split(/\r\n|\r|\n/);
        assert(rules.includes(layout.requiredExclusion),
          'Keep the required ' + layout.requiredExclusion + ' line in exclusions.txt.');
        assert(!exclusions.includes(0) && !rules.some(rule => rule.trim() === '!'),
          'Capture exclusions cannot contain a NUL byte or clear the filter list.');
        protectedArgs.push('--exclude=' + layout.requiredExclusion);
      }
      const captureArgs = [...protectedArgs, '--exclude-from=-',
        inputs.target + '/', join(work, 'snapshot') + '/'];
      command('rsync', ['--version'], 'evidence/rsync-version');
      command('rsync', ['-rlt', '--links', ...captureArgs], 'evidence/capture', { input: exclusions });
      const comparison = command('rsync', ['-rcnl', '--delete', '--itemize-changes', ...captureArgs],
        'evidence/capture-comparison', { input: exclusions });
      assert(comparison.toString().trim() === '', 'Capture comparison found changes. Use a new folder and retry.');
      assert(exclusions.equals(read('exclusions.txt')) && scopeNotes.equals(read('evidence/scope-notes.md')),
        'Capture scope changed during capture. Use a new folder and retry.');
      // Later graph and publication profiles require regular files. Reject links at capture.
      const paths = enumerate('snapshot');
      const inventory = { formatVersion: 1, snapshotId: inputs.snapshotRef, files: paths.map(path => {
        const bytes = read(path); return { path: path.slice('snapshot/'.length), kind: 'file', bytes: bytes.length, sha256: hash(bytes) };
      }) };
      saveJson('evidence/inventory.json', inventory);
      save('evidence/captured-at.txt', utc() + '\n');
      saveJson('evidence/capture-scope.json', { formatVersion: 1, snapshotRef: inputs.snapshotRef, ...layout,
        exclusionsSha256: hash(exclusions), scopeNotesSha256: hash(scopeNotes) });
      save('inventory.mjs', `import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const root = join(process.env.CHOOM_WORK, 'snapshot');
const files = [];
function visit(relative = '') {
  for (const name of readdirSync(join(root, relative)).sort()) {
    const path = relative ? relative + '/' + name : name;
    const absolute = join(root, path); const stat = lstatSync(absolute);
    if (stat.isDirectory()) visit(path);
    else if (stat.isFile()) { const bytes = readFileSync(absolute); files.push({ path, kind: 'file', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    else throw new Error('Unsupported filesystem item: ' + path);
  }
}
visit(); console.log(JSON.stringify({ formatVersion: 1, snapshotId: ${JSON.stringify(inputs.snapshotRef)}, files }, null, 2));
`);
      save('settings.mjs', settingsRecipe());
      console.log(`Captured ${inventory.files.length} regular files. Atomic capture is not proven.`);
    } else if (action === 'settings') {
      assert(args.length === 0, 'settings takes no arguments.');
      const inventory = json('evidence/inventory.json'); verifyInventory(inventory);
      const extras = json('evidence/extra-configs.json');
      assert(Array.isArray(extras) && extras.every(safe), 'Extra compiler settings must be saved relative paths.');
      if (!present('evidence/settings-probes')) mkdirSync(join(work, 'evidence/settings-probes'));
      const prior = readdirSync(join(work, 'evidence/settings-probes')).map(name => /^probe-([0-9]+)\./.exec(name))
        .filter(Boolean).map(match => Number(match[1]));
      const n = Math.max(0, ...prior) + 1;
      const stem = 'evidence/settings-probes/probe-' + String(n).padStart(3, '0');
      save(stem + '.extra-configs.json', read('evidence/extra-configs.json'));
      const bytes = command(process.execPath, [join(work, 'settings.mjs')], stem, { timeout: 60_000 });
      const result = JSON.parse(bytes); assert(result.snapshotId === inputs.snapshotRef, 'Wrong settings snapshot.');
      save(stem + '.result.json', bytes);
      writeFileSync(join(work, 'evidence/settings.json'), bytes);
      writeFileSync(join(work, 'evidence/settings-selection.json'), JSON.stringify({ formatVersion: 1,
        snapshotRef: inputs.snapshotRef, probe: stem, settingsSha256: hash(bytes),
        extraConfigsSha256: hash(read('evidence/extra-configs.json')),
        collectorSha256: hash(read('settings.mjs')) }, null, 2) + '\n');
      console.log('Settings collected. Evidence ID for this probe: ' + artifactId(stem + '.result.json'));
    } else if (action === 'excerpt') {
      assert(args.length === 4 && text(args[3]), 'Use excerpt PATH FIRST LAST REASON.');
      const inventory = json('evidence/inventory.json');
      if (!present('evidence/excerpts')) mkdirSync(join(work, 'evidence/excerpts'));
      const n = readdirSync(join(work, 'evidence/excerpts')).length + 1;
      const path = 'evidence/excerpts/excerpt-' + String(n).padStart(3, '0') + '.json';
      const id = 's1-source-' + String(n).padStart(3, '0');
      const result = { formatVersion: 1, id, artifactRef: artifactId(path), reason: args[3], ...sourceRange(args[0], Number(args[1]), Number(args[2]), inventory) };
      saveJson(path, result); console.log(JSON.stringify(result, null, 2));
    } else if (action === 'finish') {
      assert(args.length === 1 && isAbsolute(args[0]), 'Use finish /absolute/review-folder.');
      const reviewDir = realpathSync(args[0]);
      assert(!reviewDir.startsWith(work + '/') && reviewDir !== work, 'Keep review inputs outside the saved run.');
      const inventory = json('evidence/inventory.json'); verifyInventory(inventory);
      const capturedScope = json('evidence/capture-scope.json');
      assert(capturedScope.snapshotRef === inputs.snapshotRef && capturedScope.workLayout === inputs.workLayout &&
        capturedScope.requiredExclusion === inputs.requiredExclusion && capturedScope.exclusionsSha256 === hash(read('exclusions.txt')) &&
        capturedScope.scopeNotesSha256 === hash(read('evidence/scope-notes.md')), 'Capture exclusions or scope notes changed after capture.');
      const settings = json('evidence/settings.json');
      assert(settings.formatVersion === 1 && settings.snapshotId === inputs.snapshotRef && Array.isArray(settings.configs) &&
        Array.isArray(settings.packages), 'Complete settings collection before the final review.');
      const selection = json('evidence/settings-selection.json');
      assert(selection.formatVersion === 1 && selection.snapshotRef === inputs.snapshotRef && safe(selection.probe) &&
        selection.settingsSha256 === hash(read('evidence/settings.json')) &&
        selection.settingsSha256 === hash(read(selection.probe + '.result.json')) &&
        selection.extraConfigsSha256 === hash(read('evidence/extra-configs.json')) &&
        selection.extraConfigsSha256 === hash(read(selection.probe + '.extra-configs.json')) &&
        selection.collectorSha256 === hash(read('settings.mjs')) && json(selection.probe + '.json').exitCode === 0,
      'Settings do not match the selected successful probe and current extra paths. Rerun settings before review.');
      const packet = ['review.yaml', 'review-scope.json', 'llm-prompt.md', 'llm-response.md', 'llm-call.yaml'];
      const bytes = new Map(packet.map(name => {
        const path = join(reviewDir, name); assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a regular review file: ' + name);
        return [name, readFileSync(path)];
      }));
      const review = parse(bytes.get('review.yaml').toString());
      const lists = ['reviewedFiles', 'roles', 'workspaceDeclarations', 'questions', 'gaps'];
      assert(review?.formatVersion === 1 && review.snapshotRef === inputs.snapshotRef && review.llmReview === 'recorded' &&
        lists.every(key => Array.isArray(review[key])) && Object.keys(review).length === lists.length + 3,
      'Expected a complete Stage 1 review.');
      const call = parse(bytes.get('llm-call.yaml').toString());
      assert(call && ['provider', 'model', 'date'].every(key => text(call[key])) &&
        (call.settings === 'unknown' || (call.settings !== null && typeof call.settings === 'object' && !Array.isArray(call.settings))),
      'Record LLM provider, model, date and settings; use unknown for unavailable metadata.');
      assert(packet.every(name => bytes.get(name).length), 'Empty review packet file.');
      assert(bytes.get('llm-response.md').toString().includes(bytes.get('review.yaml').toString().trim()),
        'Save the complete final review YAML in the LLM response.');
      const artifacts = new Map(enumerate('evidence').map(path => [artifactId(path), { path, bytes: read(path) }]));
      artifacts.set('exclusions-001', { path: 'exclusions.txt', bytes: read('exclusions.txt') });
      const sources = new Map(); const ids = new Set([...artifacts.keys(), ...packet.map(name => artifactId('evidence/' + name)), 'discovery-001']);
      const excerpts = [...artifacts.values()].filter(record => record.path.startsWith('evidence/excerpts/')).map(record => JSON.parse(record.bytes));
      for (const excerpt of excerpts) {
        const expected = sourceRange(excerpt.path, excerpt.lines?.[0], excerpt.lines?.[1], inventory);
        assert(text(excerpt.id) && !artifacts.has(excerpt.id) && excerpt.snapshotRef === expected.snapshotRef &&
          excerpt.sha256 === expected.sha256 && excerpt.excerpt === expected.excerpt && excerpt.totalLines === expected.totalLines,
        'Saved excerpt differs from indexed source: ' + excerpt.id);
      }
      for (const source of review.reviewedFiles) {
        assert(text(source.id) && !ids.has(source.id), 'Duplicate source ID: ' + source.id); ids.add(source.id);
        const expected = sourceRange(source.path, source.lines?.[0], source.lines?.[1], inventory);
        assert(source.snapshotRef === expected.snapshotRef && source.sha256 === expected.sha256 &&
          excerpts.some(excerpt => excerpt.id === source.id && excerpt.path === source.path && excerpt.sha256 === source.sha256 &&
            isDeepStrictEqual(excerpt.lines, source.lines)), 'No exact supplied excerpt supports source record: ' + source.id);
        sources.set(source.id, source);
      }
      for (const excerpt of excerpts) ids.add(excerpt.id);
      function reference(ref) {
        assert(text(ref), 'Empty evidence reference.');
        const at = ref.indexOf('#'); const id = at < 0 ? ref : ref.slice(0, at);
        assert(artifacts.has(id) || sources.has(id), 'Unknown evidence reference: ' + ref);
        if (at < 0) return;
        let value = sources.get(id);
        if (!value) { const record = artifacts.get(id); value = record.path.endsWith('.json') ? JSON.parse(record.bytes) : parse(record.bytes.toString()); }
        const pointer = decodeURIComponent(ref.slice(at + 1));
        assert(pointer === '' || pointer.startsWith('/'), 'Invalid JSON Pointer: ' + ref);
        for (const encoded of pointer === '' ? [] : pointer.slice(1).split('/')) {
          assert(!/~(?:[^01]|$)/.test(encoded), 'Invalid JSON Pointer: ' + ref);
          const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
          assert(value !== null && typeof value === 'object' && Object.hasOwn(value, key), 'Unresolved JSON Pointer: ' + ref); value = value[key];
        }
      }
      for (const key of ['roles', 'workspaceDeclarations', 'questions', 'gaps']) for (const item of review[key]) {
        assert(Array.isArray(item.evidenceRefs) && item.evidenceRefs.length, 'Missing evidence in ' + key);
        item.evidenceRefs.forEach(reference);
        if (key === 'questions' || key === 'gaps') {
          assert(text(item.id) && !ids.has(item.id) && Array.isArray(item.subjectRefs) && item.subjectRefs.length &&
            item.subjectRefs.every(text) && text(item[key === 'questions' ? 'text' : 'reason']) &&
            (key !== 'gaps' || text(item.kind)), 'Invalid question or gap.'); ids.add(item.id);
        } else if (key === 'roles') assert(text(item.selector) && Array.isArray(item.roles) && item.roles.length &&
          item.roles.every(text) && ['observed', 'inferred'].includes(item.basis), 'Invalid role.');
        else assert(text(item.path) && Array.isArray(item.patterns) && item.patterns.every(text) &&
          ['verified', 'unverified'].includes(item.membershipStatus), 'Invalid workspace declaration.');
      }
      const scope = JSON.parse(bytes.get('review-scope.json'));
      assert(scope?.formatVersion === 1 && scope.runRef === inputs.runRef && scope.snapshotRef === inputs.snapshotRef &&
        Array.isArray(scope.suppliedArtifactRefs) && scope.suppliedArtifactRefs.every(text) && Array.isArray(scope.limits) &&
        scope.limits.every(text), 'Save the complete supplied-evidence scope with the review.');
      for (const id of scope.suppliedArtifactRefs) assert(artifacts.has(id), 'Unknown supplied artifact: ' + id);
      for (const id of ['inventory-001', 'settings-001', 'exclusions-001', 'scope-notes-001', 'extra-configs-001'])
        assert(scope.suppliedArtifactRefs.includes(id), 'Missing required supplied evidence: ' + id);
      for (const key of ['roles', 'workspaceDeclarations', 'questions', 'gaps']) for (const item of review[key])
        for (const ref of item.evidenceRefs) {
          const id = ref.split('#')[0];
          assert(sources.has(id) || scope.suppliedArtifactRefs.includes(id), 'Cited artifact was not declared supplied: ' + ref);
        }
      for (const source of review.reviewedFiles) {
        const supplied = excerpts.filter(excerpt => excerpt.path === source.path && excerpt.sha256 === source.sha256 &&
          isDeepStrictEqual(excerpt.lines, source.lines));
        assert(supplied.some(excerpt => scope.suppliedArtifactRefs.includes(excerpt.artifactRef)),
          'Reviewed source excerpt is absent from supplied-evidence scope: ' + source.id);
      }
      // Review packets are copied only after validation; the manifest is published last.
      for (const [name, content] of bytes) save('evidence/' + name, content);
      const discovery = { formatVersion: 1, kind: 'architecture-discovery', runRef: inputs.runRef,
        questions: review.questions, gaps: review.gaps };
      save('evidence/stage1-discovery.yaml', stringify(discovery));
      save('baseline.yaml', stringify({ formatVersion: 1, id: inputs.baselineId, parentId: null,
        components: [], interfaces: [], resources: [], rules: [] }));
      save('discovery.yaml', stringify(discovery));
      appendFileSync(join(work, 'evidence/commands.md'), '\nCompleted Stage 1 review and verification at ' + utc() + '.\n');
      const all = [...enumerate('evidence'), 'exclusions.txt', 'inventory.mjs', 'settings.mjs'];
      const registry = Object.fromEntries(all.map(path => [artifactId(path), { path, sha256: hash(read(path)) }]));
      assert(Object.keys(registry).length === all.length, 'Duplicate artifact IDs.');
      save('run.yaml', stringify({ formatVersion: 1, id: inputs.runRef, mode: 'A', status: 'in-progress',
        progress: { inventory: 'complete', baselineRecovery: 'pending' }, snapshot: { id: inputs.snapshotRef,
          root: 'snapshot', inventoryRef: 'inventory-001', exclusions: 'exclusions.txt',
          captureMethod: 'rsync copy followed by a checksum dry-run comparison',
          captureLimit: 'The copy was checked for differences; atomic capture is not proven.', sourcePath: inputs.target,
          capturedAt: read('evidence/captured-at.txt').toString().trim() },
        coverage: { inventoried: inventory.files.length + ' regular files in the selected capture scope.',
          inspected: 'Source ranges are in review-001#/reviewedFiles. Tool reads are separate.',
          unresolved: 'See discovery.yaml questions and gaps. The baseline is not yet recovered.' }, artifacts: registry }));
      console.log('Stage 1 saved. Run verify, then continue to Stage 2.');
    } else if (action === 'verify') {
      assert(args.length === 0, 'verify takes no arguments.');
      const run = parse(read('run.yaml').toString()); const inventory = json('evidence/inventory.json');
      assert(run.id === inputs.runRef && run.snapshot.id === inputs.snapshotRef && run.progress?.inventory === 'complete', 'Run identity mismatch.');
      for (const [id, record] of Object.entries(run.artifacts)) assert(hash(read(record.path)) === record.sha256, 'Changed artifact: ' + id);
      verifyInventory(inventory);
      console.log(JSON.stringify({ status: 'stage1-inputs-verified', runRef: run.id, snapshotRef: run.snapshot.id,
        registeredArtifacts: Object.keys(run.artifacts).length, files: inventory.files.length, writes: [] }, null, 2));
    }
  }
  if (!['finish', 'verify'].includes(action)) appendFileSync(join(work, 'evidence/commands.md'),
    '\n' + utc() + ' ' + JSON.stringify([process.execPath, self, action, ...args]) + '\n');
} catch (error) { console.error(error.message); process.exitCode = 1; }
