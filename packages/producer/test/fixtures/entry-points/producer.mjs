import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { producerReceipt } from '../../../src/producer-code.ts';

const digest = value => createHash('sha256').update(value).digest('hex');
const snapshotRef = 'fixture-snapshot';
const runRef = 'fixture-run';
const baselineId = 'fixture-baseline';
const stage = 's5-fixture';
const proposal = stage + '-file@baseline.proposed.yaml';
const inventoryRef = 'inventory';
const selectedRefs = {
  entryAnalysisRef: stage + '-entry-analysis',
  codeMappingRef: stage + '-file@code-mapping.json',
  dependenciesRef: 'source-graph',
  resourceAccessRef: stage + '-file@resource-access.json',
};
const registrationRef = 'launch-settings';
const evidenceRefs = [registrationRef];
const limits = ['Only saved fixture launch paths and registrations were reviewed.'];
// The run records the producer code of this checkout, as Stage 1 start does.
const toolsRoot = realpathSync(fileURLToPath(new URL('../../../../../', import.meta.url)));

function statement(value) {
  return { value, status: 'proposed', evidenceRefs };
}

function write(root, path, value) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
}

export function producerFixture(change = () => {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'choom-entry-publication-'));
  const work = join(root, 'run');
  const review = join(root, 'review');
  const artifacts = {};
  function register(ref, path, value) {
    const bytes = typeof value === 'string' ? value : JSON.stringify(value);
    write(work, path, bytes);
    artifacts[ref] = { path, sha256: digest(bytes) };
  }
  const sourceFiles = [
    ['cli.ts', 'export function start() {}\n', 'cli'],
    ['http.ts', 'export function orders() {}\n', 'http'],
    ['mcp.ts', 'export function search() {}\n', 'mcp'],
  ];
  const inventory = { formatVersion: 1, snapshotId: snapshotRef, files: [] };
  for (const [path, source] of sourceFiles) {
    write(work, 'snapshot/' + path, source);
    inventory.files.push({ path, kind: 'file', bytes: Buffer.byteLength(source), sha256: digest(source) });
  }
  register(inventoryRef, 'evidence/inventory.json', inventory);
  register('s1-file@evidence%2Fproducer.json', 'evidence/producer.json', producerReceipt(toolsRoot));
  register(registrationRef, 'evidence/launch-settings.json', {
    cli: 'choom serve', http: ['GET /orders', 'POST /orders'], mcp: 'search', unresolved: 'plugin command',
  });
  const { path, sha256 } = inventory.files[1];
  const location = { snapshotRef, path, sha256, lines: [1, 1] };
  const sourceRef = 'orders-handler';
  const reviewedFile = { id: sourceRef, ...location };
  register('excerpts', 'evidence/s5-fixture/source-excerpts.json', {
    excerpts: [{ ...reviewedFile, text: sourceFiles[1][1].trimEnd() }],
  });

  const gap = { id: 'unknown-plugin', kind: 'entry', reason: 'The plugin start path is unknown.',
    subjectRefs: ['plugin-candidate'], evidenceRefs: [registrationRef + '#/unresolved'] };
  const gaps = [gap];
  const questions = [];
  const discovery = { formatVersion: 1, kind: 'architecture-discovery', runRef, ...selectedRefs,
    overview: { text: 'Saved CLI, HTTP and MCP review.', evidenceRefs }, inspectedPaths: [], questions, gaps };
  const operation = { id: 'list-orders', name: 'List orders', accessPoint: 'GET /orders',
    kind: statement('command'), description: statement('Return the saved orders.'), examples: [] };
  const baseline = {
    formatVersion: 4, id: baselineId, parentId: null,
    components: sourceFiles.map(([file, , id]) => ({
      id, name: id, purpose: statement('Provide ' + id), membership: statement({ paths: [file] }),
      groupingReason: statement('One reviewed boundary.'),
    })),
    interfaces: [{
      id: 'order-api', name: 'Order API', owner: statement('cli'), publicAccess: statement(['GET /orders']),
      allowedConsumers: statement(['http']), promises: statement({ behavior: 'List orders', data: 'Orders',
        errors: 'Request errors', lifecycle: 'Active while serving' }),
      documentation: { summary: statement('Order operations.'), entries: [operation], sourceNotes: [] },
    }],
    resources: [], rules: [],
    systemEntryPoints: {
      snapshotRef, mappingRef: selectedRefs.codeMappingRef, scope: 'CLI and saved HTTP and MCP registrations.',
      evidenceRefs, limitations: limits, entries: [
        { id: 'serve', kind: 'startup', label: 'CLI choom serve', path: 'cli.ts', componentId: 'cli',
          evidenceRefs: [registrationRef + '#/cli'] },
        { id: 'get-orders', kind: 'external', label: 'HTTP GET /orders', path: 'http.ts', componentId: 'http',
          evidenceRefs: [registrationRef + '#/http/0', sourceRef, selectedRefs.entryAnalysisRef + '#/behaviorEntries/0'],
          source: { evidenceRef: sourceRef, location },
          interfaceId: 'order-api', entryId: 'list-orders' },
        { id: 'post-orders', kind: 'external', label: 'HTTP POST /orders', path: 'http.ts', componentId: 'http',
          evidenceRefs: [registrationRef + '#/http/1'] },
        { id: 'search', kind: 'external', label: 'MCP tool search', path: 'mcp.ts', componentId: 'mcp',
          evidenceRefs: [registrationRef + '#/mcp'] },
      ],
    },
  };

  register('knip-plan', 'evidence/knip-plan.json', { snapshotRef, workspaces: [{ dir: '.' }] });
  register('knip-profile', 'evidence/knip-profile.json', {});
  register('knip-preflight', 'evidence/knip-preflight.json', { snapshotRef });
  register('knip-runs', 'evidence/knip-runs.json', {
    snapshotRef, profileRef: 'knip-profile', preflightRef: 'knip-preflight', runs: [],
    inputDigests: { planSha256: artifacts['knip-plan'].sha256, profileSha256: artifacts['knip-profile'].sha256,
      preflightSha256: artifacts['knip-preflight'].sha256, inventorySha256: artifacts[inventoryRef].sha256 },
  });

  const graphInput = { id: 'default', roots: [{ path: 'cli.ts', evidenceRefs }], compilerSettingsRef: null,
    conditionNames: [], moduleSystems: [] };
  register('graph-profile', 'evidence/graph-profile.json', {
    formatVersion: 1, snapshotRef, contexts: [{ ...graphInput, sourceFiles: ['cli.ts'] }],
  });
  register(selectedRefs.dependenciesRef, 'evidence/graph-results.json', {
    formatVersion: 1, snapshotRef, status: 'completed', coverage: 'partial', limits, profileRef: 'graph-profile',
    contexts: [{ ...graphInput, status: 'completed', coverage: 'partial', limits, scanFiles: ['cli.ts'], edges: [],
      reachability: { status: 'completed-with-limits', method: 'breadth-first traversal of retained internal source edges',
        edgePolicy: 'includes type-only, re-export, and literal-dynamic source dependencies; not runtime execution',
        roots: ['cli.ts'], reached: ['cli.ts'], notReached: [], stoppedEdges: [] } }],
  });
  register(selectedRefs.entryAnalysisRef, 'evidence/s5-fixture/entry-analysis.yaml', stringify({
    formatVersion: 1, kind: 'entry-analysis', snapshotRef, planRef: 'knip-plan', knipRunsRef: 'knip-runs',
    llmReview: 'recorded', reviewedFiles: [reviewedFile], gaps, questions,
    knipAssessment: { action: 'reuse', reason: 'Reuse saved inputs.', evidenceRefs },
    candidates: [
      { id: 'cli-candidate', expression: 'choom serve', path: 'cli.ts', workspace: '.', roles: ['application'],
        origin: 'script', evidenceRefs },
      { id: 'plugin-candidate', expression: 'plugin command', path: null, workspace: '.', roles: ['application'],
        origin: 'unknown', evidenceRefs },
    ],
    inspectionPriorities: [],
    behaviorEntries: [{ id: 'http-registration', kind: 'route', expression: 'GET /orders', componentRef: 'http',
      source: { path, lines: [1, 1] }, fileEntryRefs: ['cli-candidate'],
      evidenceRefs: [sourceRef, registrationRef + '#/http/0'] }],
    reachability: { status: 'assessed-with-limits', method: 'context-specific-source-graph-traversal',
      dependenciesRef: selectedRefs.dependenciesRef, reason: 'Only one saved graph root.',
      contexts: [{ id: 'default', resultRef: selectedRefs.dependenciesRef + '#/contexts/0/reachability' }] },
  }));
  const scope = { historicalEntryAnalysisRefs: [] };
  register(selectedRefs.codeMappingRef, 'evidence/s5-fixture/code-mapping.json', {
    formatVersion: 1, kind: 'code-mapping', snapshotRef, limits,
    scope: { ...scope, inventoryRef, basis: 'all-inventoried-regular-files', unitKind: 'file',
      inspectionMeaning: 'Saved source ranges.', selectedEntryAnalysisRef: selectedRefs.entryAnalysisRef },
    units: inventory.files.map(({ path: file, sha256: hash }, index) => ({
      id: 'file-' + sourceFiles[index][2], path: file, sha256: hash, roles: ['source'], reason: 'Fixture membership.',
      inspection: file === path ? 'reviewed' : 'unreviewed', owner: sourceFiles[index][2],
      membershipRef: proposal + '#/components/' + index + '/membership', evidenceRefs,
    })),
  });
  register(selectedRefs.resourceAccessRef, 'evidence/s5-fixture/resource-access.json', {
    formatVersion: 1, kind: 'resource-observations', snapshotRef,
    scope: { ...scope, method: 'source-inspection', reviewedFilesRef: selectedRefs.entryAnalysisRef + '#/reviewedFiles' },
    observations: [], limits,
  });

  change(baseline);
  const baselineYaml = stringify(baseline, { aliasDuplicateObjects: false });
  const discoveryYaml = stringify(discovery, { aliasDuplicateObjects: false });
  register(proposal, 'evidence/s5-fixture/baseline.proposed.yaml', baselineYaml);
  register(stage + '-file@discovery.proposed.yaml', 'evidence/s5-fixture/discovery.proposed.yaml', discoveryYaml);
  const runYaml = stringify({
    formatVersion: 1, id: runRef, mode: 'A', status: 'in-progress', snapshot: { id: snapshotRef, root: 'snapshot', inventoryRef },
    progress: { inventory: 'complete', entryAnalysis: 'complete', inspectionPriorities: 'complete',
      componentRecovery: 'complete', remainingCode: 'complete', baselineRecovery: 'pending' },
    artifacts,
  });
  const drafts = { 'run.yaml': runYaml, 'baseline.yaml': baselineYaml, 'discovery.yaml': discoveryYaml };
  for (const [name, bytes] of Object.entries(drafts)) write(work, name, bytes);
  const identity = { formatVersion: 1, runRef, snapshotRef, baselineId };
  const readiness = stringify({
    ...identity, status: 'ready-with-gaps', selectedRefs, limits,
    draftDigests: Object.fromEntries(Object.entries(drafts).map(([name, bytes]) => [name, digest(bytes)])),
    checks: [{ id: 'review-complete', text: 'Checked saved launch settings and handler evidence.', evidenceRefs }],
  });
  write(review, 'readiness.yaml', readiness);
  write(review, 'review-scope.json', JSON.stringify({ ...identity, suppliedArtifactRefs: evidenceRefs, limits }));
  write(review, 'llm/analysis-call.yaml', stringify({ provider: 'fixture', model: 'fixture', date: '2026-01-01', settings: 'unknown',
    hiddenReasoning: 'not-saved' }));
  write(review, 'llm/analysis-prompt.md', 'Review the saved launch and registration evidence.\n');
  write(review, 'llm/analysis-response.md', readiness);
  return { root, work, review, baseline };
}
