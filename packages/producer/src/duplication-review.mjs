import { assert, hash, savedFile } from './duplication-files.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;
const endpointKey = endpoint => JSON.stringify([endpoint.interfaceId, endpoint.entryId ?? null]);
const verdicts = new Set(['needs-review', 'potential-redundancy', 'justified-distinction', 'insufficient-evidence']);

export function findingIdentity(endpoints) {
  assert(Array.isArray(endpoints) && endpoints.length === 2, 'A finding needs two endpoints.');
  const [left, right] = endpoints;
  if (left.interfaceId !== right.interfaceId) return ['interface-pair', ...[left.interfaceId, right.interfaceId].sort()];
  assert(left.entryId && right.entryId && left.entryId !== right.entryId, 'Reject self pairs and own-entry containment.');
  return ['entry-pair', left.interfaceId, ...[left.entryId, right.entryId].sort()];
}

function checkEndpoint(endpoint, baseline) {
  const record = baseline.interfaces.find(item => item.id === endpoint?.interfaceId);
  assert(record, 'Unknown interface endpoint.');
  assert(endpoint.entryId === undefined || record.documentation?.entries.some(entry => entry.id === endpoint.entryId), 'Unknown entry endpoint.');
  return endpoint;
}

function checkedSources(input, state) {
  assert(Array.isArray(input.sources), 'Review sources are required.');
  const sources = new Map();
  for (const source of input.sources) {
    assert(text(source.evidenceRef) && !sources.has(source.evidenceRef) && !Object.hasOwn(state.manifest.artifacts, source.evidenceRef),
      'Duplicate source evidence reference.');
    const indexed = state.inputs.inventory.files.find(file => file.path === source.path);
    assert(indexed && source.sha256 === indexed.sha256 && source.snapshotId === state.manifest.snapshot.id, 'Unverified source digest or snapshot.');
    const bytes = savedFile(state.inputs.snapshot, source.path);
    const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split(/\r\n|\r|\n/);
    assert(Array.isArray(source.lines) && source.lines.length === 2 && source.lines.every(line => Number.isSafeInteger(line) && line > 0) &&
      source.lines[0] <= source.lines[1] && source.lines[1] <= lines.length, 'Invalid saved source range.');
    sources.set(source.evidenceRef, { source, text: lines.slice(source.lines[0] - 1, source.lines[1]).join('\n') });
  }
  return sources;
}

function checkedMappings(input, state, sources) {
  assert(Array.isArray(input.mappings), 'Public endpoint mappings are required.');
  return input.mappings.map(mapping => {
    checkEndpoint(mapping.endpoint, state.inputs.baseline);
    assert(sources.has(mapping.sourceRef) && mapping.endpoint.evidenceRefs?.includes(mapping.sourceRef), 'A mapping needs its source evidence.');
    return { ...mapping, source: sources.get(mapping.sourceRef).source };
  });
}

function sourceEndpoints(range, mappings) {
  const matches = mappings.filter(({ source }) => source.path === range.path &&
    source.lines[0] === range.lines[0] && source.lines[1] === range.lines[1]);
  const endpoints = new Map(matches.map(mapping => [endpointKey(mapping.endpoint), mapping]));
  return [...endpoints.values()];
}

function refsKnown(value, refs) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith('Refs')) {
      assert(Array.isArray(child) && child.every(ref => refs.has(ref)), 'Unregistered review evidence: ' + key);
    } else if (key === 'settingsRef' || key === 'evidenceRef') {
      assert(refs.has(child), 'Unregistered review reference: ' + key);
    } else if (typeof child === 'object') refsKnown(child, refs);
  }
}

function checkProvenance(review) {
  assert(text(review?.worker) && text(review.manager) && review.worker !== review.manager &&
    text(review.model) && text(review.settingsRef) && text(review.reviewedAt) &&
    Number.isFinite(Date.parse(review.reviewedAt)) && review.decisionRefs?.length,
  'Independent manager review provenance is required.');
}

