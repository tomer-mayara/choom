import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function recordedReview(fixture) {
  const declarations = { find: ['lookup.ts', 1, 4], alias: ['lookup.ts', 5, 5], wrapper: ['lookup.ts', 6, 6],
    alternative: ['alternative.ts', 1, 4], observer: ['observer.ts', 2, 5], geometry: ['geometry.ts', 2, 5],
    'safe-name': ['safe-name.ts', 1, 5], 'safe-path': ['safe-path.ts', 1, 5],
    'invoice-type': ['types.ts', 1, 1], fields: ['types.ts', 2, 2],
    list: ['lookup.ts', 7, 7], 'observer-context': ['observer.ts', 1, 8], 'geometry-context': ['geometry.ts', 1, 8], private: ['private.ts', 1, 10] };
  const sources = Object.entries(declarations).map(([id, [path, first, last]]) => ({
    snapshotId: fixture.inventory.snapshotId, path, sha256: fixture.inventory.files.find(file => file.path === path).sha256,
    lines: [first, last], evidenceRef: 'source-' + id,
  }));
  const endpoint = (id, entry = true) => ({ interfaceId: id, ...(entry ? { entryId: entry === true ? 'entry' : entry } : {}),
    evidenceRefs: ['source-' + (entry === 'list' ? 'list' : id)] });
  const mappings = fixture.baseline.interfaces.map(record => ({ endpoint: endpoint(record.id), sourceRef: 'source-' + record.id }));
  mappings.push({ endpoint: endpoint('find', 'list'), sourceRef: 'source-list' });
  const findings = [];
  function finding(left, right, status, overlap, rationale, differences = [], gaps = []) {
    const evidenceRefs = ['source-' + left, 'source-' + right];
    const contexts = sources.filter(source => [left + '-context', right + '-context'].some(id => source.evidenceRef === 'source-' + id));
    evidenceRefs.push(...contexts.map(source => source.evidenceRef));
    findings.push({ id: 'fixture-' + left + '-' + right, kind: 'interface-pair', endpoints: [endpoint(left, false), endpoint(right, false)],
      observations: [{ origin: 'source-review', endpoints: [endpoint(left), endpoint(right)], score: null,
        method: 'bounded-source-review', toolVersion: null, evidenceRefs }],
      status, overlap, rationale, differences, gaps, facts: [], evidenceRefs, counterevidenceRefs: contexts.map(source => source.evidenceRef),
      sources: sources.filter(source => evidenceRefs.includes(source.evidenceRef)),
      review: { worker: 'recorded-fixture-worker', model: 'recorded-fixture', settingsRef: 'review-input',
        manager: 'recorded-fixture-manager', reviewedAt: '2026-11-13T00:00:00Z', decisionRefs: ['review-input'] } });
  }
  for (const right of ['alias', 'wrapper', 'alternative']) finding('find', right, 'potential-redundancy',
    'Both public entry points return the fixture invoice for its ID, or undefined when it is absent.',
    'These fictional fixture lookup entries offer the same supported capability. This does not judge the separate List invoices entry. Review consolidation and compatibility before changing them.',
    [right === 'alternative' ? 'The alternative creates a Map; findInvoice searches an array.' : 'The second entry is an alias or a thin forwarder.']);
  finding('observer', 'geometry', 'justified-distinction', 'Both register callbacks and return an unsubscribe action.',
    'The interfaces own separate load and position observer sets. Keep the independent state owners and event policies.',
    ['Load publication snapshots listeners and catches their exceptions. Position publication iterates its live set and propagates exceptions.']);
  finding('safe-name', 'safe-path', 'insufficient-evidence', 'Both reject empty input and selected forbidden characters.',
    'The accepted character sets differ. The fixture does not establish whether their policies should agree.',
    ['safeName rejects backslash, NUL, CR and LF. safePath also rejects the remaining ASCII controls and DEL.'],
    ['The intended validation policy is not recorded.']);
  const collection = JSON.parse(readFileSync(join(fixture.output, 'evidence/collection.json')));
  return { sources, mappings, findings,
    reviewer: { worker: 'recorded-fixture-worker', model: 'recorded-fixture', settingsRef: 'review-input',
      manager: 'recorded-fixture-manager', reviewedAt: '2026-11-13T00:00:00Z', decisionRefs: ['review-input'] },
    scope: { examined: fixture.baseline.interfaces.flatMap(record => [endpoint(record.id, false),
      ...record.documentation.entries.map(entry => endpoint(record.id, entry.id))]),
      groups: [
        { name: 'Invoice lookup', interfaces: ['find', 'alias', 'wrapper', 'alternative'], reason: 'Compare supported ID lookup operations.' },
        { name: 'Subscriptions', interfaces: ['observer', 'geometry'], reason: 'Compare registration and ownership/notification policies.' },
        { name: 'Path policy', interfaces: ['safe-name', 'safe-path'], reason: 'Compare accepted inputs, including literal differences.' },
        { name: 'Non-callable data', interfaces: ['invoice-type', 'fields'], reason: 'Type and field inventory have different roles; callable topics do not apply.' },
      ], gaps: [] },
    exclusions: collection.observations.flatMap((observation, index) => observation.left.path === 'private.ts'
      ? [{ index, kind: 'helper-only', reason: 'Both private render helpers have no public-interface mapping.', evidenceRefs: ['source-private'] }] : []) };
}
