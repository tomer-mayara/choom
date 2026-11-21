import type { BaselineBoundaryReview, BaselineSourceLocation, BoundaryAccess, BoundaryCallerSearch, BoundaryCheck, BoundaryCoverage, BoundaryRule, BoundaryUnit }
  from '@choom/baseline-model/contracts';
import type { CheckedSyntax } from './boundary-rule-checker.ts';
import { type BoundaryGraphContext, type BoundarySourceBindings, type BoundObservation, type ObservationScope, sourceForRoot } from './boundary-source-bindings.ts';
import { assert, object, referenced, sourceExtension, type Fields } from './record-checks.ts';

interface Inputs {
  review: BaselineBoundaryReview;
  mapping: Fields;
  notes: Map<string, BaselineSourceLocation>;
  inventory: Set<string>;
  syntax: CheckedSyntax;
  graphs: Map<string, BoundaryGraphContext>;
  binding(context: string): BoundarySourceBindings;
}

class CheckedCoverage {
  private readonly input: Inputs;
  private readonly units: Map<string, BoundaryUnit>;
  private readonly mappedFiles = new Map<string, (BoundaryUnit | undefined)[]>();

  constructor(input: Inputs) {
    this.input = input;
    this.units = new Map(input.review.units.map((unit) => [unit.id, unit]));
    const unitByMap = new Map(input.review.units.map((unit) => [JSON.stringify([unit.path, unit.unitKind, unit.symbol]), unit]));
    for (const mapped of input.mapping.units as Fields[]) {
      const path = String(mapped.path);
      const mappedUnits = this.mappedFiles.get(path) ?? [];
      mappedUnits.push(unitByMap.get(JSON.stringify([path, mapped.unitKind ?? 'file', mapped.symbol])));
      this.mappedFiles.set(path, mappedUnits);
    }
  }

  private filesUnder(roots: string[]): string[] {
    assert(roots.every((root) => this.input.review.identity.analysisRoots.some((area) => sourceForRoot(root, area))),
      'Complete coverage roots must be inside the captured analysis roots.');
    return [...this.input.inventory].filter((path) => sourceExtension.test(path) && roots.some((root) => sourceForRoot(path, root)));
  }

  inventoryProof(coverage: BoundaryCoverage): void {
    if (!coverage.inventoryRoots?.length) return;
    assert(coverage.status === 'complete', 'Verified inventory roots require complete coverage.');
    const examined = new Set(coverage.examinedUnitIds);
    for (const path of this.filesUnder(coverage.inventoryRoots)) assert(this.mappedFiles.get(path)?.every((unit) =>
      unit && unit.ownerId !== null && examined.has(unit.id)), 'Verified inventory omitted a mapped JS/TS unit or owner: ' + path);
  }

  private scopedUnits(coverage: BoundaryCoverage, role?: BoundaryCallerSearch['role']): BoundaryUnit[] {
    const examined = new Set(coverage.examinedUnitIds);
    const units: BoundaryUnit[] = [];
    for (const path of this.filesUnder(coverage.roots)) {
      const mapped = this.mappedFiles.get(path);
      assert(mapped && mapped.length > 0 && mapped.every((unit) => unit && unit.ownerId !== null && !unit.roles.includes('unknown')),
        'Complete coverage requires every scoped unit and its owner and role: ' + path);
      for (const unit of mapped) if (unit && (!role || unit.roles.includes(role))) {
        assert(examined.has(unit.id), 'Caller search did not account for every scoped unit: ' + path);
        units.push(unit);
      }
    }
    return units;
  }

  private completeInputs(graph: BoundaryGraphContext, scope: ObservationScope): void {
    const { syntax, review } = this.input;
    const path = scope.caller.path;
    const edges = graph.edges.filter((edge) => edge.from === path);
    const inputs = syntax.sites.filter((site) => site.path === path && site.kind !== 'resource-call-candidate');
    assert(graph.scanFiles.includes(path) && syntax.omittedSites === 0 && syntax.scope.some((item) => item.path === path) &&
      !syntax.diagnostics.some((item) => item.path === path) &&
      inputs.every((site) => site.specifier && edges.some((edge) => edge.specifier === site.specifier)) &&
      edges.every((edge) => edge.targetKind === 'builtin' || edge.targetKind === 'internal' && edge.to && graph.scanFiles.includes(edge.to)) &&
      !review.accesses.some((site) => site.context === graph.id && !site.targetUnitId && site.callerUnitId === scope.caller.id),
    'An unresolved input prevents a complete caller or policy search: ' + path);
  }

