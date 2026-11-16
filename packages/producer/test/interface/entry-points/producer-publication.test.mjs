import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { decodeBaselineYaml } from '../../../../../src/lib/baseline-yaml.ts';
import { producerFixture } from '../../fixtures/entry-points/producer.mjs';

const tools = realpathSync(fileURLToPath(new URL('../../../../../', import.meta.url)));
const attempt = 's6-fixture';
const command = join(tools, 'packages/producer/src/stage-6-commands.ts');

function stageSix(fixture, action, ...args) {
  const result = spawnSync('node', [command, action, ...args], { encoding: 'utf8',
    env: { ...process.env, CHOOM_TOOLS: tools, CHOOM_WORK: fixture.work, CHOOM_STAGE6_ID: attempt,
      CHOOM_STAGE6: join(fixture.work, 'evidence', attempt) } });
  assert.ifError(result.error);
  return result;
}

function publish(fixture) {
  const started = stageSix(fixture, 'start', fixture.review);
  assert.equal(started.status, 0, started.stderr);
  const finished = stageSix(fixture, 'finish');
  assert.equal(finished.status, 0, finished.stderr);
  return JSON.parse(finished.stdout);
}

test('publishes reviewed starts and external operations and keeps unresolved candidates in discovery', () => {
  const fixture = producerFixture();
  try {
    const { baselinePath, discoveryPath } = publish(fixture);
    const verified = stageSix(fixture, 'verify');
    assert.equal(verified.status, 0, verified.stderr);
    const verification = JSON.parse(verified.stdout);
    assert.equal(verification.status, 'stage6-completed-verified');
    assert.equal(verification.baselinePath, baselinePath);
    assert.equal(verification.discoveryPath, discoveryPath);
    const saved = readFileSync(join(fixture.work, baselinePath), 'utf8');
    assert.equal(decodeBaselineYaml(saved).status, 'success');
    const baseline = parse(saved);
    assert.equal(baseline.formatVersion, 4);
    assert.deepEqual(baseline.systemEntryPoints, fixture.baseline.systemEntryPoints);
    assert.deepEqual(baseline.systemEntryPoints.entries.map(({ kind, label, componentId }) => [kind, label, componentId]), [
      ['startup', 'CLI choom serve', 'cli'],
      ['external', 'HTTP GET /orders', 'http'],
      ['external', 'HTTP POST /orders', 'http'],
      ['external', 'MCP tool search', 'mcp'],
    ]);
    const discovery = parse(readFileSync(join(fixture.work, discoveryPath), 'utf8'));
    assert.deepEqual(discovery.gaps.map(({ subjectRefs }) => subjectRefs), [['plugin-candidate']]);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

for (const version of [3, 4]) {
  test('publishes version ' + version + ' with source use', () => {
    const fixture = producerFixture(baseline => {
      const { snapshotRef, mappingRef } = baseline.systemEntryPoints;
      baseline.formatVersion = version;
      baseline.sourceUsage = { snapshotRef, mappingRef, assessments: [] };
      if (version === 3) delete baseline.systemEntryPoints;
    });
    try {
      const { baselinePath } = publish(fixture);
      const result = decodeBaselineYaml(readFileSync(join(fixture.work, baselinePath), 'utf8'));
      assert.equal(result.status, 'success');
      assert.deepEqual(result.baseline, fixture.baseline);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });
}

function rejectsEntry(change, error) {
  const fixture = producerFixture(baseline => change(baseline.systemEntryPoints));
  try {
    const result = stageSix(fixture, 'start', fixture.review);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, error);
    const run = parse(readFileSync(join(fixture.work, 'run.yaml'), 'utf8'));
    assert.equal(run.status, 'in-progress');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}

test('rejects a system entry without its direct mapped file owner', () => {
  rejectsEntry(assessment => { assessment.entries[0].componentId = 'http'; }, /direct mapped owner/);
  rejectsEntry(assessment => { assessment.entries[0].path = 'missing.ts'; }, /direct mapped owner/);
});

// The shared baseline rules check the assessment shape and its internal links,
// as the viewer does. The producer checks the run snapshot, the selected mapping,
// the mapped owners, the registered evidence and the saved source ranges.
test('rejects an assessment from another snapshot or mapping', () => {
  rejectsEntry(assessment => {
    assessment.snapshotRef = 'old-snapshot';
    assessment.entries[1].source.location.snapshotRef = 'old-snapshot';
  }, /systemEntryPoints\.snapshotRef differs from the run snapshot/);
  rejectsEntry(assessment => { assessment.mappingRef = 'old-mapping'; }, /systemEntryPoints\.mappingRef/);
});

test('requires distinct registered assessment and entry evidence', () => {
  rejectsEntry(assessment => { assessment.evidenceRefs = []; },
    /invalid at systemEntryPoints\.evidenceRefs: Too small: expected array to have >=1 items/);
  rejectsEntry(assessment => { assessment.entries[0].evidenceRefs = ['unregistered']; }, /Unknown evidence: unregistered/);
  rejectsEntry(assessment => { assessment.entries[0].evidenceRefs = ['launch-settings', 'launch-settings']; },
    /invalid at systemEntryPoints\.entries\.0\.evidenceRefs: Evidence references must be distinct\./);
});

test('requires the cited direct source record to match the entry and saved range', () => {
  rejectsEntry(assessment => { assessment.entries[1].source.location.lines = [1, 2]; }, /differs from its saved source record/);
  rejectsEntry(assessment => { assessment.entries[1].source.location.path = 'cli.ts'; },
    /invalid at systemEntryPoints\.entries\.1\.source\.location\.path: The source path must match the system entry path\./);
  rejectsEntry(assessment => { assessment.entries[1].evidenceRefs = ['launch-settings']; },
    /invalid at systemEntryPoints\.entries\.1\.source\.evidenceRef: The source reference must be included in entry evidence\./);
  rejectsEntry(assessment => {
    const entry = assessment.entries[1];
    entry.source.evidenceRef += '#/path';
    entry.evidenceRefs[1] = entry.source.evidenceRef;
  }, /invalid at systemEntryPoints\.entries\.1\.source\.evidenceRef: A source location needs a direct source-record reference\./);
});

test('requires optional links to resolve to an interface or to its documented entry', () => {
  rejectsEntry(assessment => { assessment.entries[1].interfaceId = 'missing'; },
    /invalid at systemEntryPoints\.entries\.1\.interfaceId: The system entry must name an existing interface\./);
  rejectsEntry(assessment => { delete assessment.entries[1].interfaceId; },
    /invalid at systemEntryPoints\.entries\.1\.entryId: An interface entry link needs an interface ID\./);
  rejectsEntry(assessment => { assessment.entries[1].entryId = 'missing'; },
    /invalid at systemEntryPoints\.entries\.1\.entryId: The linked entry must belong to this interface's documentation\./);
});

test('enforces system-entry count and compact UTF-8 budgets independently', () => {
  rejectsEntry(assessment => {
    const original = assessment.entries[0];
    assessment.entries = Array.from({ length: 2001 }, (_, index) => ({ ...original, id: 'start-' + index }));
  }, /invalid at systemEntryPoints\.entries: The system-entry limit is 2000 records\./);
  rejectsEntry(assessment => {
    const original = assessment.entries[0];
    const label = 'é'.repeat(4096);
    assessment.entries = Array.from({ length: 256 }, (_, index) => ({ ...original, id: 'start-' + index, label }));
  }, /invalid at systemEntryPoints: The combined system-entry limit is 2097152 UTF-8 bytes\./);
});
