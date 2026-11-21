import { isDeepStrictEqual as same } from 'node:util';
import { baselineSchema } from '@choom/baseline-model';
import type { BaselineSourceLocation, BaselineV6, BoundaryUnit } from '@choom/baseline-model/contracts';
import { baselineStatements } from '@choom/baseline-model/item-statements';
import { registeredOperation, registrationInputs } from './boundary-registrations.ts';
import { checkBoundaryCoverage } from './boundary-coverage.ts';
import { BoundarySourceBindings, graphContexts, sourceForRoot } from './boundary-source-bindings.ts';
import { BoundaryRuleChecker, type CheckedSyntax } from './boundary-rule-checker.ts';
import { assert, type Artifact, type Fields, object, referenced, sourceExtension } from './record-checks.ts';
import { validateSourceLocation, type SourceRecords } from './record-sources.ts';
import type { GitIdentityRecord } from './stage-1-git.ts';
import { loadTsMorph } from './ts-morph-modules.ts';

interface BoundaryInputs {
  baseline: BaselineV6;
  mapping: Fields;
  graph: Fields;
  discovery: Fields;
  entry: Fields;
  source: SourceRecords;
  reviewedRanges: Fields[];
  run: Fields & { snapshot: { id: string; inventoryRef: string } };
  artifacts: Map<string, Artifact>;
  document(ref: string): unknown;
  readSource(path: string, limit: number): Buffer;
}

function validateIdentity(input: BoundaryInputs): BaselineV6 | undefined {
  const { run, artifacts, document, baseline: { boundaryReview: { identity, status } } } = input;
  const frozen = document('s1-file@evidence%2Fstage1-inputs.json') as Fields;
  assert(status === 'current', 'Publish a current boundary review from the selected mapping.');
  assert(identity.projectKey === run.projectKey && frozen.projectKey === run.projectKey,
    'The boundary project key differs from the frozen Stage 1 input.');
  assert(identity.snapshotRef === run.snapshot.id && identity.inventoryDigest === artifacts.get(run.snapshot.inventoryRef)?.sha256,
    'The boundary snapshot or inventory digest differs from the selected inventory.');
  assert(identity.mappingRef === input.discovery.codeMappingRef, 'The boundary review selects the wrong mapping.');
  const git = document('git-identity-001') as GitIdentityRecord;
  assert(git.snapshotRef === run.snapshot.id, 'The Git identity belongs to a different snapshot.');
  const dirty = git.status === 'available' && [git.localChanges.changed, git.localChanges.notInCommit, git.localChanges.notInSnapshot]
    .some((paths) => paths.length > 0);
  assert(identity.sourceKind === (git.status === 'available' ? dirty ? 'working-tree' : 'commit' : 'snapshot') &&
    identity.baseCommit === (git.status === 'available' ? git.commit : null), 'The boundary source identity differs from the capture.');
  assert(same(frozen.referenceBaseline, run.referenceBaseline), 'The selected reference differs from the frozen Stage 1 input.');
  if (run.referenceBaseline === null) {
    assert(identity.referenceDigest === undefined, 'There is no frozen reference baseline for this review.');
    return undefined;
  }
  const reference = run.referenceBaseline;
  assert(object(reference) && reference.artifactRef === 'reference-baseline-001' &&
    artifacts.get(reference.artifactRef)?.sha256 === identity.referenceDigest && reference.sha256 === identity.referenceDigest,
  'The review must cite the digest of the frozen reference.');
  const result = baselineSchema.safeParse(document(reference.artifactRef));
  assert(result.success && result.data.formatVersion === 6 && result.data.boundaryReview.identity.projectKey === identity.projectKey,
    'The frozen reference must select this v6 project.');
  return result.data;
}

function unitKey(unit: Pick<BoundaryUnit, 'unitKind' | 'path' | 'symbol'>): string {
  return JSON.stringify([unit.path, unit.unitKind, unit.symbol]);
}

