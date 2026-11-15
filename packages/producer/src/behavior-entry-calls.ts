import type * as TsMorph from 'ts-morph';
import type { BehaviorEntryCallRule } from './generated/contracts.ts';
import { assert } from './record-checks.ts';
import { nodeRange } from './snapshot-exports.ts';
import { type SnapshotProject, snapshotPath, virtualRoot } from './snapshot-project.ts';
import { type Checking, declared, referenceProgram, type SourceRange } from './snapshot-references.ts';

// The call rules of the behavior entry rules on a snapshot project. A rule finds a
// call whose callee is its call path on the value of its import, such as app.get
// after const app = express(). The type checker follows each local name to that
// import: a default, named, renamed or namespace import, import = and require, a
// variable that holds a value of the import or a part of it, and the imports and
// exports of other snapshot files. It does not follow a function parameter. The
// default export, a namespace import and require of a module are one value, as they
// are for a CommonJS package. The name and the handler are arguments of the call.
type Ts = typeof TsMorph.ts;
type Node = TsMorph.ts.Node;
type TsSymbol = TsMorph.ts.Symbol;
export interface EntryQuery extends Checking { program: TsMorph.ts.Program }
// A located declaration or function of the snapshot.
export interface SourceSite { path: string; range: SourceRange }
export interface CallCandidate {
  ruleId: string; ruleVersion: number; entryKind: string; range: SourceRange; expression: string; truncated: boolean;
  name: string | null; nameReason: string | null; handler: SourceSite | null; handlerReason: string | null;
}
// A value of an import: the module name and the steps from the value of the module,
// each .name for a property, () for a call and new() for a new call.
interface ValuePath { module: string; steps: string[] }
// The callee path of a rule, and whether the rule finds a new call.
interface RulePath extends ValuePath { newCall: boolean }
type Argument = { kind: 'none' | 'missing' | 'spread' } | { kind: 'node'; node: TsMorph.ts.Expression };
type Named = Pick<CallCandidate, 'name' | 'nameReason'>;
type Handled = Pick<CallCandidate, 'handler' | 'handlerReason'>;

const expressionLimit = 4096;
// A local name can lead through other names to the import. The walk stops after this many steps.
const depthLimit = 64;
const reasons = {
  noName: 'The rule names no name argument.',
  nameSpread: 'A spread argument comes at or before the name argument, so the rule cannot tell which value is the name.',
  template: 'The name argument is a template literal with substitutions, so the name is known only at run time.',
  computed: 'The name argument is not a string literal, so the name is known only at run time.',
  noHandler: 'The rule names no handler argument.',
  handlerSpread: 'A spread argument comes at or before the handler argument, so the rule cannot tell which value is the handler.',
  otherHandler: 'The handler argument is not a function or a name, so the rule does not follow the value that it gives.',
  unresolved: 'The type checker does not resolve the handler to a declaration.',
  package: 'The handler is an import that the type checker does not resolve to a snapshot file.',
  parameter: 'The handler is a parameter, so its value comes from a caller.',
  outside: 'The handler is declared outside the snapshot source.',
};

const snapshotSource = (fileName: string): boolean => fileName.startsWith(virtualRoot + '/') && !fileName.includes('/node_modules/');
const inSnapshot = (symbol: TsSymbol | undefined): boolean => (symbol?.declarations ?? []).length > 0 &&
  (symbol?.declarations ?? []).every(item => snapshotSource(item.getSourceFile().fileName));
const samePath = (left: ValuePath, right: ValuePath): boolean => left.module === right.module &&
  left.steps.length === right.steps.length && left.steps.every((part, index) => part === right.steps[index]);

// Adds a step to a value path. The default export of a module is the value of the module.
function step(path: ValuePath, next: string): ValuePath {
  return next === '.default' && path.steps.length === 0 ? path : { module: path.module, steps: [...path.steps, next] };
}