export function verifyReportEvidence(report, manifest) {
  refsKnown(report, new Set(Object.keys(manifest.artifacts)));
}

function reviewedFindings(input, state, sources, refs) {
  assert(Array.isArray(input.findings) && input.findings.length <= 1000, 'Invalid finding list.');
  const findings = new Map();
  for (const supplied of input.findings) {
    const finding = structuredClone(supplied);
    finding.endpoints.forEach(endpoint => checkEndpoint(endpoint, state.inputs.baseline));
    const identity = findingIdentity(finding.endpoints);
    const key = JSON.stringify(identity);
    assert(!findings.has(key), 'One decision is required per canonical finding. Group observations first.');
    assert(finding.kind === identity[0] && verdicts.has(finding.status), 'Invalid finding kind or status.');
    if (finding.status !== 'needs-review') {
      assert(text(finding.rationale), 'Reviewed findings need a rationale.');
      checkProvenance(finding.review);
    }
    if (finding.status === 'potential-redundancy') assert(text(finding.overlap), 'Potential redundancy needs a supported overlap.');
    if (finding.status === 'justified-distinction') assert(finding.differences?.some(text), 'A distinction needs its decisive difference.');
    if (finding.status === 'insufficient-evidence') assert(finding.gaps?.some(text), 'Insufficient evidence needs its exact gap.');
    for (const source of finding.sources) assert(JSON.stringify(source) === JSON.stringify(sources.get(source.evidenceRef)?.source), 'Unverified finding source.');
    refsKnown(finding, refs);
    finding.id = 'dup-' + hash(JSON.stringify([state.manifest.baseline.sha256, state.manifest.snapshot, identity]));
    findings.set(key, finding);
  }
  return findings;
}

function pendingFinding(left, right, observation, state) {
  const identity = findingIdentity([left.endpoint, right.endpoint]);
  const endpoints = [left.endpoint, right.endpoint].map(endpoint => identity[0] === 'interface-pair'
    ? { interfaceId: endpoint.interfaceId, evidenceRefs: endpoint.evidenceRefs } : endpoint);
  return { id: 'dup-' + hash(JSON.stringify([state.manifest.baseline.sha256, state.manifest.snapshot, identity])),
    kind: identity[0], endpoints, observations: [], status: 'needs-review', overlap: null,
    differences: [], rationale: null, evidenceRefs: ['collection', left.sourceRef, right.sourceRef],
    counterevidenceRefs: [], gaps: ['Semantic assessment is pending.'], facts: [],
    sources: [left.source, right.source], review: null };
}

function addDetectorLeads(collection, input, mappings, findings, state) {
  const measured = collection.status === 'completed' || collection.status === 'partial';
  const counts = { helperOnly: measured ? 0 : null, unmapped: measured ? 0 : null };
  const gaps = [];
  const excluded = new Map((input.exclusions ?? []).map(item => [item.index, item]));
  assert(excluded.size === (input.exclusions ?? []).length, 'Duplicate observation exclusion.');
  for (const [index, observation] of collection.observations.entries()) {
    const leftMatches = sourceEndpoints(observation.left, mappings);
    const rightMatches = sourceEndpoints(observation.right, mappings);
    const left = leftMatches.length === 1 ? leftMatches[0] : null;
    const right = rightMatches.length === 1 ? rightMatches[0] : null;
    const exclusion = excluded.get(index);
    if (!left || !right) {
      if (exclusion?.kind === 'helper-only') {
        assert(leftMatches.length === 0 && rightMatches.length === 0 && text(exclusion.reason) && exclusion.evidenceRefs?.length,
          'A helper exclusion needs zero public mapping matches on both sides, no ambiguity, and evidence.');
        counts.helperOnly++;
      } else {
        counts.unmapped++;
        const kind = leftMatches.length > 1 || rightMatches.length > 1 ? 'Ambiguous' : 'Unmapped';
        gaps.push(kind + ' detector pair ' + index + ': ' + observation.left.path + ' / ' + observation.right.path);
      }
      continue;
    }
    assert(!exclusion, 'A mapped public pair cannot be hidden as a helper.');
    if (endpointKey(left.endpoint) === endpointKey(right.endpoint)) {
      counts.unmapped++;
      gaps.push('Detector pair ' + index + ' stays within one public endpoint.');
      continue;
    }
    const key = JSON.stringify(findingIdentity([left.endpoint, right.endpoint]));
    if (!findings.has(key)) findings.set(key, pendingFinding(left, right, observation, state));
    findings.get(key).observations.push({ origin: observation.origin, endpoints: [left.endpoint, right.endpoint],
      score: observation.score, method: observation.method, toolVersion: observation.toolVersion, evidenceRefs: ['collection'] });
  }
  for (const index of excluded.keys()) assert(Number.isInteger(index) && index >= 0 && index < collection.observations.length, 'Unknown excluded observation.');
  return { counts, gaps };
}

