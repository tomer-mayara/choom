import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { BaselineBoundaryReview, BaselineV6 } from '@choom/baseline-model/contracts';
import { stageFourPublication, publishStageFour } from '../../fixtures/stage-4-publication/fixture.ts';
import { component } from '../../fixtures/stage-5-publication/fixture.ts';
import { fixtureValue, rewriteProposal } from '../../fixtures/boundary-publication/fixture.ts';

const command = 'src/command.js';
const testFile = 'test/hours.test.js';
const routeFile = 'src/routes.js';
const files = [{ path: 'package.json', text: '{"name":"reading-room","bin":{"reading-room":"./src/command.js"}}\n' },
  { path: routeFile, text: 'import fastify from "fastify"; const api = fastify(); api.get("/hours", () => "09:00");\n' },
  { path: command, text: 'console.log("09:00");\n' }, { path: testFile,
    text: 'import { test as check } from "node:test"; check("weekday opening time", () => {}); function fake() {} fake("invented registration", () => {}); const title = "09:00"; check("bad handler", title);\n' }];
const ref = (path: string) => 's4-check-source-' + encodeURIComponent(path);
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const roles = (test: boolean) => test ? ['test' as const] : ['production' as const];
const fileEntries = [command, testFile, routeFile].map((path, index) => ({ id: index === 2 ? 'route-entry' : index ? 'weekday-test' : 'room-bin', expression: index === 1 ? 'node --test' : './' + path,
  path, workspace: '.', roles: roles(index === 1), origin: index ? 'script' : 'package-field', evidenceRefs: ['launch-settings'] }));
type Case = 'valid' | 'missing-behavior' | 'invented-bin' | 'unrelated-registration' | 'wrong-verb' | 'wrong-role' | 'wrong-handler' | 'wrong-owner' | 'noncallable' | 'wrong-member';
function registrationPacket(variation: Case) {
  const testName = variation === 'noncallable' ? 'bad handler' : 'weekday opening time';
  return stageFourPublication((model) => {
    model.formatVersion = 6;
    model.components.push(component('room', { paths: [command, routeFile] }), component('checks', { paths: [testFile] }));
  }, files, undefined, (records, prepared) => {
    const model = fixtureValue(records['baseline.proposed.yaml']) as unknown as BaselineV6;
    const entry = fixtureValue(records['entry-analysis.yaml']);
    const snapshotRef = 'snapshot-check';
    const mappingRef = 's4-check-file@code-mapping.json';
    const evidenceRefs = [ref('package.json'), ref(command)];
    model.systemEntryPoints = { snapshotRef, mappingRef, scope: 'The declared executable', limitations: [], evidenceRefs,
      entries: [{ id: 'bin-start', kind: 'startup', label: 'Command startup', path: command, componentId: 'room', evidenceRefs },
        { id: 'bin-command', kind: 'external', label: 'CLI reading-room', path: command, componentId: 'room', evidenceRefs }] };
    entry.behaviorEntries = [
      { id: 'observed-command', kind: 'command', expression: 'reading-room', source: { path: command, lines: [1, 1] },
        componentRef: 'room', fileEntryRefs: ['room-bin'], evidenceRefs },
      { id: 'observed-route', kind: 'http-route', expression: 'GET /hours', source: { path: routeFile, lines: [1, 1] },
        componentRef: 'room', fileEntryRefs: ['route-entry'], evidenceRefs: [ref(routeFile)] },
      { id: 'observed-test', kind: 'test', expression: variation === 'unrelated-registration' ? 'fake("invented registration", ...)' : 'check("' + testName + '", ...)',
        source: { path: testFile, lines: [1, 1] }, componentRef: variation === 'wrong-owner' ? 'room' : 'checks', fileEntryRefs: ['weekday-test'], evidenceRefs: [ref(testFile)] },
    ];
    if (variation === 'missing-behavior') entry.behaviorEntries = (entry.behaviorEntries as unknown[]).slice(1);
    const review: BaselineBoundaryReview = { status: 'current', identity: { projectKey: 'reading-room', snapshotRef, mappingRef,
      sourceKind: 'snapshot', baseCommit: null, analysisRoots: ['.'], inventoryDigest: hash(readFileSync(join(prepared.work, 'evidence/inventory.json'))) },
      units: [command, testFile, routeFile].map((path, index) => ({ id: index === 2 ? 'route-file' : index ? 'test-file' : 'command-file', path, unitKind: 'file',
        ownerId: index === 1 ? 'checks' : 'room', roles: roles(index === 1), evidenceRefs: [ref(path)] })),
      operations: [{ id: 'print-time', name: 'Print weekday time', member: variation === 'invented-bin' ? 'invented' : 'reading-room',
        unitId: 'command-file', roles: ['production'], visibility: 'public', systemEntryIds: ['bin-start', 'bin-command'], evidenceRefs },
        { id: 'check-time', name: 'Check weekday time', member: variation === 'unrelated-registration' ? 'invented registration' : testName,
          unitId: variation === 'wrong-handler' ? 'command-file' : 'test-file', roles: roles(variation !== 'wrong-role'),
          visibility: 'unknown', evidenceRefs: [ref(testFile)] },
        { id: 'get-hours', name: 'Get opening hours', member: variation === 'wrong-verb' ? 'POST /hours' : 'GET /hours',
          unitId: 'route-file', roles: ['production'], visibility: 'public', evidenceRefs: [ref(routeFile)] }], componentScopes: [], accesses: [], rules: [], checks: [], callerSearches: [], matches: [], limitations: [],
      sourceNotes: files.map(({ path, text }) => ({ evidenceRef: ref(path), description: 'Reviewed source.', location: { path, snapshotRef,
        sha256: hash(text), lines: [1, 1] } })) };
    model.boundaryReview = review;
  }, { key: 'reading-room', reviewPaths: files.map((file) => file.path), edges: [], fileEntries });
}

test.each<Case>(['valid', 'missing-behavior', 'invented-bin', 'unrelated-registration', 'wrong-role', 'wrong-verb', 'wrong-handler', 'wrong-owner', 'noncallable', 'wrong-member'])(
  'Stage 4 checks the registration, handler and context for %s', (variation) => {
    const fixture = registrationPacket(variation);
    try {
      if (variation === 'wrong-member') rewriteProposal(fixture.review, ({ boundaryReview }) => {
        fixtureValue(boundaryReview.operations[1]).member = 'another test';
      });
      const result = publishStageFour(fixture, variation === 'valid' ? 'finish' : 'check');
      if (variation === 'valid') { expect(result.stderr).toBe(''); expect(result.status).toBe(0); }
      else { expect(result.status).toBe(1); expect(result.stderr).toMatch(/declaration|registration|operation|role|mapped source owner/i); }
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }, 60_000);