// The callee path of a rule. With new at the start, the first () is a new call; without a (), the rule finds a new call.
function rulePath(rule: BehaviorEntryCallRule): RulePath {
  const [, start, head = '', rest = ''] = /^(new )?([A-Za-z_$][A-Za-z0-9_$]*)(.*)$/.exec(rule.callPath) ?? [];
  const module = { module: rule.importName, steps: [] };
  let path = head === rule.importName ? module : step(module, '.' + head);
  let newCall = start !== undefined;
  for (const token of rest.match(/\(\)|\.[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
    path = step(path, token === '()' && newCall ? 'new()' : token);
    if (token === '()') newCall = false;
  }
  return { ...path, newCall };
}

// The expression inside parentheses and type or non-null assertions.
function unwrapped(ts: Ts, node: Node): Node {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) || ts.isTypeAssertionExpression(current)) current = current.expression;
  return current;
}

// The object and the name of a property access, or of an element access with a string literal.
function member(ts: Ts, node: Node): { object: Node; name: Node & { text: string } } | undefined {
  if (ts.isPropertyAccessExpression(node)) return { object: node.expression, name: node.name };
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
    return { object: node.expression, name: node.argumentExpression };
  return undefined;
}

// The module of a require call with a string literal, when no snapshot file declares require.
function requiredModule({ ts, checker }: Checking, node: Node): string | undefined {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 'require') return undefined;
  const [name] = node.arguments;
  if (node.arguments.length !== 1 || name === undefined || !ts.isStringLiteralLike(name)) return undefined;
  return inSnapshot(checker.getSymbolAtLocation(node.expression)) ? undefined : name.text;
}

// The value that an import, a re-export or a JavaScript require gives: its module and the export that it names.
function importBinding(query: Checking, declaration: Node | undefined): ValuePath | undefined {
  const { ts } = query;
  const from = (specifier: Node | undefined): ValuePath | undefined =>
    specifier !== undefined && ts.isStringLiteralLike(specifier) ? { module: specifier.text, steps: [] } : undefined;
  const exported = (base: ValuePath | undefined, name: { text: string }): ValuePath | undefined => base && step(base, '.' + name.text);
  if (declaration === undefined) return undefined;
  if (ts.isImportClause(declaration)) return from(declaration.parent.moduleSpecifier);
  if (ts.isNamespaceImport(declaration)) return from(declaration.parent.parent.moduleSpecifier);
  if (ts.isImportSpecifier(declaration))
    return exported(from(declaration.parent.parent.parent.moduleSpecifier), declaration.propertyName ?? declaration.name);
  if (ts.isExportSpecifier(declaration))
    return exported(from(declaration.parent.parent.moduleSpecifier), declaration.propertyName ?? declaration.name);
  if (ts.isNamespaceExport(declaration)) return from(declaration.parent.moduleSpecifier);
  if (ts.isImportEqualsDeclaration(declaration))
    return ts.isExternalModuleReference(declaration.moduleReference) ? from(declaration.moduleReference.expression) : undefined;
  const loaded = (node: Node | undefined): ValuePath | undefined => {
    const module = node === undefined ? undefined : requiredModule(query, node);
    return module === undefined ? undefined : { module, steps: [] };
  };
  if (ts.isVariableDeclaration(declaration)) return loaded(declaration.initializer);
  const holder = declaration.parent?.parent;
  const name = ts.isBindingElement(declaration) ? propertyName(ts, declaration) : undefined;
  return name !== undefined && holder !== undefined && ts.isVariableDeclaration(holder)
    ? exported(loaded(holder.initializer), name) : undefined;
}

// The property that an element of an object binding pattern takes.
function propertyName(ts: Ts, element: TsMorph.ts.BindingElement): { text: string } | undefined {
  const property = element.propertyName ?? element.name;
  return ts.isObjectBindingPattern(element.parent) && (ts.isIdentifier(property) || ts.isStringLiteral(property)) ? property : undefined;
}