function reviewCoverage(scope, state) {
  assert(Array.isArray(scope?.examined) && Array.isArray(scope.groups) &&
    Array.isArray(scope.gaps), 'Recorded bounded capability review is required.');
  for (const endpoint of scope.examined) checkEndpoint(endpoint, state.inputs.baseline);
  const examined = new Set(scope.examined.map(endpointKey));
  assert(examined.size === scope.examined.length, 'Repeated examined endpoint.');
  const grouped = new Set();
  for (const group of scope.groups) {
    assert(text(group.name) && text(group.reason) && group.interfaces.length > 0 &&
      group.interfaces.every(id => state.inputs.baseline.interfaces.some(record => record.id === id)), 'Invalid capability review group.');
    group.interfaces.forEach(id => grouped.add(id));
  }
  const inventory = JSON.parse(savedFile(state.output, 'evidence/endpoints.json'));
  const gaps = [...scope.gaps];
  for (const endpoint of inventory.endpoints) {
    if (!examined.has(endpointKey(endpoint)) || !grouped.has(endpoint.interfaceId)) {
      gaps.push('Required public capability review is missing: ' + endpoint.interfaceId + (endpoint.entryId ? '/' + endpoint.entryId : ''));
    }
  }
  return gaps;
}

export function prepareReview(state, input) {
  assert(input && typeof input === 'object', 'A recorded review packet is required.');
  checkProvenance(input.reviewer);
  const sources = checkedSources(input, state);
  const mappings = checkedMappings(input, state, sources);
  const refs = new Set([...Object.keys(state.manifest.artifacts), ...sources.keys(), 'review-input']);
  refsKnown(input, refs);
  const collection = JSON.parse(savedFile(state.output, 'evidence/collection.json'));
  const findings = reviewedFindings(input, state, sources, refs);
  const mapping = addDetectorLeads(collection, input, mappings, findings, state);
  const gaps = reviewCoverage(input.scope, state);
  const values = [...findings.values()];
  const pending = values.filter(finding => finding.status === 'needs-review').length;
  const report = { kind: 'interface-duplication-review', formatVersion: 1, id: state.manifest.id + '-report',
    runRef: state.manifest.id, createdAt: new Date().toISOString(), producer: { name: 'choom-interface-duplication', version: '1' },
    baseline: state.manifest.baseline, snapshot: state.manifest.snapshot,
    scan: { status: collection.status, profile: collection.profile, tool: collection.tool,
      counts: { ...collection.counts, ...mapping.counts }, scopeRefs: ['endpoints', ...(state.manifest.artifacts.profile ? ['profile'] : [])],
      diagnostics: collection.diagnostics, mappingGaps: mapping.gaps, evidenceRefs: ['collection'] },
    review: { status: pending || gaps.length ? 'partial' : 'completed', inspected: values.length - pending, pending,
      scopeRefs: ['review-input'], gaps }, findings: values };
  return { report, sources };
}
