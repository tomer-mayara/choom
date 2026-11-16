import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const statement = value => ({ value, status: 'proposed', evidenceRefs: ['fixture-source'] });

export function fixtureRun(sourceChanges = {}, kindChanges = {}) {
  const root = mkdtempSync(join(tmpdir(), 'choom-duplication-'));
  const work = join(root, 'baseline-run');
  const output = join(root, 'assessment');
  mkdirSync(join(work, 'snapshot'), { recursive: true });
  mkdirSync(join(work, 'evidence'));
  mkdirSync(join(work, 'baselines', 'fixture-baseline'), { recursive: true });
  const sources = {
    'lookup.ts': 'export function findInvoice(id: string) {\n  const invoices = [{ id: "one", amount: 10 }];\n  return invoices.find(invoice => invoice.id === id);\n}\nexport const lookupInvoice = findInvoice;\nexport const getInvoice = (id: string) => findInvoice(id);\nexport const listInvoices = () => [{ id: "one", amount: 10 }];\n',
    'alternative.ts': 'export function lookup(id: string) {\n  const invoices = new Map([["one", { id: "one", amount: 10 }]]);\n  return invoices.get(id);\n}\n',
    'observer.ts': 'const listeners = new Set<() => void>();\nexport function subscribe(listener: () => void) {\n  listeners.add(listener);\n  return () => listeners.delete(listener);\n}\nexport function publishLoad() {\n  for (const listener of [...listeners]) { try { listener(); } catch {} }\n}\n',
    'geometry.ts': 'const listeners = new Set<() => void>();\nexport function subscribe(listener: () => void) {\n  listeners.add(listener);\n  return () => listeners.delete(listener);\n}\nexport function publishPosition() {\n  for (const listener of listeners) listener();\n}\n',
    'safe-name.ts': 'export function safeName(value: string) {\n  const forbidden = /[\\\\\\u0000\\r\\n]/;\n  const present = value.length > 0;\n  return present && !forbidden.test(value);\n}\n',
    'safe-path.ts': 'export function safePath(value: string) {\n  const forbidden = /[\\\\\\u0000-\\u001f\\u007f]/;\n  const present = value.length > 0;\n  return present && !forbidden.test(value);\n}\n',
    'private.ts': 'function label(value: string) {\n  const prefix = "Name: ";\n  const result = prefix + value;\n  return result.trim();\n}\nfunction title(value: string) {\n  const prefix = "Name: ";\n  const result = prefix + value;\n  return result.trim();\n}\n',
    'types.ts': 'export interface Invoice { id: string; amount: number }\nexport const fieldNames = ["id", "amount"];\n',
    'unsupported.rs': 'pub fn invoice() {}\n',
    '.jscpd.cjs': 'throw new Error("Target configuration must not execute");\n',
    ...sourceChanges,
  };
  for (const [path, source] of Object.entries(sources)) writeFileSync(join(work, 'snapshot', path), source);
  const interfaces = [
    ['find', 'lookup.ts#findInvoice', 'function'], ['alias', 'lookup.ts#lookupInvoice', 'function'],
    ['wrapper', 'lookup.ts#getInvoice', 'function'], ['alternative', 'alternative.ts#lookup', 'function'],
    ['observer', 'observer.ts#subscribe', 'function'], ['geometry', 'geometry.ts#subscribe', 'function'],
    ['safe-name', 'safe-name.ts#safeName', 'function'], ['safe-path', 'safe-path.ts#safePath', 'function'],
    ['invoice-type', 'types.ts#Invoice', 'type'], ['fields', 'types.ts#fieldNames', 'data'],
  ].map(([id, accessPoint, kind]) => ({
    id, name: id, owner: statement(id === 'observer' ? 'load-state' : id === 'geometry' ? 'geometry-state' : 'billing'), publicAccess: statement([accessPoint]),
    allowedConsumers: statement(null), promises: statement(null), documentation: {
      summary: statement(null), sourceNotes: [], entries: [{ id: 'entry', name: id, accessPoint,
        kind: statement(kindChanges[id] ?? kind), description: statement(null), examples: [] }],
    },
  }));
  const lookup = interfaces.find(record => record.id === 'find');
  lookup.publicAccess.value.unshift('lookup.ts#listInvoices');
  lookup.documentation.entries.unshift({ id: 'list', name: 'List invoices', accessPoint: 'lookup.ts#listInvoices',
    kind: statement('function'), description: statement('Return all fixture invoices.'), examples: [] });
  const baseline = { formatVersion: 2, id: 'fixture-baseline', parentId: null,
    components: [{ id: 'billing', name: 'Billing', purpose: statement('Invoice capabilities'),
      membership: statement({ paths: Object.keys(sources).filter(path => !['observer.ts', 'geometry.ts'].includes(path)) }), groupingReason: statement('Fixture') },
      { id: 'load-state', name: 'Load state', purpose: statement('Notify load state observers; isolate observer exceptions'),
        membership: statement({ paths: ['observer.ts'] }), groupingReason: statement('Independent load state owner') },
      { id: 'geometry-state', name: 'Geometry state', purpose: statement('Notify position observers; propagate failures'),
        membership: statement({ paths: ['geometry.ts'] }), groupingReason: statement('Independent position state owner') }],
    interfaces, resources: [], rules: [],
  };
  const inventory = { formatVersion: 1, snapshotId: 'fixture-snapshot', files: Object.entries(sources)
    .map(([path, source]) => ({ path, kind: 'file', bytes: Buffer.byteLength(source), sha256: digest(source) })) };
  const baselineBytes = Buffer.from(stringify(baseline));
  const inventoryBytes = Buffer.from(JSON.stringify(inventory));
  writeFileSync(join(work, 'baselines/fixture-baseline/baseline.yaml'), baselineBytes);
  writeFileSync(join(work, 'evidence/inventory.json'), inventoryBytes);
  const run = { formatVersion: 1, id: 'fixture-run', status: 'completed',
    progress: { baselineRecovery: 'complete' }, baselineRef: 'baseline-final',
    snapshot: { id: inventory.snapshotId, root: 'snapshot', inventoryRef: 'inventory' },
    artifacts: { 'baseline-final': { path: 'baselines/fixture-baseline/baseline.yaml', sha256: digest(baselineBytes) },
      inventory: { path: 'evidence/inventory.json', sha256: digest(inventoryBytes) } },
  };
  writeFileSync(join(work, 'run.yaml'), stringify(run));
  return { root, work, output, run, baseline, inventory, sources,
    original: digest(readFileSync(join(work, 'run.yaml'))) };
}
