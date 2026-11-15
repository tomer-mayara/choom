import type * as TsMorph from 'ts-morph';
import { type EntryCandidate, type EntryQuery, located, unwrapped } from './behavior-entry-calls.ts';
import type { BehaviorEntrySettingsLiteralRule } from './generated/contracts.ts';
import { assert } from './record-checks.ts';
import { virtualRoot } from './snapshot-project.ts';
import type { Picomatch } from './stage-4-graph-profile.ts';

// The settings-literal rules of the behavior entry rules on a snapshot project. A rule
// reads the settings object of a source file that matches its glob: the value of
// export default, export = or the last module.exports = assignment. That value is an
// object literal, a call with one argument such as defineConfig({ ... }), or a name
// of a const declaration of the file that holds one of them. The rule follows its
// property path through object literals. Each string literal at the end of the path,
// in an array there or as a property of an object there, is a candidate. The snapshot
// project reads the file; nothing runs it. Any other value is a gap with a reason.
type Ts = typeof TsMorph.ts;
type Node = TsMorph.ts.Node;
type ObjectLiteral = TsMorph.ts.ObjectLiteralExpression;
export interface SettingsGap extends Pick<EntryCandidate, 'ruleId' | 'ruleVersion' | 'entryKind' | 'range' | 'expression' | 'truncated'> {
  kind: 'unknown-settings-value'; reason: string;
}
export interface SettingsFindings { candidates: EntryCandidate[]; gaps: SettingsGap[] }
// The settings-literal rules that apply to a file, by the glob of each rule.
export interface SettingsRules { forFile(path: string): BehaviorEntrySettingsLiteralRule[] }
// A node that the rule cannot read, and why.
interface Unread { node: Node; reason: string }

const depthLimit = 64;
const noHandler = 'A settings-literal rule finds a settings entry, which has no handler.';
const reasons = {
  computedValue: 'The value at the property path is not a string literal, so it is known only at run time.',
  computedObject: 'The settings object or an object on the property path is not an object literal, so the rule cannot read ' +
    'the property path without running the file.',
  dynamicProperty: 'An object on the property path has a spread or a computed property name, so the value can come from code ' +
    'that runs.',
  noSettings: 'The file has no export default, export = or module.exports assignment, so the rule cannot find its settings object.',
};

const stringLiteral = (ts: Ts, node: Node): node is TsMorph.ts.StringLiteralLike =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

// Compiles the glob of each rule once. A glob matches snapshot-relative paths, with dot files.
export function settingsRules(rules: readonly BehaviorEntrySettingsLiteralRule[], picomatch: Picomatch): SettingsRules {
  const matchers = rules.map(rule => ({ rule, matches: picomatch(rule.fileGlob, { dot: true }) }));
  return { forFile: path => matchers.filter(({ matches }) => matches(path)).map(({ rule }) => rule) };
}

// The value that the file exports as its settings: export default, export =, or the last module.exports = assignment.
function settingsValue(ts: Ts, source: TsMorph.ts.SourceFile): Node | undefined {
  let value: Node | undefined;
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) value = statement.expression;
    const assigned = ts.isExpressionStatement(statement) ? statement.expression : undefined;
    if (assigned !== undefined && ts.isBinaryExpression(assigned) && assigned.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(assigned.left) && ts.isIdentifier(assigned.left.expression) &&
      assigned.left.expression.text === 'module' && assigned.left.name.text === 'exports') value = assigned.right;
  }
  return value;
}

