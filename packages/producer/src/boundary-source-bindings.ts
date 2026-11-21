import { SourceMap, type SourceMapPayload } from 'node:module';
import { posix } from 'node:path';
import type { BoundaryAccess, BoundaryAccessKind, BoundaryUnit, BaselineSourceLocation } from '@choom/baseline-model/contracts';
import type { ts as TS } from 'ts-morph';
import { loadingBindings } from './boundary-loading-sites.ts';
import { sourcePosition } from './snapshot-exports.ts';
import { partDependencies, type PartDependencies } from './part-dependencies.ts';
import { assert, object, type Fields } from './record-checks.ts';
import { fileSites } from './stage-4-source-sites.ts';
import type { SourceRange } from './snapshot-references.ts';
import { virtualRoot, type ProjectTools } from './snapshot-project.ts';
import { callCandidates } from './behavior-entry-calls.ts';
import type { BehaviorEntryCallRule } from './generated/contracts.ts';

const sourceLimit = 2 * 1024 * 1024;
export interface BoundaryGraphEdge {
  from: string; to: string | null; specifier: string; targetKind: string;
  dynamic: boolean | null; preCompilationOnly: boolean | null; dependencyTypes: string[];
}
export interface BoundaryGraphContext {
  id: string; scanFiles: string[]; edges: BoundaryGraphEdge[]; conditionNames: string[]; moduleSystems: string[];
}
export interface CallPosition { line: number; column: number }
interface BoundCall { position: CallPosition; expression: string; route?: string }
export interface BoundObservation extends BoundCall { kind: BoundaryAccessKind; uncertain?: boolean }
export interface ObservationScope { caller: BoundaryUnit; target: BoundaryUnit; member?: string; kinds: BoundaryAccessKind[] }

// Resolve imports only through the selected saved graph. The compiler host has no disk access.
export class BoundarySourceBindings {
  private readonly ts: ProjectTools['ts'];
  private readonly program: TS.Program;
  private readonly checker: TS.TypeChecker;
  private readonly edgesByFile = new Map<string, BoundaryGraphEdge[]>();
  private readonly symbols: Map<string, string[]>;
  private readonly parts = new Map<string, PartDependencies>();
  private readonly readSource: (path: string, limit: number) => Buffer;
  private readonly sourceCache = new Map<string, TS.SourceFile>();

  constructor(tools: ProjectTools, context: BoundaryGraphContext, roots: string[], symbols: Map<string, string[]>, readSource: (path: string, limit: number) => Buffer) {
    this.ts = tools.ts;
    this.symbols = symbols;
    this.readSource = readSource;
    for (const edge of context.edges) {
      const outgoing = this.edgesByFile.get(edge.from) ?? [];
      outgoing.push(edge);
      this.edgesByFile.set(edge.from, outgoing);
    }
    const files = new Set(context.scanFiles);
    const root = virtualRoot + '/';
    const pathOf = (file: string) => file.startsWith(root) ? file.slice(root.length) : '';
    const source = (path: string) => {
      if (!files.has(path)) return undefined;
      let saved = this.sourceCache.get(path);
      if (!saved) {
        saved = tools.ts.createSourceFile(root + path, readSource(path, sourceLimit).toString('utf8'),
          tools.ts.ScriptTarget.Latest, true);
        this.sourceCache.set(path, saved);
      }
      return saved;
    };
    const options: TS.CompilerOptions = { allowJs: true, checkJs: true, noLib: true, types: [], skipLibCheck: true,
      module: tools.ts.ModuleKind.ESNext, target: tools.ts.ScriptTarget.Latest, jsx: tools.ts.JsxEmit.Preserve };
    const host: TS.CompilerHost = {
      getSourceFile: (file) => source(pathOf(file)), fileExists: (file) => files.has(pathOf(file)),
      readFile: (file) => source(pathOf(file))?.text, getDefaultLibFileName: () => '',
      getCurrentDirectory: () => root, getCanonicalFileName: (file) => file, useCaseSensitiveFileNames: () => true,
      writeFile: () => { throw new Error('The boundary checker is read-only.'); }, getNewLine: () => '\n',
      resolveModuleNames: (names, from) => names.map((name) => {
        const edges = this.edgesByFile.get(pathOf(from)) ?? [];
        const targets = new Set(edges.filter((edge) => edge.specifier === name && edge.targetKind === 'internal')
          .map((edge) => edge.to));
        const [target] = targets;
        return targets.size === 1 && target ? { resolvedFileName: root + target } : undefined;
      }),
    };
    this.program = tools.ts.createProgram(roots.filter((path) => files.has(path)).map((path) => root + path), options, host);
    this.checker = this.program.getTypeChecker();
  }

