import { isDeepStrictEqual as same } from 'node:util';
import type * as TsMorph from 'ts-morph';
import { divideFile, dividedFileBytes, pathOwners, type PathSelectors, restOwner, type SavedFile } from './code-units.ts';
import { assert, exact, type Fields, oneOf, strings, text } from './record-checks.ts';
import { parseSnapshotText, type ProjectTools } from './snapshot-project.ts';

// Part of the shared validation: the selected code mapping. Its scope names the
// inventory and the selected entry analysis chain. A code unit is a file or a
// recorded part of a file:
// - With unitKind: file in the scope, each indexed file is one unit.
// - With unitKind: file-or-part, each unit names its unitKind: file, symbol or rest.
//   The symbol selectors of a version 5 baseline divide a file. Its units must be the
//   units that divideFile gives on the saved snapshot: a symbol unit for each selector,
//   owned by the component of the selector, and a rest unit for all other text, owned
//   by the path owner of the file, or by nobody with the reason no-path-owner. Each
//   other indexed file is one file unit.
// A file unit has the owner that the path selectors give, or no owner with a reason.
// The inspection of a unit follows the reviewed ranges of its file in the chain.
export interface MappingInputs {
  mapping: Fields;
  discovery: Fields;
  inventoryRef: string;
  indexed: Map<unknown, Fields>;
  // The membership statement of each component, by component ID.
  members: Map<unknown, Fields>;
  historyRefs: unknown[];
  reviewedRanges: Fields[];
  claim(id: unknown): void;
  resolve(ref: unknown): unknown;
  evidence(record: unknown): void;
  readSource(path: string, limit: number): Buffer;
  // The ts-morph that divides a file that a symbol selector names, after the
  // checks of the caller, such as the pins of its stage start. The check loads
  // it once, only when a selector divides a file.
  divisionTools(): ProjectTools;
}
// The direct owners of the mapped files, for the checks of the source sites. The
// sites of a divided file stay at file level: a component owns code of the file when
// it owns one of its units.
export interface MappedOwners {
  // The number of mapped files.
  readonly files: number;
  // Whether the component, or null for an unknown owner, directly owns code of the file.
  owns(path: unknown, owner: unknown): boolean;
}
// The checks of each unit, with the units that passed them by file.
interface Context {
  inputs: MappingInputs;
  // The symbols that the selectors of the baseline name in each file, with their owners.
  divided: Map<unknown, Map<string, unknown>>;
  selectors: Map<unknown, PathSelectors>;
  reviewedPaths: Set<unknown>;
  units: Map<unknown, Fields[]>;
}
interface SymbolSelector { path: string; symbol: string }

const partFields: Record<string, string[]> = {
  symbol: ['id', 'unitKind', 'path', 'sha256', 'symbol', 'ranges', 'roles', 'owner', 'membershipRef', 'inspection', 'reason',
    'evidenceRefs'],
  rest: ['id', 'unitKind', 'path', 'sha256', 'ranges', 'roles', 'owner', 'membershipRef', 'inspection', 'reason', 'evidenceRefs'],
};

function selectedSymbols(members: Map<unknown, Fields>): Map<unknown, Map<string, unknown>> {
  const files = new Map<unknown, Map<string, unknown>>();
  for (const [owner, membership] of members) {
    for (const { path, symbol } of ((membership.value as Fields).symbols as SymbolSelector[] | undefined) ?? []) {
      const symbols = files.get(path) ?? new Map<string, unknown>();
      files.set(path, symbols.set(symbol, owner));
    }
  }
  return files;
}

// Whether the units of the mapping can be parts of files.
function checkScope({ mapping, discovery, indexed, inventoryRef, historyRefs }: MappingInputs): boolean {
  const scope = mapping.scope as Fields | undefined;
  const parts = scope?.unitKind === 'file-or-part';
  assert(mapping.kind === 'code-mapping' && scope?.inventoryRef === inventoryRef &&
    scope.basis === 'all-inventoried-regular-files' && (scope.unitKind === 'file' || parts) &&
    text(scope.inspectionMeaning) && scope.selectedEntryAnalysisRef === discovery.entryAnalysisRef &&
    same(scope.historicalEntryAnalysisRefs, historyRefs) && strings(mapping.limits) &&
    Array.isArray(mapping.units) && (parts || mapping.units.length === indexed.size), 'Invalid selected code mapping scope.');
  return parts;
}

function checkUnitFields({ inputs, reviewedPaths }: Context, unit: Fields, unique: boolean): void {
  const { indexed } = inputs;
  assert(unique && indexed.has(unit.path) && indexed.get(unit.path)?.sha256 === unit.sha256 && strings(unit.roles) &&
    text(unit.reason) && unit.inspection === (reviewedPaths.has(unit.path) ? 'reviewed' : 'unreviewed'),
  'Invalid mapped unit or inspection coverage: ' + unit.path);
}

// The membership reference of a unit names the membership statement of its owner, and its evidence resolves.
function checkMembership({ inputs }: Context, unit: Fields): void {
  if (unit.owner === null) assert(unit.membershipRef === null, 'Unknown unit selects a membership: ' + unit.path);
  else {
    const selectedMembership = inputs.resolve(unit.membershipRef);
    const membership = inputs.members.get(unit.owner) as Fields;
    assert(same(selectedMembership, membership) || same(selectedMembership, membership.value),
      'Mapped membership reference differs from proposed intent: ' + unit.path);
  }
  inputs.evidence(unit);
}