// The object literal of a value: the value itself, the argument of a call with one
// argument, or the value of a const declaration of the same file. Otherwise the node that is not one.
function objectOf({ ts, checker }: EntryQuery, node: Node): ObjectLiteral | Unread {
  let value = unwrapped(ts, node);
  for (let depth = 0; depth < depthLimit && !ts.isObjectLiteralExpression(value); depth++) {
    const declaration = ts.isIdentifier(value) ? checker.getSymbolAtLocation(value)?.valueDeclaration : undefined;
    const constant = declaration !== undefined && ts.isVariableDeclaration(declaration) &&
      declaration.getSourceFile() === value.getSourceFile() && (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;
    const next = ts.isCallExpression(value) && value.arguments.length === 1 ? value.arguments[0]
      : constant ? declaration.initializer : undefined;
    if (next === undefined) break;
    value = unwrapped(ts, next);
  }
  return ts.isObjectLiteralExpression(value) ? value : { node: value, reason: reasons.computedObject };
}

// The value of the last property with the name, dynamic when a spread or a computed
// property name comes after it or there is no such property, or undefined when the object has no such property.
function propertyValue(ts: Ts, object: ObjectLiteral, name: string): Node | 'dynamic' | undefined {
  let value: Node | undefined;
  let dynamic = false;
  for (const item of object.properties) {
    if (ts.isSpreadAssignment(item) || (item.name !== undefined && ts.isComputedPropertyName(item.name))) dynamic = true;
    else if (item.name !== undefined && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name) ||
      ts.isNumericLiteral(item.name)) && item.name.text === name) {
      dynamic = false;
      value = ts.isPropertyAssignment(item) ? item.initializer : ts.isShorthandPropertyAssignment(item) ? item.name : item;
    }
  }
  return dynamic ? 'dynamic' : value;
}

// The value at the end of the property path, a node that the rule cannot read, or undefined when the path is absent.
function valueAt(query: EntryQuery, root: ObjectLiteral, path: string[]): { value: Node } | Unread | undefined {
  let object = root;
  for (const [index, name] of path.entries()) {
    const value = propertyValue(query.ts, object, name);
    if (value === 'dynamic') return { node: object, reason: reasons.dynamicProperty };
    if (value === undefined || index === path.length - 1) return value === undefined ? undefined : { value };
    const next = objectOf(query, value);
    if ('reason' in next) return next;
    object = next;
  }
  return undefined;
}

// The string literals of a value: the value itself, the elements of an array, or the
// property values of an object. Each other part is a node that the rule cannot read.
function literalsOf(ts: Ts, node: Node): (TsMorph.ts.StringLiteralLike | Unread)[] {
  const value = unwrapped(ts, node);
  const literal = (part: Node): TsMorph.ts.StringLiteralLike | Unread => {
    const inner = unwrapped(ts, part);
    return stringLiteral(ts, inner) ? inner : { node: part, reason: reasons.computedValue };
  };
  if (ts.isArrayLiteralExpression(value)) return value.elements.map(literal);
  if (!ts.isObjectLiteralExpression(value)) return [literal(value)];
  return value.properties.map(item => ts.isPropertyAssignment(item) && !ts.isComputedPropertyName(item.name) ? literal(item.initializer)
    : { node: item, reason: ts.isSpreadAssignment(item) || ts.isComputedPropertyName(item.name) ? reasons.dynamicProperty
      : reasons.computedValue });
}

// The candidates and the gaps of the settings-literal rules of one file that the project holds.
export function settingsCandidates(query: EntryQuery, path: string, rules: SettingsRules): SettingsFindings {
  const { ts, program } = query;
  const findings: SettingsFindings = { candidates: [], gaps: [] };
  const applicable = rules.forFile(path);
  if (!applicable.length) return findings;
  const source = program.getSourceFile(virtualRoot + '/' + path);
  assert(source, 'The program of the query does not hold ' + path + '.');
  const exported = settingsValue(ts, source);
  for (const rule of applicable) {
    const identity = { ruleId: rule.id, ruleVersion: rule.version, entryKind: rule.entryKind };
    const root = exported === undefined ? { node: source, reason: reasons.noSettings } : objectOf(query, exported);
    const end = 'reason' in root ? root : valueAt(query, root, rule.propertyPath.split('.'));
    const parts = end === undefined ? [] : 'reason' in end ? [end] : literalsOf(ts, end.value);
    for (const part of parts) {
      if ('reason' in part) findings.gaps.push({ kind: 'unknown-settings-value', ...identity, ...located(source, part.node),
        reason: part.reason });
      else findings.candidates.push({ ...identity, ...located(source, part), name: part.text, nameReason: null, handler: null,
        handlerReason: noHandler });
    }
  }
  return findings;
}