function matchedUnit(current: BaselineV6, previous: BaselineV6 | undefined, unit: BoundaryUnit): BoundaryUnit | undefined {
  const old = previous?.boundaryReview;
  if (!old) return undefined;
  const review = current.boundaryReview;
  if (unit.stableId) {
    const stable = old.units.filter((other) => other.stableId === unit.stableId);
    if (stable.length === 1 && review.units.filter((other) => other.stableId === unit.stableId).length === 1) return stable[0];
  }
  const exact = old.units.filter((other) => unitKey(other) === unitKey(unit));
  if (exact.length === 1) return exact[0];
  const match = review.matches.find((candidate) => candidate.unitId === unit.id && !candidate.operationId);
  const found = match && old.units.filter((other) => other.path === match.oldPath && other.symbol === match.oldSymbol);
  return found?.length === 1 ? found[0] : undefined;
}

function originalOwner(current: Map<string, BoundaryUnit>, exactBefore: (unit: BoundaryUnit) => BoundaryUnit | undefined, id: string) {
  const units = [...current.values()].filter((unit) => unit.ownerId === id);
  const owners = new Set(units.map((unit) => exactBefore(unit)?.ownerId));
  return units.length && owners.size === 1 ? [...owners][0] : undefined;
}

function verifyReference({ baseline }: BoundaryInputs, reference: BaselineV6 | undefined): void {
  const review = baseline.boundaryReview;
  const old = reference?.boundaryReview;
  const current = new Map(review.units.map((unit) => [unit.id, unit]));
  const previous = new Map((old?.units ?? []).map((unit) => [unit.id, unit]));
  const exactBefore = (unit: BoundaryUnit) => matchedUnit(baseline, reference, unit);
  for (const match of review.matches) {
    assert(old && match.referenceDigest === review.identity.referenceDigest, 'A reviewed move needs its exact frozen reference.');
    const from = old.units.filter((unit) => unit.path === match.oldPath && unit.symbol === match.oldSymbol);
    assert(from.length === 1 && (!match.operationId ||
      old.operations.filter((op) => op.unitId === from[0]?.id && op.member === match.oldMember).length === 1),
    'The cited old declaration or member is ambiguous or missing: ' + match.unitId);
  }
  const accepted = new Map((reference ? baselineStatements(reference) : []).filter(({ statement }) => statement.status === 'accepted')
    .map((item) => [item.itemId + '.' + item.field, item.statement]));
  function acceptedStatement(name: string, acceptanceRef: string | undefined) {
    const statement = accepted.get(name);
    assert(statement?.status === 'accepted' && statement.acceptanceRef === acceptanceRef,
      'The frozen reference has no matching accepted statement: ' + name);
    return statement;
  }
  for (const { itemId, field, statement } of baselineStatements(baseline)) {
    if (statement.status !== 'accepted') continue;
    const previousStatement = acceptedStatement(itemId + '.' + field, statement.acceptanceRef);
    assert(same(previousStatement.value, statement.value), 'An inherited statement changed value: ' + itemId + '.' + field);
    const item = baseline.interfaces.find((entry) => entry.id === itemId);
    const previousInterface = reference?.interfaces.find((entry) => entry.id === itemId);
    const component = baseline.components.find((entry) => entry.id === itemId);
    assert(item?.owner.value && originalOwner(current, exactBefore, item.owner.value) === previousInterface?.owner.value ||
      component && originalOwner(current, exactBefore, component.id) === component.id ||
      !item && !component && review.rules.some((rule) => rule.statementRef === itemId + '.' + field && rule.authority === 'accepted' &&
        review.checks.some((check) => check.ruleId === rule.id || check.exceptionId === rule.id)),
    'An inherited statement needs matching current owners: ' + itemId + '.' + field);
    if (field === 'allowedConsumers' && item?.allowedConsumers.value) assert(item.allowedConsumers.value.every((id) => originalOwner(current, exactBefore, id) === id),
      'An inherited caller policy needs matching current callers: ' + itemId);
  }
  validateAcceptedRules();
  function validateAcceptedRules(): void {
    for (const rule of review.rules.filter((rule) => rule.authority === 'accepted')) {
      assert(old && rule.referenceDigest === review.identity.referenceDigest && rule.statementRef, 'Accepted policy needs a frozen statement.');
      const accepted = acceptedStatement(rule.statementRef, rule.acceptanceRef);
      const permitted = rule.kind === 'allowlist' && rule.statementRef.endsWith('.allowedConsumers') &&
        Array.isArray(accepted.value) && accepted.value.length > 0 && same(accepted.value, rule.settings.allowedConsumers);
      assert(permitted || same(accepted.value, rule.settings), 'Accepted policy differs from the frozen statement value.');
      for (const check of review.checks.filter((check) => check.ruleId === rule.id || check.exceptionId === rule.id)) {
        const units = [current.get(check.sourceUnitId), current.get(check.targetUnitId)];
        assert(units.every((unit) => unit && previous.has(exactBefore(unit)?.id ?? '')), 'An accepted policy has unmatched current units.');
        if (permitted) {
          const id = rule.statementRef.split('.')[0];
          const iface = reference?.interfaces.find((item) => item.id === id);
          const target = current.get(check.targetUnitId);
          assert(target && iface?.owner.value && exactBefore(target)?.ownerId === iface.owner.value &&
            old.operations.some((op) => op.interfaceId === id && op.unitId === exactBefore(target)?.id),
          'The accepted caller policy applies only to the matched interface and target.');
        }
      }
    }
  }
}

