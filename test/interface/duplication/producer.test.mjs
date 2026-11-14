import { strict as assert } from 'node:assert';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixtureRun, digest } from '../../fixtures/duplication-producer/fixture.mjs';
import { startAssessment } from '../../../docs/design/app-a/duplication-commands.mjs';

// Given a completed baseline and snapshot, when a separate assessment starts,
// then it records the public endpoints and gaps without changing the prior run.
test('a separate assessment inventories saved public capabilities', () => {
  const fixture = fixtureRun();
  try {
    const outcome = startAssessment({ work: fixture.work, output: fixture.output, id: 'review-001' });
    assert.equal(outcome.status, 'started');
    const endpoints = JSON.parse(readFileSync(join(fixture.output, 'evidence/endpoints.json')));
    assert.equal(endpoints.endpoints.length, 21);
    assert.ok(endpoints.endpoints.some(endpoint => endpoint.interfaceId === 'invoice-type'));
    assert.equal(endpoints.coverage.unsupported, 1);
    assert.equal(endpoints.coverage.eligibleFunctions, null);
    assert.equal(digest(readFileSync(join(fixture.output, 'evidence/inventory.json'))),
      digest(readFileSync(join(fixture.work, 'evidence/inventory.json'))));
    assert.equal(digest(readFileSync(join(fixture.work, 'run.yaml'))), fixture.original);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('a changed baseline digest stops an assessment before collection', () => {
  const fixture = fixtureRun();
  try {
    writeFileSync(join(fixture.work, 'baselines/fixture-baseline/baseline.yaml'), '# changed\n');
    assert.throws(() => startAssessment({ work: fixture.work, output: fixture.output, id: 'review-002' }), /digest/i);
    assert.equal(digest(readFileSync(join(fixture.work, 'run.yaml'))), fixture.original);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
