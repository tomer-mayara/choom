import { posix } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import type { BaselineBoundaryReview, BaselineSourceLocation, BoundaryAccessKind, BoundaryCheck, BoundaryRule }
  from '@choom/baseline-model/contracts';
import { type BoundaryGraphContext, type BoundaryGraphEdge, sourceForRoot } from './boundary-source-bindings.ts';
import { assert, object, referenced, sourceExtension, type Fields } from './record-checks.ts';

interface SyntaxSite { path: string; kind: string; specifier: string | null; typeOnly: boolean | null }
export interface CheckedSyntax { scope: { path: string }[]; sites: SyntaxSite[]; diagnostics: { path: string }[]; omittedSites: number }
interface RuleInput {
  review: BaselineBoundaryReview;
  notes: Map<string, BaselineSourceLocation>;
  contexts: Map<string, BoundaryGraphContext>;
  inventory: Set<string>;
  readSource(path: string, limit: number): Buffer;
  syntax: CheckedSyntax;
}

const codeKinds: readonly BoundaryAccessKind[] = ['import', 're-export', 'require', 'dynamic-import', 'type'];
const supportedCondition = (record: Fields, allowed: string[]) => Object.keys(record).every((key) => allowed.includes(key));

// The checked pattern subset has a literal prefix or exact path. More complex declarative rules stay unassessed.
function pathSelector(pattern: unknown): ((path: string) => boolean) | undefined {
  const raw = Array.isArray(pattern) ? pattern : [pattern];
  const matches: ((path: string) => boolean)[] = [];
  for (const value of raw) {
    if (typeof value !== 'string' || !/^\^(?:[\w/ -]|\\\.)+\$?$/.test(value)) return undefined;
    const exact = value.endsWith('$');
    const literal = value.slice(1, exact ? -1 : undefined).replaceAll('\\.', '.');
    matches.push((path) => exact ? path === literal : path.startsWith(literal));
  }
  return (path) => matches.some((test) => test(path));
}

function appliesToEdge(edge: BoundaryGraphEdge, kinds: readonly BoundaryAccessKind[]): boolean {
  return edge.preCompilationOnly === true || edge.dependencyTypes.includes('type-only') ? kinds.includes('type') :
    edge.dynamic === true ? kinds.includes('dynamic-import') : kinds.some((kind) => ['import', 'require', 're-export'].includes(kind));
}

export class BoundaryRuleChecker {
  private readonly input: RuleInput;
  private readonly units: Map<string, BaselineBoundaryReview['units'][number]>;
  private readonly unitsByPath = new Map<string, string[]>();
  private readonly accesses: Map<string, BaselineBoundaryReview['accesses'][number]>;
  private readonly rules: Map<string, BoundaryRule>;

  constructor(input: RuleInput) {
    this.input = input;
    this.units = new Map(input.review.units.map((unit) => [unit.id, unit]));
    for (const unit of input.review.units) {
      const ids = this.unitsByPath.get(unit.path) ?? [];
      ids.push(unit.id);
      this.unitsByPath.set(unit.path, ids);
    }
    this.accesses = new Map(input.review.accesses.map((site) => [site.id, site]));
    this.rules = new Map(input.review.rules.map((rule) => [rule.id, rule]));
  }

  private configuration(rule: BoundaryRule): boolean {
    if (rule.authority === 'accepted') return true;
    if (rule.authority !== 'repository') return false;
    for (const ref of rule.evidenceRefs) {
      const source = this.input.notes.get(ref);
      if (!source || source.sha256 !== rule.revision || !source.path.endsWith('.json')) continue;
      const data: unknown = JSON.parse(this.input.readSource(source.path, 2 * 1024 * 1024).toString('utf8'));
      if (!object(data)) continue;
      // Exact repository declarations can also describe an explicit caller, member or import restriction.
      if (posix.basename(source.path) === '.choom-boundaries.json' && Array.isArray(data.boundaryRules) && data.boundaryRules.some((r: unknown) => object(r) && r.id === rule.id &&
        r.kind === rule.kind && same(r.settings, rule.settings) && same(r.accessKinds, rule.accessKinds) &&
        r.overridesRuleId === rule.overridesRuleId)) return true;
      if (!Array.isArray(data.forbidden) || !/^(?:\.dependency-cruiser|dependency-cruiser)(?:\.[\w-]+)?\.json$/.test(posix.basename(source.path))) continue;
      const options = data.options;
      const settings = options ? { rule: data.forbidden.find((r: unknown) => object(r) && r.name === rule.id), options } :
        data.forbidden.find((r: unknown) => object(r) && r.name === rule.id);
      if (!same(settings, rule.settings) || data.extends !== undefined) continue;
      if (object(options) && !supportedCondition(options, ['tsPreCompilationDeps', 'enhancedResolveOptions', 'doNotFollow', 'tsConfig'])) continue;
      if (posix.basename(source.path) !== '.dependency-cruiser.json') {
        const manifest = rule.evidenceRefs.map((ref) => this.input.notes.get(ref)).find((note) => note?.path.endsWith('package.json'));
        if (!manifest) continue;
        const pkg: unknown = JSON.parse(this.input.readSource(manifest.path, 2 * 1024 * 1024).toString('utf8'));
        if (!object(pkg) || !object(pkg.scripts) || !Object.values(pkg.scripts).some((cmd) => typeof cmd === 'string' &&
          /\b(?:depcruise|dependency-cruiser)\b/.test(cmd) && cmd.split(/\s+/).some((word, index, words) =>
            ['-c', '--config'].includes(words[index - 1] ?? '') && posix.join(posix.dirname(manifest.path), word) === source.path))) continue;
      }
      return true;
    }
    return false;
  }

