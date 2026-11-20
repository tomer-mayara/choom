import { expect, test } from 'bun:test';
import type { BoundaryUnit } from '@choom/baseline-model/contracts';
import * as tools from 'ts-morph';
import { BoundarySourceBindings, type BoundaryGraphEdge } from '../../src/boundary-source-bindings.ts';

const from = 'source.ts';
const to = 'port.ts';
const unit = (id: string, path: string): BoundaryUnit =>
  ({ id, path, unitKind: 'file', ownerId: id, roles: ['production'], evidenceRefs: [id] });
const caller = unit('source', from);
const target = unit('port', to);

function bindings(source: string) {
  const edge: BoundaryGraphEdge = { from, to, specifier: './port', targetKind: 'internal',
    dynamic: false, preCompilationOnly: false, dependencyTypes: ['local'] };
  return new BoundarySourceBindings(tools, { id: 'import', scanFiles: [from, to], edges: [edge], conditionNames: [], moduleSystems: [] },
    [from, to], new Map(), (path) => Buffer.from(path === from ? source : 'export interface Stored {}\nexport function commit() {}'));
}

test('a mixed declaration distinguishes the imported value, type import and type reference', () => {
  const checked = bindings("import { commit, type Stored as Data } from './port';\nconst record: Data = {};\ncommit();");
  const kinds = ['type', 'import', 'call'] as const;
  const stored = checked.observations({ caller, target, member: 'Stored', kinds: [...kinds] }, true);
  expect(stored.map((site) => [site.kind, site.position.line]).sort()).toEqual([['type', 1], ['type', 2]]);
  const commit = checked.observations({ caller, target, member: 'commit', kinds: [...kinds] }, true);
  expect(commit.map((site) => [site.kind, site.position.line]).sort()).toEqual([['call', 3], ['import', 1]]);
});

test('re-exports, dynamic imports and requires remain distinct when the same file is reached', () => {
  const checked = bindings("export { commit as save } from './port';\nimport('./port');\nrequire('./port');");
  const loads = checked.observations({ caller, target, kinds: ['re-export', 'dynamic-import', 'require'] }, true);
  expect(loads.map((site) => [site.kind, site.position.line])).toEqual([['re-export', 1], ['dynamic-import', 2], ['require', 3]]);
});

test('an unresolved indirect callback prevents a complete negative call result', () => {
  const checked = bindings("import { commit } from './port';\nconst later = commit;\nlater();");
  const calls = checked.observations({ caller, target, member: 'commit', kinds: ['call'] }, true);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.uncertain).toBe(true);
});