// The value of a symbol: an import binding, after the imports and exports of snapshot
// files one alias at a time, so that an import or re-export of a package keeps its
// module name; or the value of a variable or a default export.
function symbolPath(query: EntryQuery, symbol: TsSymbol | undefined, depth: number): ValuePath | undefined {
  const { ts, checker } = query;
  if (symbol === undefined || depth > depthLimit) return undefined;
  if (symbol.flags & ts.SymbolFlags.Alias) {
    const next = checker.getImmediateAliasedSymbol(symbol);
    return inSnapshot(next) ? symbolPath(query, next, depth + 1) : importBinding(query, symbol.declarations?.[0]);
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration !== undefined && ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name))
    return declaration.initializer === undefined ? undefined : valuePath(query, declaration.initializer, depth + 1);
  if (declaration !== undefined && ts.isExportAssignment(declaration)) return valuePath(query, declaration.expression, depth + 1);
  if (declaration === undefined || !ts.isBindingElement(declaration)) return undefined;
  const holder = declaration.parent.parent;
  const name = propertyName(ts, declaration);
  const base = ts.isVariableDeclaration(holder) && holder.initializer !== undefined && name !== undefined
    ? valuePath(query, holder.initializer, depth + 1) : undefined;
  return base && name && step(base, '.' + name.text);
}

// The value of an expression of the import, or undefined when it does not come from an import.
function valuePath(query: EntryQuery, node: Node, depth: number): ValuePath | undefined {
  const { ts, checker } = query;
  const expression = unwrapped(ts, node);
  if (depth > depthLimit) return undefined;
  if (ts.isIdentifier(expression)) return symbolPath(query, checker.getSymbolAtLocation(expression), depth + 1);
  const property = member(ts, expression);
  const loaded = requiredModule(query, expression);
  if (loaded !== undefined) return { module: loaded, steps: [] };
  const base = property?.object ?? (ts.isCallExpression(expression) || ts.isNewExpression(expression) ? expression.expression : undefined);
  const value = base === undefined ? undefined : valuePath(query, base, depth + 1);
  if (value === undefined) return undefined;
  return step(value, property !== undefined ? '.' + property.name.text : ts.isNewExpression(expression) ? 'new()' : '()');
}

// The argument at a position: none when the rule names no argument, spread when a
// spread argument comes at or before it, and missing when the call does not have it.
// The last argument must come after the name argument.
function argumentAt(ts: Ts, args: readonly TsMorph.ts.Expression[], position: number | 'last' | null,
  after: number | null): Argument {
  if (position === null) return { kind: 'none' };
  const index = position === 'last' ? args.length - 1 : position;
  // A spread argument hides the positions of the arguments after it.
  const spread = args.findIndex(item => ts.isSpreadElement(item));
  if (spread >= 0 && (position === 'last' || spread <= index)) return { kind: 'spread' };
  const node = args[index];
  return node === undefined || (position === 'last' && after !== null && index <= after) ? { kind: 'missing' } : { kind: 'node', node };
}

function nameOf(ts: Ts, argument: Argument): Named {
  if (argument.kind !== 'node') return { name: null, nameReason: argument.kind === 'none' ? reasons.noName : reasons.nameSpread };
  const value = unwrapped(ts, argument.node);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return { name: value.text, nameReason: null };
  return { name: null, nameReason: ts.isTemplateExpression(value) ? reasons.template : reasons.computed };
}

// A destructuring that takes a value from a module object names the declaration of
// that export, as the Stage 4 references action follows it.
function destructuredDeclaration(query: Checking, declaration: Node | undefined): Node | undefined {
  const { ts, checker } = query;
  if (declaration === undefined || !ts.isBindingElement(declaration)) return declaration;
  const name = propertyName(ts, declaration);
  const taken = name === undefined ? undefined : checker.getPropertyOfType(checker.getTypeAtLocation(declaration.parent), name.text);
  const target = declared(query, taken);
  return target?.valueDeclaration ?? target?.declarations?.[0] ?? declaration;
}

