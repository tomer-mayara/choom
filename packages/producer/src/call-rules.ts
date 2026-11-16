import type * as TsMorph from 'ts-morph';
import { callPathParts } from './rule-lists.ts';
import { nodeRange } from './snapshot-exports.ts';
import { virtualRoot } from './snapshot-project.ts';
import type { Checking, SourceRange } from './snapshot-references.ts';

// The parts that the call rules of the behavior entry rules and the resource access
// rules share: the value paths of a snapshot project, which the rules compare with
// their call paths, the located call sites, and the names in call arguments. A value path
// names the module of an import and the steps from the value of the module. The type
// checker follows each local name to that import: a default, named, renamed or
// namespace import, import = and require, a variable that holds a value of the
// import or a part of it, and the imports and exports of other snapshot files. It
// does not follow a function parameter. The default export, a namespace import and
// require of a module are one value, as they are for a CommonJS package.
type Ts = typeof TsMorph.ts;
type Node = TsMorph.ts.Node;
type TsSymbol = TsMorph.ts.Symbol;
// A value of an import: the module name and the steps from the value of the module,
// each .name for a property, () for a call and new() for a new call.
export interface ValuePath { module: string; steps: string[] }
// The callee path of a rule, and whether the rule finds a new call.
export interface RulePath extends ValuePath { newCall: boolean }
// The range of a node of a file, and its text up to the expression limit.
export interface Located { range: SourceRange; expression: string; truncated: boolean }
// An argument of a call: none when the rule names no argument, spread when a spread
// argument comes at or before it, missing when the call does not have it, or its node.
export type Argument = { kind: 'none' | 'missing' | 'spread' } | { kind: 'node'; node: TsMorph.ts.Expression };
// A name: the text of a literal, or null with the reason.
export interface Named { name: string | null; nameReason: string | null }

const expressionLimit = 4096;
// A local name can lead through other names to the import. The walk stops after this many steps.
const depthLimit = 64;
const nameReasons = {
  spread: 'A spread argument comes at or before the name argument, so the rule cannot tell which value is the name.',
  missing: 'The call has no argument at the name position.',
  template: 'The name argument is a template literal with substitutions, so the name is known only at run time.',
  computed: 'The name argument is not a string literal, so the name is known only at run time.',
};

export const snapshotSource = (fileName: string): boolean => fileName.startsWith(virtualRoot + '/') &&
  !fileName.includes('/node_modules/');
const inSnapshot = (symbol: TsSymbol | undefined): boolean => (symbol?.declarations ?? []).length > 0 &&
  (symbol?.declarations ?? []).every(item => snapshotSource(item.getSourceFile().fileName));
export const samePath = (left: ValuePath, right: ValuePath): boolean => left.module === right.module &&
  left.steps.length === right.steps.length && left.steps.every((part, index) => part === right.steps[index]);

// Adds a step to a value path. The default export of a module is the value of the module.
function step(path: ValuePath, next: string): ValuePath {
  return next === '.default' && path.steps.length === 0 ? path : { module: path.module, steps: [...path.steps, next] };
}

// The callee path of a rule: its call path from the value of its import. The first name of the path is
// importName itself for the value of the module, and otherwise the name of an export of the module.
export function rulePath(importName: string, callPath: string): RulePath {
  const { head, steps, newCall } = callPathParts(callPath);
  const module = { module: importName, steps: [] };
  const path = steps.reduce(step, head === importName ? module : step(module, '.' + head));
  return { ...path, newCall };
}

// The expression inside parentheses and type or non-null assertions.
export function unwrapped(ts: Ts, node: Node): Node {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) || ts.isTypeAssertionExpression(current)) current = current.expression;
  return current;
}

// The range of a node of a file, and its text up to the expression limit.
export function located(source: TsMorph.ts.SourceFile, node: Node): Located {
  const text = node.getText(source);
  return { range: nodeRange(source, node), expression: text.slice(0, expressionLimit), truncated: text.length > expressionLimit };
}

// The object and the name of a property access, or of an element access with a string literal.
export function member(ts: Ts, node: Node): { object: Node; name: Node & { text: string } } | undefined {
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
export function propertyName(ts: Ts, element: TsMorph.ts.BindingElement): { text: string } | undefined {
  const property = element.propertyName ?? element.name;
  return ts.isObjectBindingPattern(element.parent) && (ts.isIdentifier(property) || ts.isStringLiteral(property)) ? property : undefined;
}

// The value of a symbol: an import binding, after the imports and exports of snapshot
// files one alias at a time, so that an import or re-export of a package keeps its
// module name; or the value of a variable or a default export.
function symbolPath(query: Checking, symbol: TsSymbol | undefined, depth: number): ValuePath | undefined {
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
export function valuePath(query: Checking, node: Node, depth = 0): ValuePath | undefined {
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

// The argument at a position. The last argument must come after the name argument.
export function argumentAt(ts: Ts, args: readonly TsMorph.ts.Expression[], position: number | 'last' | null,
  after: number | null): Argument {
  if (position === null) return { kind: 'none' };
  const index = position === 'last' ? args.length - 1 : position;
  // A spread argument hides the positions of the arguments after it.
  const spread = args.findIndex(item => ts.isSpreadElement(item));
  if (spread >= 0 && (position === 'last' || spread <= index)) return { kind: 'spread' };
  const node = args[index];
  return node === undefined || (position === 'last' && after !== null && index <= after) ? { kind: 'missing' } : { kind: 'node', node };
}

// The text of a string literal or of a template literal without substitutions. Any
// other name is null with a reason; `none` is the reason when the rule names no argument.
export function nameOf(ts: Ts, argument: Argument, none: string): Named {
  if (argument.kind === 'none') return { name: null, nameReason: none };
  if (argument.kind !== 'node') return { name: null, nameReason: nameReasons[argument.kind] };
  const value = unwrapped(ts, argument.node);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return { name: value.text, nameReason: null };
  return { name: null, nameReason: ts.isTemplateExpression(value) ? nameReasons.template : nameReasons.computed };
}