  private file(path: string): TS.SourceFile {
    const file = this.program.getSourceFile(virtualRoot + '/' + path);
    assert(file, 'The selected resolution context does not contain ' + path);
    return file;
  }

  private contains(source: TS.SourceFile, node: TS.Node, lines: number[]): boolean {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const end = source.getLineAndCharacterOfPosition(node.end - 1).line + 1;
    return start >= Number(lines[0]) && end <= Number(lines[1]);
  }

  private part(path: string) {
    const symbols = this.symbols.get(path);
    if (!symbols) return undefined;
    let parts = this.parts.get(path);
    if (parts === undefined) {
      parts = partDependencies({ ts: this.ts, checker: this.checker }, this.file(path), symbols);
      this.parts.set(path, parts);
    }
    return parts;
  }

  private inUnit(unit: BoundaryUnit, position: CallPosition): boolean {
    if (unit.unitKind === 'file') return true;
    const before = (a: CallPosition, b: CallPosition) => a.line < b.line || a.line === b.line && a.column < b.column;
    return this.part(unit.path)?.parts.some(({ part, ranges }) => part.unitKind === unit.unitKind &&
      (part.unitKind !== 'symbol' || part.symbol === unit.symbol) &&
      ranges.some(([start, end]) => !before(position, start) && before(position, end))) ?? false;
  }

  private declarationMatches(symbol: TS.Symbol | undefined, target: BoundaryUnit, member?: string): boolean {
    if (!symbol) return false;
    const { ts } = this;
    const resolved = this.resolved(symbol);
    if (!resolved) return false;
    const parts = member?.split('.');
    return (!parts || resolved.getName() === parts.at(-1)) && (resolved.declarations ?? []).some((declaration) => {
      if (declaration.getSourceFile().fileName !== virtualRoot + '/' + target.path) return false;
      const names = [resolved.getName()];
      let node = declaration.parent;
      while (node && !ts.isSourceFile(node)) {
        if ((ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isModuleDeclaration(node)) && node.name)
          names.unshift(node.name.text);
        node = node.parent;
      }
      const file = declaration.getSourceFile();
      const { line, character } = file.getLineAndCharacterOfPosition(declaration.getStart(file));
      return (!parts || parts.length === 1 || names.join('.') === member) && this.inUnit(target, { line: line + 1, column: character + 1 });
    });
  }

  private resolved(symbol: TS.Symbol | undefined): TS.Symbol | undefined {
    return symbol && symbol.flags & this.ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
  }