function checkFileUnit(context: Context, unit: Fields): void {
  const path = unit.path as string;
  const symbols = context.divided.get(path);
  assert(symbols === undefined, `${path} is a file unit, but the symbol selectors of the baseline divide it: ` +
    [...symbols ?? []].map(([symbol, owner]) => `${symbol} (${String(owner)})`).join(', ') + '. Map a divided file as its ' +
    'symbol units and its rest unit, in a code mapping with unitKind: file-or-part.');
  checkUnitFields(context, unit, !context.units.has(path));
  assert(same(pathOwners(path, context.selectors), unit.owner === null ? [] : [unit.owner]),
    'Mapping and direct membership differ: ' + path);
  checkMembership(context, unit);
}

// A symbol or rest unit of a divided file. The checks of the whole division compare its ranges and its owner.
function checkPartUnit(context: Context, unit: Fields, kind: string): void {
  const path = unit.path as string;
  const fields = partFields[kind] as string[];
  assert(context.divided.has(path), `${path} has symbol or rest units, but no symbol selector of the baseline divides it.`);
  assert(exact(unit, fields), `The ${kind} unit ${String(unit.id)} of ${path} must have exactly these fields: ${fields.join(', ')}.`);
  checkUnitFields(context, unit, true);
  assert(unit.owner === null || context.inputs.members.has(unit.owner), 'Mapping and direct membership differ: ' + path);
  checkMembership(context, unit);
}

// The syntax tree of a saved file that symbol selectors divide, from bytes that the checks read and check.
function savedSource(inputs: MappingInputs, path: string, file: Fields, tools: ProjectTools): TsMorph.ts.SourceFile {
  const saved: SavedFile = { bytes: file.bytes as number, sha256: file.sha256 as string };
  return parseSnapshotText(path, dividedFileBytes(path, saved, inputs.readSource), tools);
}

// The fields of a part unit that the division gives: its kind, symbol, owner and
// ranges, and the reason of a rest with no owner.
function divisionFields(unit: Fields): Fields {
  const { unitKind, symbol, owner, reason, ranges } = unit;
  return unitKind === 'symbol' ? { unitKind, symbol, owner, ranges } : { unitKind, owner, ...owner === null ? { reason } : {}, ranges };
}

const unitKey = (unit: Fields): string => String(unit.unitKind) + ' ' + String(unit.symbol ?? '');
const inKeyOrder = (units: Fields[]): Fields[] =>
  [...units].sort((first, second) => (unitKey(first) < unitKey(second) ? -1 : Number(unitKey(first) > unitKey(second))));

// The units of a divided file are the units that its symbol selectors give in the saved snapshot.
function checkDivision({ inputs, selectors, units }: Context, path: unknown, symbols: Map<string, unknown>, tools: ProjectTools): void {
  const file = inputs.indexed.get(path);
  assert(file !== undefined, `The symbol selector ${String([...symbols.keys()][0])} of ${String(path)} matched nothing: ` +
    'the file is not in the saved inventory.');
  const division = divideFile(tools.ts, savedSource(inputs, path as string, file, tools), [...symbols.keys()]);
  const rest = restOwner(path as string, selectors);
  const expected: Fields[] = division.symbols.map(({ symbol, ranges }) =>
    ({ unitKind: 'symbol', symbol, owner: symbols.get(symbol), ranges }));
  if (division.rest.length > 0) expected.push({ unitKind: 'rest', ...rest, ranges: division.rest });
  assert(same(inKeyOrder((units.get(path) ?? []).map(divisionFields)), inKeyOrder(expected)), `The code units of ${String(path)} ` +
    `differ from the units that its symbol selectors give in the saved snapshot. The units must be: ${JSON.stringify(expected)}`);
}

export function validateCodeMapping(inputs: MappingInputs): MappedOwners {
  const parts = checkScope(inputs);
  const context: Context = { inputs, divided: selectedSymbols(inputs.members), units: new Map(),
    selectors: new Map([...inputs.members].map(([id, membership]) => [id, membership.value as PathSelectors])),
    reviewedPaths: new Set(inputs.reviewedRanges.map(item => item.path)) };
  for (const unit of inputs.mapping.units as Fields[]) {
    inputs.claim(unit.id);
    const kind = parts ? unit.unitKind : 'file';
    assert(oneOf(['file', 'symbol', 'rest'], kind),
      `The unit ${String(unit.id)} of ${String(unit.path)} needs unitKind file, symbol or rest.`);
    if (kind === 'file') checkFileUnit(context, unit);
    else checkPartUnit(context, unit, kind as string);
    context.units.set(unit.path, [...context.units.get(unit.path) ?? [], unit]);
  }
  if (parts) for (const path of inputs.indexed.keys())
    assert(context.units.has(path), `The code mapping has no unit of the indexed file ${String(path)}.`);
  if (context.divided.size > 0) {
    const tools = inputs.divisionTools();
    for (const [path, symbols] of context.divided) checkDivision(context, path, symbols, tools);
  }
  const owners = new Map([...context.units].map(([path, units]) => [path, new Set(units.map(unit => unit.owner))]));
  return { files: owners.size, owns: (path, owner) => owners.get(path)?.has(owner) ?? false };
}
