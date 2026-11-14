import { strict as assert } from 'node:assert';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixtureRun } from '../../fixtures/duplication-producer/fixture.mjs';
import { collectAssessment, skipAssessment, startAssessment } from '../../../docs/design/app-a/duplication-commands.mjs';
import { normalizeDetector } from '../../../docs/design/app-a/duplication-detector.mjs';

const side = name => ({ name, start: 1, end: 4 });
const clone = (first, second) => ({ firstFile: side(first), secondFile: side(second), method: 'ast', similarity: 1 });
const ednPair = (first, second) => `{:score 1.0 :language "typescript" :left {:file "${first}" :start-line 1 :end-line 4} :right {:file "${second}" :start-line 1 :end-line 4} :left-nodes 40 :right-nodes 40}`;

test('full EDN candidates survive a grouped JSON report', () => {
  const json = { duplicates: [clone('a.ts', 'b.ts'), clone('b.ts', 'c.ts')], statistics: { total: { sources: 3, clones: 2 } } };
  const edn = `{:candidates [${ednPair('a.ts', 'b.ts')} ${ednPair('b.ts', 'c.ts')} ${ednPair('a.ts', 'c.ts')}] :clones []}`;
  const result = normalizeDetector(json, edn, '/saved');
  assert.equal(result.observations.length, 3);
  assert.deepEqual(result.accounting, { astCandidates: 3, tokenClones: 0, jsonAstLinks: 2, jsonTokenLinks: 0, examined: 3 });
});

test('invalid EDN and inconsistent JSON are not zero results', () => {
  assert.throws(() => normalizeDetector({ duplicates: [] }, '{:candidates []', '/saved'), /EDN|report/i);
  assert.throws(() => normalizeDetector({ duplicates: [clone('a.ts', 'b.ts')], statistics: { total: { sources: 2, clones: 1 } } },
    '{:candidates [] :clones []}', '/saved'), /reconcil|match/i);
});

test('keeps EDN precision when JSON rounds structural scores', () => {
  const link = { ...clone('a.ts', 'b.ts'), similarity: 0.837 };
  const json = { duplicates: [link], statistics: { total: { sources: 2, clones: 1 } } };
  const edn = `{:candidates [${ednPair('a.ts', 'b.ts').replace(':score 1.0', ':score 0.837209302326')}] :clones []}`;
  assert.equal(normalizeDetector(json, edn, '/saved').observations[0].score, 0.837209302326);
});

// Given a saved fixture, when the pinned detector collects advisory evidence,
// then its complete candidates and exact invocation remain registered.
test('collects a real pinned scan without executing target configuration', () => {
  const fixture = fixtureRun();
  try {
    startAssessment({ work: fixture.work, output: fixture.output, id: 'scan-001' });
    const outcome = collectAssessment({ output: fixture.output });
    assert.equal(outcome.status, 'partial');
    const collected = JSON.parse(readFileSync(join(fixture.output, 'evidence/collection.json')));
    assert.equal(collected.tool.version, '5.4.2');
    assert.ok(collected.observations.length > 0);
    assert.ok(collected.invocation.args.includes('--no-gitignore'));
    assert.ok(collected.accounting.astCandidates >= collected.accounting.jsonAstLinks);
    assert.ok(collected.accounting.examined < collected.scope.length);
    assert.equal(collected.counts.excluded, null);
    assert.equal(readFileSync(join(fixture.work, 'snapshot/lookup.ts'), 'utf8'), fixture.sources['lookup.ts']);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('records an explicitly skipped detector without claiming a zero result', () => {
  const fixture = fixtureRun();
  try {
    startAssessment({ work: fixture.work, output: fixture.output, id: 'skipped-scan' });
    const outcome = skipAssessment({ output: fixture.output, reason: 'Pinned binary is unavailable on this operator host.' });
    assert.equal(outcome.status, 'skipped');
    const collected = JSON.parse(readFileSync(join(fixture.output, 'evidence/collection.json')));
    assert.equal(collected.counts.examined, null);
    assert.equal(collected.counts.unmapped, null);
    assert.ok(collected.diagnostics.some(message => message.includes('unavailable')));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