  private concreteCallee(symbol: TS.Symbol | undefined): boolean {
    const declarations = this.resolved(symbol)?.declarations;
    const ts = this.ts;
    return Boolean(declarations?.some((node) => ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
      ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))));
  }

  declaration(target: BoundaryUnit, member: string, location: BaselineSourceLocation): boolean {
    const file = this.file(target.path);
    const visit = (node: TS.Node): boolean => {
      if ((this.ts.isIdentifier(node) || this.ts.isStringLiteral(node)) && 'name' in node.parent && node.parent.name === node &&
        this.contains(file, node, location.lines) && this.declarationMatches(this.checker.getSymbolAtLocation(node), target, member)) return true;
      return this.ts.forEachChild(node, (child) => visit(child) || undefined) === true;
    };
    return visit(file);
  }

  callableHandler(unit: BoundaryUnit, range: SourceRange): boolean {
    const file = this.file(unit.path);
    const { ts, checker } = this;
    const start = file.getPositionOfLineAndCharacter(range[0].line - 1, range[0].column - 1);
    const end = file.getPositionOfLineAndCharacter(range[1].line - 1, range[1].column - 1);
    const visit = (node: TS.Node): boolean => {
      if (node.getStart(file) === start && node.end === end && !ts.isSourceFile(node) &&
        checker.getTypeAtLocation(node).getCallSignatures().length > 0) return true;
      return ts.forEachChild(node, (child) => child.pos <= start && child.end >= end && visit(child) || undefined) === true;
    };
    return this.inUnit(unit, range[0]) && visit(file);
  }

  testRegistration(behavior: { expression: string; source: Pick<BaselineSourceLocation, 'path' | 'lines'> }, unit: BoundaryUnit, member: string, notes: BaselineSourceLocation[]): boolean {
    if (!this.program.getSourceFile(virtualRoot + '/' + behavior.source.path)) return false;
    const rules: BehaviorEntryCallRule[] = ['test', 'default'].map((callPath) => ({ id: 'node-test', version: 1,
      kind: 'call', library: 'node:test', importName: 'node:test', entryKind: 'test', callPath, handlerArgument: 'last', nameArgument: 0 }));
    const expression = (source: string) => {
      const text = this.ts.createSourceFile('expression.ts', source, this.ts.ScriptTarget.Latest, true);
      const statement = text.statements[0];
      return statement && this.ts.isExpressionStatement(statement) && this.ts.isCallExpression(statement.expression)
        ? statement.expression : undefined;
    };
    const reviewed = expression(behavior.expression);
    const name = reviewed?.arguments[0];
    if (!name || !this.ts.isStringLiteralLike(name) || name.text !== member) return false;
    const { ts, program, checker } = this;
    return callCandidates({ ts, program, checker }, behavior.source.path, rules).some((candidate) => {
      const handler = candidate.handler;
      if (!handler || handler.path !== unit.path || candidate.name !== member ||
        expression(candidate.expression)?.expression.getText() !== reviewed.expression.getText()) return false;
      const contains = (lines: number[], range: typeof handler.range) =>
        Number(lines[0]) <= range[0].line && Number(lines[1]) >= range[1].line;
      return contains(behavior.source.lines, candidate.range) &&
        notes.some((note) => note.path === behavior.source.path && contains(note.lines, candidate.range)) && notes.some((note) => note.path === handler.path && contains(note.lines, handler.range)) &&
        this.callableHandler(unit, handler.range);
    });
  }

  private importRoute(node: TS.Node): string | undefined {
    const ts = this.ts;
    let base = node;
    while (ts.isPropertyAccessExpression(base) || ts.isElementAccessExpression(base) || ts.isQualifiedName(base))
      base = ts.isQualifiedName(base) ? base.left : base.expression;
    const name = this.checker.getSymbolAtLocation(base);
    for (const declaration of name?.declarations ?? []) {
      let ancestor: TS.Node | undefined = declaration;
      while (ancestor && !ts.isSourceFile(ancestor)) {
        if (ts.isImportDeclaration(ancestor) && ts.isStringLiteral(ancestor.moduleSpecifier)) return ancestor.moduleSpecifier.text;
        ancestor = ancestor.parent;
      }
    }
    return undefined;
  }

  private uses(location: Pick<BaselineSourceLocation, 'path' | 'lines'>, target: BoundaryUnit, kinds: BoundaryAccessKind[], member?: string, complete = false): BoundObservation[] {
    const file = this.file(location.path);
    const calls: BoundObservation[] = [];
    const visit = (node: TS.Node) => {
      if (kinds.includes('call') && this.ts.isCallExpression(node) && this.contains(file, node, location.lines)) {
        const callee = node.expression;
        const name = this.ts.isPropertyAccessExpression(callee) ? callee.name : callee;
        const symbol = this.checker.getSymbolAtLocation(name);
        const bound = this.declarationMatches(symbol, target, member);
        if (bound || complete && callee.kind !== this.ts.SyntaxKind.ImportKeyword && !this.concreteCallee(symbol)) {
          const { line, character } = file.getLineAndCharacterOfPosition(callee.getStart(file));
          calls.push({ kind: 'call', uncertain: !bound, position: { line: line + 1, column: character + 1 }, expression: callee.getText(file), route: this.importRoute(callee) });
        }
      }
      if (kinds.includes('type') && this.ts.isTypeReferenceNode(node) && this.contains(file, node, location.lines)) {
        const name = node.typeName;
        const symbol = this.checker.getSymbolAtLocation(this.ts.isQualifiedName(name) ? name.right : name);
        if (this.declarationMatches(symbol, target, member)) calls.push({ kind: 'type', expression: name.getText(file),
          route: this.importRoute(name), position: sourcePosition(file, name.getStart(file)) });
      }
      this.ts.forEachChild(node, visit);
    };
    visit(file);
    return calls;
  }

  private sitePlacement(caller: BoundaryUnit, node: TS.Node): 'yes' | 'shared' | 'no' {
    if (caller.unitKind === 'file') return 'yes';
    const divided = this.part(caller.path);
    const part = divided?.parts.find(({ part }) => part.unitKind === caller.unitKind &&
      (part.unitKind !== 'symbol' || part.symbol === caller.symbol));
    if (part?.dependencies.some((site) => site.node === node)) return 'yes';
    return divided?.fileDependencies.some((site) => site.node === node) ? 'shared' : 'no';
  }

  observations({ caller, target, member, kinds }: ObservationScope, complete = false): BoundObservation[] {
    const file = this.file(caller.path);
    const location = { path: caller.path, lines: [1, Infinity] };
    const observations = this.uses(location, target, kinds, member, complete).filter((site) => this.inUnit(caller, site.position));
    const edges = this.edgesByFile.get(caller.path) ?? [];
    for (const site of fileSites(this.ts, file)) {
      const route = site.site[1];
      if (!route) continue;
      const resolves = edges.some((edge) => edge.specifier === route && edge.to === target.path);
      const placement = this.sitePlacement(caller, site.node);
      if (placement === 'no') continue;
      for (const { kind, name } of loadingBindings(this.ts, site)) {
        if (!kinds.includes(kind)) continue;
        const symbol = name && this.checker.getSymbolAtLocation(name);
        const named = this.declarationMatches(symbol, target, member) ||
          Boolean(member?.includes('.') && this.declarationMatches(symbol, target, member.split('.')[0]));
        if (!resolves && !named) continue;
        const specific = member || target.unitKind !== 'file';
        const declarations = this.resolved(symbol)?.declarations;
        if (specific && name && !named && declarations?.length) continue;
        const uncertain = placement === 'shared' || Boolean(specific && !named);
        observations.push({ kind, position: sourcePosition(file, site.node.getStart(file)), route, expression: route, uncertain });
      }
    }
    return observations;
  }

  verifyCopy(source: BaselineSourceLocation, emitted: BaselineSourceLocation, proof: BaselineSourceLocation,
    target: BoundaryUnit, member: string): void {
    const emittedFile = this.file(emitted.path);
    const declaration = /(?:^|\s)\/\/[#@]\s*sourceMappingURL=([^\s]+)\s*$/.exec(emittedFile.text);
    assert(declaration?.[1] && sourceMapPath(emitted.path, declaration[1]) === proof.path,
      'The emitted source must link the exact source map: ' + emitted.path);
    const payload: unknown = JSON.parse(this.readSource(proof.path, sourceLimit).toString('utf8'));
    assert(object(payload) && payload.version === 3 && Array.isArray(payload.sources) && typeof payload.mappings === 'string' &&
      (!payload.file || posix.join(posix.dirname(proof.path), String(payload.file)) === emitted.path),
    'Invalid source map for emitted site: ' + proof.path);
    const map = new SourceMap(payload as unknown as SourceMapPayload);
    const original = this.uses(source, target, ['call'], member);
    const copies = this.uses(emitted, target, ['call'], member);
    assert(original.length === 1 && copies.length === 1 && copies.every(({ position }) => {
      const entry = map.findEntry(position.line - 1, position.column - 1);
      if (!('originalLine' in entry) || entry.generatedLine !== position.line - 1 || entry.generatedColumn !== position.column - 1)
        return false;
      const mapped = posix.normalize(posix.join(posix.dirname(proof.path), String(payload.sourceRoot ?? ''), entry.originalSource));
      return mapped === source.path && original[0]?.position.line === entry.originalLine + 1 &&
        original[0].position.column === entry.originalColumn + 1;
    }), 'The source map must link the exact source and emitted call sites.');
  }

  check(access: BoundaryAccess, location: BaselineSourceLocation, caller: BoundaryUnit, target: BoundaryUnit | undefined): void {
    const file = this.file(location.path);
    const edges = this.edgesByFile.get(location.path) ?? [];
    if (access.kind === 'call') {
      if (!target || !access.member) return;
      const calls = this.uses(location, target, ['call'], access.member);
      assert(calls.length === 0 || calls.every((call) => this.inUnit(caller, call.position)), 'The bound call belongs to a different mapped caller part: ' + access.id);
      assert(calls.length > 0, 'No bound call to the recorded member at the cited site: ' + access.id);
      assert(calls.some((call) => call.expression === access.writtenPath || call.route === access.writtenPath),
        'The bound call has no such written path: ' + access.id);
      return;
    }
    if (target && access.member) {
      const matches = this.observations({ caller, target, kinds: [access.kind], member: access.member }).filter((site) =>
        !site.uncertain && site.position.line >= Number(location.lines[0]) && site.position.line <= Number(location.lines[1]) &&
        (site.expression === access.writtenPath || site.route === access.writtenPath));
      assert(matches.length, 'The written path or selected member has no bound source site: ' + access.id);
      return;
    }
    const sites = fileSites(this.ts, file).filter(({ node }) => this.contains(file, node, location.lines));
    const kinds: Record<string, readonly string[]> = { import: ['import', 'import-equals'], type: ['import', 'import-type', 're-export'],
      're-export': ['re-export'], 'dynamic-import': ['dynamic-import'], require: ['require-candidate', 'import-equals'] };
    const written = sites.filter(({ site: [kind, specifier], node }) => kinds[access.kind]?.includes(kind) &&
      (specifier === access.writtenPath || specifier === null && this.ts.isCallExpression(node) &&
        node.arguments[0]?.getText(file) === access.writtenPath));
    assert(written.length > 0, 'The cited source does not use this written path and access kind: ' + access.id);
    const parts = this.part(caller.path);
    if (parts) {
      const part = parts.parts.find(({ part }) => part.unitKind === caller.unitKind &&
        (part.unitKind !== 'symbol' || part.symbol === caller.symbol));
      assert(part && written.every((site) => part.dependencies.some((dependency) => dependency.node === site.node)),
        'The import has no unique binding to this mapped caller part: ' + access.id);
    }
    if (target) assert(edges.some((edge) => edge.specifier === access.writtenPath && edge.to === target.path),
      'The written path does not resolve to the recorded unit in this context: ' + access.id);
  }
}

export function sourceForRoot(path: string, root: string): boolean {
  return root === '.' || path === root || path.startsWith(root.replace(/\/$/, '') + '/');
}

export function sourceMapPath(emittedPath: string, url: string): string {
  return posix.normalize(posix.join(posix.dirname(emittedPath), url));
}

export function graphContexts(graph: Fields): BoundaryGraphContext[] {
  return graph.contexts as BoundaryGraphContext[];
}