  private recorded(observations: BoundaryAccess[], context: string, found: BoundObservation): boolean {
    return !found.uncertain && observations.some((site) => {
      const lines = this.input.notes.get(site.callerRef)?.lines;
      return site.context === context && site.kind === found.kind && (site.writtenPath === found.route || site.writtenPath === found.expression) &&
        lines && found.position.line >= Number(lines[0]) && found.position.line <= Number(lines[1]);
    });
  }

  private callerSites(search: BoundaryCallerSearch, scope: ObservationScope): void {
    const { review, graphs, binding } = this.input;
    const contexts = [...graphs.values()].filter((graph) => graph.scanFiles.includes(scope.caller.path));
    assert(contexts.length, 'The caller is outside the saved graph contexts: ' + scope.caller.path);
    const recorded = review.accesses.filter((site) => site.operationId === search.operationId &&
      site.callerUnitId === scope.caller.id && site.callerRole === search.role);
    for (const graph of contexts) {
      this.completeInputs(graph, scope);
      const observed = binding(graph.id).observations(scope, true);
      for (const found of observed) assert(this.recorded(recorded, graph.id, found),
        'A complete caller search omitted a bound or unresolved ' + found.kind + ': ' + scope.caller.path);
    }
  }

  search(search: BoundaryCallerSearch): void {
    if (search.coverage.status !== 'complete') return;
    const op = this.input.review.operations.find((op) => op.id === search.operationId);
    assert(op, 'Missing operation for caller search: ' + search.operationId);
    const target = referenced(this.units, op.unitId);
    for (const caller of this.scopedUnits(search.coverage, search.role)) if (caller.ownerId !== target.ownerId)
      this.callerSites(search, { caller, target, member: op.member, kinds: search.coverage.accessKinds });
  }

  direct(check: BoundaryCheck, rule: BoundaryRule): void {
    if (check.result === 'unknown' || check.coverage.status !== 'complete' || rule.kind === 'reachability') return;
    const settings = object(rule.settings.rule) ? rule.settings.rule : rule.settings;
    if (rule.kind === 'path' && settings.from !== undefined) return; // The saved graph verifies this module policy.
    const graph = referenced(this.input.graphs, check.context);
    const caller = referenced(this.units, check.sourceUnitId);
    const target = referenced(this.units, check.targetUnitId);
    assert(this.scopedUnits(check.coverage).some((unit) => unit.id === caller.id),
      'The claimed absent access requires the mapped caller in the covered source inventory: ' + check.id);
    const scope = { caller, target, kinds: rule.accessKinds, member: typeof settings.member === 'string' ? settings.member : undefined };
    this.completeInputs(graph, scope);
    const observed = this.input.binding(graph.id).observations(scope, true).filter((site) => site.uncertain || !settings.path ||
      settings.path === site.route || settings.path === site.expression);
    if (check.result === 'absent') assert(!observed.length, 'The claimed absent restriction has a bound or unresolved source access: ' + check.id);
    else {
      const recorded = this.input.review.accesses.filter((site) => site.callerUnitId === caller.id && site.targetUnitId === target.id &&
        (!scope.member || site.member === scope.member));
      assert(observed.every((site) => this.recorded(recorded, graph.id, site)), 'The complete direct policy check omitted a bound access: ' + check.id);
    }
  }
}

export function checkBoundaryCoverage(input: Inputs): void {
  const checker = new CheckedCoverage(input);
  const rules = new Map(input.review.rules.map((rule) => [rule.id, rule]));
  for (const check of input.review.checks) {
    checker.inventoryProof(check.coverage);
    checker.direct(check, referenced(rules, check.ruleId));
  }
  for (const search of input.review.callerSearches) {
    checker.inventoryProof(search.coverage);
    checker.search(search);
  }
}