function reviewedNotes(input: BoundaryInputs) {
  const review = input.baseline.boundaryReview;
  const notes = new Map<string, BaselineSourceLocation>();
  const reviewed = new Set(input.reviewedRanges.map((record) => record.id));
  for (const note of review.sourceNotes) {
    validateSourceLocation(note, input.source);
    assert(reviewed.has(note.evidenceRef), 'The boundary note was not inspected in the selected review: ' + note.evidenceRef);
    notes.set(note.evidenceRef, note.location);
  }
  const allNotes = [ ...(input.baseline.sourceUsage?.assessments ?? []).flatMap((item) => item.sourceNotes),
    ...input.baseline.interfaces.flatMap((item) => item.documentation?.sourceNotes ?? [])];
  for (const note of allNotes) if (note.location) {
    notes.set(note.evidenceRef, note.location);
  }
  return { notes, reviewed };
}

function mappedSymbols(selected: Map<string, Fields>) {
  const symbols = new Map<string, string[]>();
  for (const unit of selected.values()) if (unit.unitKind === 'symbol') {
    const path = String(unit.path);
    const list = symbols.get(path) ?? [];
    list.push(String(unit.symbol));
    symbols.set(path, list);
  }
  return symbols;
}

interface BindingInputs {
  units: Map<string, BoundaryUnit>;
  notes: Map<string, BaselineSourceLocation>;
  graphs: Map<string, ReturnType<typeof graphContexts>[number]>;
  symbols: Map<string, string[]>;
}

function compilerBindings(input: BoundaryInputs, { units, notes, graphs, symbols }: BindingInputs) {
  const review = input.baseline.boundaryReview;
  const bindings = new Map<string, BoundarySourceBindings>();
  const tools = loadTsMorph().tools;
  function binding(context: string): BoundarySourceBindings {
    const graph = graphs.get(context);
    assert(graph, 'The boundary access names an unknown resolution context: ' + context);
    let saved = bindings.get(context);
    if (!saved) {
      const paths = review.accesses.filter((site) => site.context === context).flatMap((site) => [
        referenced(units, site.callerUnitId).path, ...(site.emittedCopies ?? []).map((copy) => referenced(notes, copy.emittedRef).path),
      ]);
      for (const behavior of input.entry.behaviorEntries as { source: { path: string } }[]) paths.push(behavior.source.path);
      for (const op of review.operations) paths.push(referenced(units, op.unitId).path);
      for (const check of review.checks) if (check.context === context && check.coverage.status === 'complete') {
        for (const id of check.coverage.examinedUnitIds) paths.push(referenced(units, id).path);
      }
      for (const search of review.callerSearches) if (search.coverage.status === 'complete') {
        for (const id of search.coverage.examinedUnitIds) paths.push(referenced(units, id).path);
      }
      saved = new BoundarySourceBindings(tools, graph, [...new Set(paths)], symbols, input.readSource);
      bindings.set(context, saved);
    }
    return saved;
  }
  return binding;
}

