import { strict as assert } from 'node:assert';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixtureRun } from '../../fixtures/duplication-producer/fixture.mjs';
import { recordedReview } from '../../fixtures/duplication-producer/review.mjs';
import { startAssessment, collectAssessment, reviewAssessment, publishAssessment } from '../../../docs/design/app-a/duplication-commands.mjs';
import { decodeBaselineYaml } from '../../../src/lib/baseline-yaml.ts';
import { decodeDuplicationReportYaml } from '../../../src/lib/interface-duplication-yaml.ts';
import { digest } from '../../fixtures/duplication-producer/fixture.mjs';

function assessment() {
  const fixture = fixtureRun();
  startAssessment({ work: fixture.work, output: fixture.output, id: 'review-fixture' });
  collectAssessment({ output: fixture.output });
  return fixture;
}

// Given recorded independent review of source and detector leads, when the
// packet is saved, then both non-clone leads and justified distinctions survive.
test('records non-clone capability leads and honest reviewed distinctions', () => {
  const fixture = assessment();
  try {
    const outcome = reviewAssessment({ output: fixture.output, review: recordedReview(fixture) });
    assert.equal(outcome.status, 'reviewed');
    const report = JSON.parse(readFileSync(join(fixture.output, 'evidence/report-draft.json')));
    assert.equal(report.findings.length, 5);
    assert.equal(report.findings.filter(item => item.status === 'potential-redundancy').length, 3);
    assert.equal(report.findings.filter(item => item.status === 'justified-distinction').length, 1);
    assert.equal(report.findings.filter(item => item.status === 'insufficient-evidence').length, 1);
    assert.equal(report.findings.filter(item => item.observations.every(value => value.score === null)).length, 3);
    assert.equal(report.scan.counts.helperOnly, 1);
    assert.equal(report.scan.counts.unmapped, 0);
    assert.equal(report.review.status, 'completed');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('missing endpoint review remains partial and cannot silently complete', () => {
  const fixture = assessment();
  try {
    const review = recordedReview(fixture);
    review.scope.examined.pop();
    reviewAssessment({ output: fixture.output, review });
    const report = JSON.parse(readFileSync(join(fixture.output, 'evidence/report-draft.json')));
    assert.equal(report.review.status, 'partial');
    assert.ok(report.review.gaps.some(gap => gap.includes('fields')));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('unverified source hashes cannot support a review', () => {
  const fixture = assessment();
  try {
    const review = recordedReview(fixture);
    review.sources[0].sha256 = '0'.repeat(64);
    assert.throws(() => reviewAssessment({ output: fixture.output, review }), /digest|source/i);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('a review packet requires an independent manager even with no findings', () => {
  const fixture = assessment();
  try {
    const review = recordedReview(fixture);
    delete review.reviewer;
    assert.throws(() => reviewAssessment({ output: fixture.output, review }), /manager|provenance/i);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('unstarted capability review remains a partial packet', () => {
  const fixture = assessment();
  try {
    const review = recordedReview(fixture);
    review.scope.examined = [];
    review.scope.groups = [];
    review.findings = [];
    reviewAssessment({ output: fixture.output, review });
    const report = JSON.parse(readFileSync(join(fixture.output, 'evidence/report-draft.json')));
    assert.equal(report.review.status, 'partial');
    assert.ok(report.review.pending > 0);
    assert.equal(report.findings.filter(finding => finding.status === 'potential-redundancy').length, 0);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('publishes a report accepted by the actual portable reader', () => {
  const fixture = assessment();
  try {
    reviewAssessment({ output: fixture.output, review: recordedReview(fixture) });
    const outcome = publishAssessment({ output: fixture.output });
    assert.equal(outcome.status, 'published');
    assert.equal(outcome.outcome, 'partial');
    const baselineBytes = readFileSync(join(fixture.output, 'baseline.yaml'));
    const baseline = decodeBaselineYaml(baselineBytes.toString('utf8'));
    assert.equal(baseline.status, 'success');
    const report = decodeDuplicationReportYaml(readFileSync(join(fixture.output, 'interface-duplication-review.yaml'), 'utf8'),
      baseline.baseline, digest(baselineBytes));
    assert.equal(report.status, 'success');
    assert.equal(report.report.findings.length, 5);
    assert.ok(report.report.findings.every(item => item.id.startsWith('dup-')));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('publishes actual exact-token evidence with a defined detector score', () => {
  const body = [
    '  const invoice = { id: "one", amount: 10, currency: "USD", tax: 0, paid: false };',
    '  const metadata = { version: 1, source: "fixture", region: "local", archived: false };',
    '  const labels = ["invoice", "lookup", "billing", "current", "public", "saved"];',
    '  const policy = { allowMissing: true, allowEmpty: false, allowDeleted: false };',
    '  const result = { invoice, metadata, labels, policy, requested: id, found: invoice.id === id };',
    '  return result.found ? result : undefined;',
  ].join('\n');
  const lookup = `export function findInvoice(id: string) {\n${body}\n}\n`;
  const fixture = fixtureRun({
    'lookup.ts': lookup + 'export const lookupInvoice = findInvoice;\nexport const getInvoice = (id: string) => findInvoice(id);\nexport const listInvoices = () => [];\n',
    'alternative.ts': `export function lookup(id: string) {\n${body}\n}\n`,
  });
  try {
    startAssessment({ work: fixture.work, output: fixture.output, id: 'token-fixture' });
    assert.ok(['completed', 'partial'].includes(collectAssessment({ output: fixture.output }).status));
    const review = recordedReview(fixture);
    const ranges = { find: [1, 8], alternative: [1, 8], alias: [9, 9], wrapper: [10, 10], list: [11, 11] };
    for (const source of review.sources) source.lines = ranges[source.evidenceRef.slice(7)] ?? source.lines;
    const collection = JSON.parse(readFileSync(join(fixture.output, 'evidence/collection.json')));
    for (const [index, observation] of collection.observations.entries()) {
      if (observation.origin !== 'jscpd-token') continue;
      for (const [side, range] of [['left', observation.left], ['right', observation.right]]) {
        const id = range.path === 'lookup.ts' ? 'find' : range.path === 'alternative.ts' ? 'alternative' : null;
        if (!id || range.lines[0] < 1 || range.lines[1] > 8) continue;
        const evidenceRef = `source-token-${index}-${side}`;
        const source = review.sources.find(value => value.evidenceRef === 'source-' + id);
        review.sources.push({ ...source, lines: range.lines, evidenceRef });
        review.mappings.push({ sourceRef: evidenceRef,
          endpoint: { interfaceId: id, entryId: 'entry', evidenceRefs: [source.evidenceRef, evidenceRef] } });
      }
    }
    // This regression records leads only; it makes no semantic judgment about these new bodies.
    review.findings = [];
    reviewAssessment({ output: fixture.output, review });
    const draft = JSON.parse(readFileSync(join(fixture.output, 'evidence/report-draft.json')));
    assert.ok(draft.findings.some(finding => finding.observations.some(value => value.origin === 'jscpd-token')));
    assert.equal(publishAssessment({ output: fixture.output }).status, 'published');
    const token = draft.findings.flatMap(finding => finding.observations).find(value => value.origin === 'jscpd-token');
    assert.equal(token.score, 1);
    assert.equal(token.method, 'exact-token-block');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('ambiguous public mappings cannot disappear as private helper exclusions', () => {
  const fixture = assessment();
  try {
    const review = recordedReview(fixture);
    const collection = JSON.parse(readFileSync(join(fixture.output, 'evidence/collection.json')));
    const index = collection.observations.findIndex(value => [value.left.path, value.right.path].sort().join(',') === 'geometry.ts,observer.ts');
    assert.ok(index >= 0);
    for (const id of ['observer', 'geometry']) {
      const mapping = structuredClone(review.mappings.find(value => value.endpoint.interfaceId === id));
      delete mapping.endpoint.entryId;
      review.mappings.push(mapping);
    }
    review.findings = review.findings.filter(value => !value.endpoints.some(endpoint => endpoint.interfaceId === 'observer'));
    review.exclusions.push({ index, kind: 'helper-only', reason: 'Proposed private helper classification.',
      evidenceRefs: ['source-observer', 'source-geometry'] });
    assert.throws(() => reviewAssessment({ output: fixture.output, review }), /ambiguous|helper/i);
    review.exclusions = review.exclusions.filter(value => value.index !== index);
    reviewAssessment({ output: fixture.output, review });
    assert.equal(publishAssessment({ output: fixture.output }).outcome, 'partial');
    const draft = JSON.parse(readFileSync(join(fixture.output, 'evidence/report-draft.json')));
    assert.equal(draft.scan.counts.helperOnly, 1);
    assert.equal(draft.scan.counts.unmapped, 1);
    assert.ok(draft.scan.mappingGaps.some(value => value.includes('Ambiguous')));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('private method clones cannot map to their enclosing public types', () => {
  const source = operation => `export class subscribe {\n  private helper(value: string) {\n    const prefix = "Name: ";\n    const result = prefix + value;\n    return result.trim();\n  }\n  ${operation}() { return this.helper("one"); }\n}\n`;
  const fixture = fixtureRun({ 'observer.ts': source('onLoad'), 'geometry.ts': source('onMove') },
    { observer: 'type', geometry: 'type' });
  try {
    startAssessment({ work: fixture.work, output: fixture.output, id: 'private-method-fixture' });
    collectAssessment({ output: fixture.output });
    const review = recordedReview(fixture);
    for (const source of review.sources) if (['source-observer', 'source-geometry'].includes(source.evidenceRef)) source.lines = [1, 8];
    review.findings = review.findings.filter(value => !value.endpoints.some(endpoint => endpoint.interfaceId === 'observer'));
    const collection = JSON.parse(readFileSync(join(fixture.output, 'evidence/collection.json')));
    assert.ok(collection.observations.some(value => [value.left, value.right].every(side =>
      ['observer.ts', 'geometry.ts'].includes(side.path) && side.lines[0] === 2 && side.lines[1] === 6)));
    review.exclusions = review.exclusions.filter(value => [collection.observations[value.index].left,
      collection.observations[value.index].right].every(side => side.path === 'private.ts'));
    reviewAssessment({ output: fixture.output, review });
    const draft = JSON.parse(readFileSync(join(fixture.output, 'evidence/report-draft.json')));
    assert.ok(!draft.findings.some(value => value.endpoints.some(endpoint => ['observer', 'geometry'].includes(endpoint.interfaceId))));
    assert.ok(draft.scan.counts.unmapped > 0);
    assert.equal(publishAssessment({ output: fixture.output }).outcome, 'partial');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
