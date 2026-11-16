import { isDeepStrictEqual as same } from 'node:util';
import { pathOwners, type PathSelectors } from './code-units.ts';
import { assert, type Fields, strings, text } from './record-checks.ts';

// Part of the shared validation: the selected code mapping. Its scope names the
// inventory and the selected entry analysis chain, and it has one unit for each
// indexed file. A unit has the direct owner that the membership path selectors give,
// or no owner with a reason, and its inspection follows the reviewed ranges of the chain.
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
}
// The direct owners of the mapped files, for the checks of the source sites.
export interface MappedOwners {
  // The number of mapped files.
  readonly files: number;
  // Whether the component, or null for an unknown owner, directly owns code of the file.
  owns(path: unknown, owner: unknown): boolean;
}

export function validateCodeMapping(inputs: MappingInputs): MappedOwners {
  const { mapping, discovery, indexed, members, claim, resolve, evidence } = inputs;
  const scope = mapping.scope as Fields | undefined;
  assert(mapping.kind === 'code-mapping' && scope?.inventoryRef === inputs.inventoryRef &&
    scope.basis === 'all-inventoried-regular-files' && scope.unitKind === 'file' &&
    text(scope.inspectionMeaning) && scope.selectedEntryAnalysisRef === discovery.entryAnalysisRef &&
    same(scope.historicalEntryAnalysisRefs, inputs.historyRefs) && strings(mapping.limits) &&
    Array.isArray(mapping.units) && mapping.units.length === indexed.size, 'Invalid selected code mapping scope.');
  const reviewedPaths = new Set(inputs.reviewedRanges.map(item => item.path));
  const selectors = new Map([...members].map(([id, membership]) => [id, membership.value as PathSelectors]));
  const mapped = new Map<unknown, unknown>();
  for (const unit of mapping.units as Fields[]) {
    claim(unit.id);
    assert(!mapped.has(unit.path) && indexed.has(unit.path) && indexed.get(unit.path)?.sha256 === unit.sha256 && strings(unit.roles) &&
      text(unit.reason) && unit.inspection === (reviewedPaths.has(unit.path) ? 'reviewed' : 'unreviewed'),
    'Invalid mapped unit or inspection coverage: ' + unit.path);
    const path = unit.path as string;
    assert(same(pathOwners(path, selectors), unit.owner === null ? [] : [unit.owner]), 'Mapping and direct membership differ: ' + path);
    if (unit.owner === null) assert(unit.membershipRef === null, 'Unknown unit selects a membership: ' + path);
    else {
      const selectedMembership = resolve(unit.membershipRef);
      const membership = members.get(unit.owner) as Fields;
      assert(same(selectedMembership, membership) || same(selectedMembership, membership.value),
        'Mapped membership reference differs from proposed intent: ' + path);
    }
    evidence(unit);
    mapped.set(unit.path, unit.owner);
  }
  return { files: mapped.size, owns: (path, owner) => mapped.has(path) && mapped.get(path) === owner };
}