// The declaration that a handler name names after its aliases, as the Stage 4 references action follows them.
function declarationOf(query: Checking, name: Node): Handled {
  const { ts, checker } = query;
  const symbol = checker.getSymbolAtLocation(name);
  const target = declared(query, symbol);
  const declaration = destructuredDeclaration(query, target?.valueDeclaration ?? target?.declarations?.[0]);
  if (declaration === undefined)
    return { handler: null, handlerReason: (symbol?.flags ?? 0) & ts.SymbolFlags.Alias ? reasons.package : reasons.unresolved };
  if (ts.isParameter(declaration)) return { handler: null, handlerReason: reasons.parameter };
  const file = declaration.getSourceFile();
  if (!snapshotSource(file.fileName)) return { handler: null, handlerReason: reasons.outside };
  return { handler: { path: snapshotPath(file.fileName), range: nodeRange(file, declaration) }, handlerReason: null };
}

function handlerOf(query: Checking, source: TsMorph.ts.SourceFile, argument: Argument): Handled {
  const { ts } = query;
  if (argument.kind !== 'node') return { handler: null, handlerReason: argument.kind === 'none' ? reasons.noHandler : reasons.handlerSpread };
  const value = unwrapped(ts, argument.node);
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
    return { handler: { path: snapshotPath(source.fileName), range: nodeRange(source, value) }, handlerReason: null };
  const name = ts.isIdentifier(value) ? value : member(ts, value)?.name;
  return name === undefined ? { handler: null, handlerReason: reasons.otherHandler } : declarationOf(query, name);
}

function candidateOf(query: EntryQuery, source: TsMorph.ts.SourceFile, call: TsMorph.ts.CallExpression | TsMorph.ts.NewExpression,
  rule: BehaviorEntryCallRule): CallCandidate | undefined {
  const args = call.arguments ?? [];
  const name = argumentAt(query.ts, args, rule.nameArgument, null);
  const handler = argumentAt(query.ts, args, rule.handlerArgument, rule.nameArgument);
  if (name.kind === 'missing' || handler.kind === 'missing') return undefined;
  const text = call.getText(source);
  return { ruleId: rule.id, ruleVersion: rule.version, entryKind: rule.entryKind, range: nodeRange(source, call),
    expression: text.slice(0, expressionLimit), truncated: text.length > expressionLimit, ...nameOf(query.ts, name),
    ...handlerOf(query, source, handler) };
}

// The program and the type checker of the files that the project holds.
export function entryQuery(project: SnapshotProject): EntryQuery {
  const program = referenceProgram(project);
  return { ts: project.ts, checker: program.getTypeChecker(), program };
}

// The candidates of the call rules in one file that the project holds, in source order.
export function callCandidates(query: EntryQuery, path: string, rules: readonly BehaviorEntryCallRule[]): CallCandidate[] {
  const { ts, program } = query;
  const source = program.getSourceFile(virtualRoot + '/' + path);
  assert(source, 'The program of the query does not hold ' + path + '.');
  const paths = rules.map(rule => ({ rule, path: rulePath(rule) }));
  const found: CallCandidate[] = [];
  const visit = (node: Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      // The property name of the callee must be the last name of the rule. Any other callee can be a renamed import.
      const property = member(ts, unwrapped(ts, node.expression))?.name.text;
      const applicable = paths.filter(({ path }) => path.newCall === ts.isNewExpression(node) &&
        (property === undefined || property === 'default' || path.steps.at(-1) === '.' + property));
      const value = applicable.length ? valuePath(query, node.expression, 0) : undefined;
      for (const { rule, path } of applicable) {
        const candidate = value !== undefined && samePath(path, value) ? candidateOf(query, source, node, rule) : undefined;
        if (candidate !== undefined) found.push(candidate);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
