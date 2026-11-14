import { basename, dirname } from 'node:path';
import { stringify } from 'yaml';
import { duplicationFindingKey } from '../../../src/domain/interface-duplication.ts';
import { decodeDuplicationReportYaml } from '../../../src/lib/interface-duplication-yaml.ts';
import { assert, canonicalDirectory, completedInputs, hash, now, prepareOutput, readAssessment, register,
  savedFile, saveManifest, toolIdentity } from './duplication-files.mjs';
import { collectDetector, uncompletedCollection } from './duplication-detector.mjs';
import { prepareReview, verifyReportEvidence } from './duplication-review.mjs';

export function skipAssessment({ output, reason }) {
  assert(typeof reason === 'string' && reason.trim() && reason.length <= 16_384, 'A bounded reason is required to skip detection.');
  const state = readAssessment(output);
  assert(state.manifest.status === 'started', 'Skip only a new assessment collection.');
  const collection = uncompletedCollection('skipped', reason);
  register(state.output, state.manifest, 'evidence/profile.json', { profile: collection.profile, skipped: true, reason }, 'profile');
  return saveCollection(state, collection);
}

export function publishAssessment({ output }) {
  const state = readAssessment(output);
  assert(state.manifest.status === 'reviewed', 'Publish a reviewed assessment once.');
  const report = JSON.parse(savedFile(state.output, 'evidence/report-draft.json'));
  verifyReportEvidence(report, state.manifest);
  for (const finding of report.findings) finding.id = 'dup-' + hash(duplicationFindingKey(report.baseline, report.snapshot, finding));
  const bytes = stringify(report);
  const decoded = decodeDuplicationReportYaml(bytes, state.inputs.baseline, state.manifest.baseline.sha256);
  assert(decoded.status === 'success', decoded.message ?? 'Invalid portable report.');
  register(state.output, state.manifest, 'interface-duplication-review.yaml', bytes, 'report');
  state.manifest.status = 'published';
  state.manifest.outcome = report.scan.status === 'completed' && report.review.status === 'completed' &&
    report.scan.counts.unmapped === 0 ? 'completed' : 'partial';
  state.manifest.publishedAt = now();
  state.manifest.reportRef = 'report';
  saveManifest(state.output, state.manifest);
  return { status: 'published', outcome: state.manifest.outcome, report: 'interface-duplication-review.yaml', output: state.output };
}

export function reviewAssessment({ output, review }) {
  const state = readAssessment(output);
  assert(state.manifest.status === 'collected', 'Review a collected assessment once; use a new assessment for a correction.');
  const prepared = prepareReview(state, review);
  register(state.output, state.manifest, 'evidence/review-input.json', review, 'review-input');
  let index = 0;
  for (const [ref, source] of prepared.sources) register(state.output, state.manifest,
    'evidence/source-' + (++index) + '.json', source, ref);
  register(state.output, state.manifest, 'evidence/report-draft.json', prepared.report, 'report-draft');
  state.manifest.status = 'reviewed';
  saveManifest(state.output, state.manifest);
  return { status: 'reviewed', findings: prepared.report.findings.length, output: state.output };
}

export function collectAssessment({ output }) {
  const state = readAssessment(output);
  assert(state.manifest.status === 'started', 'Collect once; use a new assessment for a changed profile or retry.');
  let collection;
  try { collection = collectDetector(state); }
  catch (error) { collection = uncompletedCollection('failed', 'Detector setup failed: ' + error.message); }
  return saveCollection(state, collection);
}

function saveCollection(state, collection) {
  register(state.output, state.manifest, 'evidence/collection.json', collection, 'collection');
  state.manifest.status = 'collected';
  state.manifest.scanStatus = collection.status;
  saveManifest(state.output, state.manifest);
  return { status: collection.status, observations: collection.observations.length, output: state.output };
}

export function publicInventory(baseline, files) {
  const endpoints = baseline.interfaces.flatMap(record => {
    const base = { interfaceId: record.id, ownerId: record.owner.value, publicAccess: record.publicAccess.value };
    return [{ ...base, entryId: null }, ...(record.documentation?.entries ?? []).map(entry =>
      ({ ...base, entryId: entry.id, publicAccess: [entry.accessPoint], kind: entry.kind.value }))];
  });
  const unsupported = files.filter(file => !/\.(?:[cm]?[jt]sx?)$/i.test(file.path)).length;
  return { endpoints, coverage: { files: files.length, unsupported, eligibleFunctions: null,
    gaps: ['Bodyless declarations and small functions are outside AST similarity coverage.',
      'Public capability review is required even when the detector finds no match.',
      'Source mappings and references require evidence; names alone do not establish identity.'] } };
}

export function startAssessment({ work, output: requested, id }) {
  assert(typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 'Use a plain assessment ID.');
  const inputs = completedInputs(work);
  const output = prepareOutput(requested, inputs.work);
  const manifest = { formatVersion: 1, kind: 'duplication-assessment', id, createdAt: now(), status: 'started', tools: toolIdentity(),
    source: { work: inputs.work, runRef: inputs.run.id, runSha256: inputs.runSha256 },
    baseline: { id: inputs.baseline.id, formatVersion: inputs.baseline.formatVersion, sha256: hash(inputs.baselineBytes) },
    snapshot: { id: inputs.inventory.snapshotId, inventorySha256: inputs.inventorySha256 }, artifacts: {} };
  register(output, manifest, 'baseline.yaml', inputs.baselineBytes, 'baseline');
  register(output, manifest, 'evidence/inventory.json', inputs.inventoryBytes, 'inventory');
  register(output, manifest, 'evidence/endpoints.json', publicInventory(inputs.baseline, inputs.inventory.files), 'endpoints');
  saveManifest(output, manifest);
  return { status: 'started', output, id };
}

function main(args) {
  const [action, first, second, third, ...extra] = args;
  assert(extra.length === 0, 'Unexpected extra arguments.');
  if (action === 'start' && first && second && third) return startAssessment({ work: first, output: second, id: third });
  if (action === 'collect' && first && !second) return collectAssessment({ output: first });
  if (action === 'skip' && first && second && !third) return skipAssessment({ output: first, reason: second });
  if (action === 'review' && first && second && !third) {
    const input = JSON.parse(savedFile(canonicalDirectory(dirname(second)), basename(second)));
    return reviewAssessment({ output: first, review: input });
  }
  if (action === 'publish' && first && !second) return publishAssessment({ output: first });
  throw new Error('Use start RUN OUTPUT ID, collect OUTPUT, skip OUTPUT REASON, review OUTPUT INPUT_JSON, or publish OUTPUT.');
}

if (import.meta.main) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