  private resolutionOptions(options: Fields | undefined, graph: BoundaryGraphContext, check: BoundaryCheck): void {
    assert(!options || options.tsConfig === undefined && options.doNotFollow === undefined &&
      [undefined, true, false, 'specify'].includes(options.tsPreCompilationDeps as string | boolean | undefined),
    'Unverified compiler or traversal settings need an unknown result: ' + check.id);
    if (options?.enhancedResolveOptions === undefined) return;
    const resolution = options.enhancedResolveOptions;
    assert(object(resolution) && supportedCondition(resolution, ['conditionNames', 'exportsFields']) &&
      (!resolution.conditionNames || same(resolution.conditionNames, graph.conditionNames)) &&
      (!resolution.exportsFields || same(resolution.exportsFields, ['exports'])), 'Resolution settings differ from the saved graph: ' + check.id);
  }

  private moduleRule(rule: BoundaryRule, check: BoundaryCheck, graph: BoundaryGraphContext): void {
    const wrapper = rule.settings;
    const declaration = object(wrapper.rule) ? wrapper.rule : wrapper;
    assert(supportedCondition(declaration, ['name', 'comment', 'severity', 'from', 'to']) && object(declaration.from) &&
      object(declaration.to) && supportedCondition(declaration.from, ['path']) &&
      supportedCondition(declaration.to, ['path', 'reachable', 'dependencyTypesNot']) &&
      (declaration.severity === undefined || declaration.severity === 'error' || declaration.severity === 'warn') &&
      (declaration.to.reachable === true) === (rule.kind === 'reachability'), 'Unsupported declarative settings need an unknown result: ' + rule.id);
    const from = pathSelector(declaration.from.path);
    const to = pathSelector(declaration.to.path);
    const source = referenced(this.units, check.sourceUnitId);
    const target = referenced(this.units, check.targetUnitId);
    assert(from && to && from(source.path), 'The effective source selector is not applicable: ' + check.id);
    if (check.result !== 'allowed') assert(to(target.path), 'The effective target selector is not applicable: ' + check.id);
    const excludeTypes = declaration.to.dependencyTypesNot;
    assert(excludeTypes === undefined || same(excludeTypes, ['type-only']) || same(excludeTypes, ['pre-compilation-only']),
      'Unsupported dependency kind filter: ' + rule.id);
    const options = object(wrapper.options) ? wrapper.options : undefined;
    this.resolutionOptions(options, graph, check);
    const effectiveKinds = codeKinds.filter((kind) => kind !== 'type' || !excludeTypes && options?.tsPreCompilationDeps !== false);
    assert(effectiveKinds.every((kind) => rule.accessKinds.includes(kind)) && rule.accessKinds.every((kind) => effectiveKinds.includes(kind)),
      'The rule access kinds differ from the effective settings: ' + rule.id);
    if (check.result === 'allowed' && !check.exceptionId) assert(!to(target.path), 'The effective rule forbids this target: ' + check.id);
    if (check.coverage.status === 'complete') this.completeTraversal(check, graph, { from, targetPath: target.path, effectiveKinds,
      transitive: rule.kind === 'reachability' });
  }

  private completeTraversal(check: BoundaryCheck, graph: BoundaryGraphContext, scope: { from: (path: string) => boolean;
    targetPath: string; effectiveKinds: readonly BoundaryAccessKind[]; transitive: boolean }): void {
    const { from, targetPath, effectiveKinds, transitive } = scope;
    const starts = [...this.input.inventory].filter((path) => sourceExtension.test(path) && from(path));
    assert(starts.length > 0 && starts.every((path) => check.coverage.roots.some((root) => sourceForRoot(path, root))),
      'A complete reachability check omitted an applicable root: ' + check.id);
    const examined = new Set(check.coverage.examinedUnitIds);
    const scanned = new Set(graph.scanFiles);
    const visited = new Set(starts);
    const byPath = new Map<string, BoundaryGraphEdge[]>();
    for (const edge of graph.edges) {
      const entries = byPath.get(edge.from) ?? [];
      entries.push(edge);
      byPath.set(edge.from, entries);
    }
    const inputs = this.input.syntax;
    assert(inputs.omittedSites === 0, 'The saved source syntax has omissions: ' + check.id);
    for (const path of visited) {
      const ids = this.unitsByPath.get(path);
      assert(ids && ids.every((id) => examined.has(id)) && scanned.has(path) &&
        inputs.scope.some((file) => file.path === path) && !inputs.diagnostics.some((file) => file.path === path),
      'A complete rule check must examine every applicable root and reachable unit: ' + path);
      const edges = byPath.get(path) ?? [];
      const syntax = inputs.sites.filter((site) => site.path === path && site.kind !== 'resource-call-candidate' &&
        (effectiveKinds.includes('type') || site.typeOnly !== true));
      assert(syntax.every((site) => site.specifier !== null && edges.some((edge) => edge.specifier === site.specifier)),
        'Unresolved or omitted source dependency prevents complete coverage: ' + path);
      for (const edge of edges.filter((edge) => appliesToEdge(edge, effectiveKinds))) {
        if (edge.targetKind === 'builtin') continue;
        assert(edge.to && edge.targetKind === 'internal', 'Unresolved or stopped edge prevents complete coverage: ' + check.id);
        if (check.result === 'absent') assert(edge.to !== targetPath, 'The saved graph reaches the claimed absent target: ' + check.id);
        if (transitive) visited.add(edge.to);
      }
    }
  }