export function validateBoundaryReview(input: BoundaryInputs): void {
  const { boundaryReview: review } = input.baseline;
  const reference = validateIdentity(input);
  verifyReference(input, reference);
  const selected = new Map((input.mapping.units as Fields[]).map((unit) => [
    unitKey({ path: String(unit.path), symbol: unit.symbol as string | undefined, unitKind: (unit.unitKind ?? 'file') as BoundaryUnit['unitKind'] }),
    unit,
  ]));
  const units = new Map(review.units.map((unit) => [unit.id, unit]));
  for (const unit of review.units) {
    const mapped = selected.get(unitKey(unit));
    assert(mapped && mapped.owner === unit.ownerId, 'Boundary unit differs from the selected exact mapped owner: ' + unit.id);
    assert(review.identity.analysisRoots.some((root) => sourceForRoot(unit.path, root)),
      'Boundary unit is outside the stated analysis roots: ' + unit.id);
  }
  const { notes, reviewed } = reviewedNotes(input);
  const graphs = new Map(graphContexts(input.graph).map((graph) => [graph.id, graph]));
  const binding = compilerBindings(input, { units, notes, graphs, symbols: mappedSymbols(selected) });
  const registrations = registrationInputs(input.entry, input.baseline.systemEntryPoints?.entries ?? [], input.document);
  for (const op of review.operations) {
    const target = referenced(units, op.unitId);
    if (!sourceExtension.test(target.path)) continue;
    const graph = [...graphs.values()].find((item) => item.scanFiles.includes(target.path));
    const evidence = op.evidenceRefs.flatMap((ref) => reviewed.has(ref) && notes.has(ref) ? [referenced(notes, ref)] : []);
    assert(graph, 'The operation has no captured graph context: ' + op.id);
    const compiler = binding(graph.id);
    assert(evidence.some((note) => note.path === target.path && compiler.declaration(target, op.member, note)) ||
      registeredOperation(registrations, { unit: target, operation: op, compiler, notes: evidence }),
    'The operation needs its mapped declaration or a verified registration and handler in reviewed source: ' + op.id);
  }
  for (const access of review.accesses) {
    const caller = referenced(units, access.callerUnitId);
    const location = notes.get(access.callerRef);
    assert(location?.path === caller.path && reviewed.has(access.callerRef), 'The boundary access needs its reviewed caller range: ' + access.id);
    const target = access.targetUnitId ? units.get(access.targetUnitId) : undefined;
    const compiler = binding(access.context);
    compiler.check(access, location, caller, target);
    for (const copy of access.emittedCopies ?? []) {
      assert(access.kind === 'call' && target && access.member, 'Only a bound call can use the exact emitted-site check.');
      compiler.verifyCopy(location, referenced(notes, copy.emittedRef), referenced(notes, copy.proofRef), target, access.member);
    }
  }
  const inventory = input.document(input.run.snapshot.inventoryRef) as { files: { path: string }[] };
  const sourceSites = String(input.discovery.dependenciesRef).replace(/graph-results\.json$/, 'source-sites.json');
  const syntax = input.document(sourceSites) as CheckedSyntax;
  const files = new Set(inventory.files.map((file) => file.path));
  new BoundaryRuleChecker({ review, notes, contexts: graphs, inventory: files, readSource: input.readSource, syntax }).verify();
  checkBoundaryCoverage({ review, mapping: input.mapping, notes, inventory: files, syntax, graphs, binding });
}