  private direct(rule: BoundaryRule, check: BoundaryCheck): void {
    const settings = rule.settings;
    const supported = { visibility: 'visibility', allowlist: 'allowedConsumers', path: 'permission' };
    assert(rule.kind in supported && supportedCondition(settings, ['sourcePath', 'targetPath', 'member', 'path',
      supported[rule.kind as keyof typeof supported]]), 'Unsupported direct policy settings need an unknown result: ' + rule.id);
    const accesses = check.accessIds.map((id) => referenced(this.accesses, id));
    const caller = referenced(this.units, check.sourceUnitId);
    const target = referenced(this.units, check.targetUnitId);
    assert(caller.ownerId !== null && target.ownerId !== null && (!settings.targetPath || settings.targetPath === target.path) &&
      (!settings.sourcePath || settings.sourcePath === caller.path), 'Direct boundary policy requires its applicable mapped units.');
    const match = (site: typeof accesses[number]) =>
      (!settings.member || settings.member === site.member) && (!settings.path || settings.path === site.writtenPath);
    assert(accesses.every(match), 'The access is outside the explicit member or path restriction: ' + check.id);
    let denied: boolean;
    if (rule.kind === 'visibility' && settings.visibility === 'private') denied = caller.ownerId !== null && caller.ownerId !== target.ownerId;
    else if (rule.kind === 'allowlist' && Array.isArray(settings.allowedConsumers) && settings.allowedConsumers.length > 0)
      denied = caller.ownerId !== null && !settings.allowedConsumers.includes(caller.ownerId);
    else if (rule.kind === 'path' && typeof settings.path === 'string' && settings.permission === 'forbidden') denied = true;
    else throw new Error('Unsupported boundary rule settings need an unknown result: ' + rule.id);
    if (check.result !== 'absent' && !check.exceptionId) assert(denied === (check.result === 'forbidden'), 'Result differs from the explicit rule: ' + check.id);
    if (check.result === 'absent') assert(!this.input.review.accesses.some((site) => site.context === check.context &&
      site.callerUnitId === caller.id && site.targetUnitId === target.id && rule.accessKinds.includes(site.kind) && match(site)),
    'The stated absent member or path has an observed access: ' + check.id);
  }

  verify(): void {
    for (const check of this.input.review.checks) {
      if (check.result === 'unknown') continue;
      const rule = referenced(this.rules, check.ruleId);
      assert((check.checker === 'choom-source-graph' || check.checker === 'choom-boundary') && check.checkerVersion === '1',
        'Unsupported boundary checker or version: ' + check.id);
      assert(this.configuration(rule), 'The effective rule settings and revision must match an applicable declaration or accepted policy: ' + rule.id);
      const graph = this.input.contexts.get(check.context);
      assert(graph, 'The check did not select a saved resolution context: ' + check.id);
      if (check.exceptionId) {
        const exception = referenced(this.rules, check.exceptionId);
        const settings = exception.settings;
        assert(this.configuration(exception) && supportedCondition(settings, ['overridesRuleId', 'sourcePath', 'targetPath', 'member', 'path']) &&
          check.accessIds.every((id) => {
            const site = referenced(this.accesses, id);
            return (!settings.member || settings.member === site.member) && (!settings.path || settings.path === site.writtenPath) &&
              exception.accessKinds.includes(site.kind);
          }) && settings.overridesRuleId === rule.id &&
          settings.sourcePath === this.units.get(check.sourceUnitId)?.path && settings.targetPath === this.units.get(check.targetUnitId)?.path,
        'The cited exception does not apply to this rule and access: ' + check.id);
      }
      const settings = object(rule.settings.rule) ? rule.settings.rule : rule.settings;
      if (rule.kind === 'reachability' || rule.kind === 'path' && settings.from !== undefined) this.moduleRule(rule, check, graph);
      else this.direct(rule, check);
    }
  }
}
