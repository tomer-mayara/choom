import type * as TsMorph from 'ts-morph';
import { argumentAt, type Located, located, type Named, nameOf, ruleCalls, rulePath, type RuleQuery, typeRulePath, type ValuePath }
  from './call-rules.ts';
import type { ResourceAccessRule } from './generated/contracts.ts';
import { nodeRange } from './snapshot-exports.ts';
import type { SourceRange } from './snapshot-references.ts';

// The resource access rules on a snapshot project. A rule finds a call whose callee is
// its call path on the value of its import, such as db('invoices').insert(row) after
// const db = knex(config): the receiver comes from the import (receiver-import). A rule
// with a type path also finds that call written from a value whose declared type the
// import gives, such as a parameter db: Knex (receiver-type). The value paths of the
// import and of its types come from call-rules.ts. The name of the resource is the
// argument at nameArgument of the call at nameCall, counted back from the call that
// the rule finds: 0 for that call, 1 for the last call of the call path. That call
// can be in the initializer of a variable that holds the value, as the value path
// follows it. A literal name is its text; any other name is null with a reason. A
// name does not show which resource the call uses: two calls with the same table
// name need not use the same table. The context of a call is the function or the
// method that holds it in the source, or the module: it is not a runtime trace.
type Ts = typeof TsMorph.ts;
type Node = TsMorph.ts.Node;
type Call = TsMorph.ts.CallExpression | TsMorph.ts.NewExpression;
export type Confidence = 'receiver-import' | 'receiver-type';
// The function or the method that holds a site in the source, with its name and range, or the module.
export interface SourceContext { kind: 'function' | 'method' | 'module'; name: string | null; range: SourceRange | null }
// A call that a rule finds: the rule, how its receiver was matched, the site, the name and the context.
export interface AccessMatch extends Located, Named {
  call: Call; rule: ResourceAccessRule; confidence: Confidence; context: SourceContext;
}

// The contract requires a name argument, so a rule always names one.
const noName = 'The rule names no name argument.';

// The text of the name of a declaration: a name, a string, a number or a private name.
function nameText(ts: Ts, name: Node | undefined): string | null {
  return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ||
    ts.isPrivateIdentifier(name)) ? name.text : null;
}

// The name of a function or a method as the source declares it. A function without
// a name takes the name of the variable or the property whose value it is. A member
// of a class with a name has the class name first.
function holderName(ts: Ts, holder: TsMorph.ts.FunctionLikeDeclaration): string | null {
  const parent = holder.parent;
  const valueOf = holder.name === undefined && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) ||
    ts.isPropertyDeclaration(parent)) && parent.initializer === holder;
  const declaration: TsMorph.ts.NamedDeclaration = valueOf ? parent as TsMorph.ts.NamedDeclaration : holder;
  const name = ts.isConstructorDeclaration(declaration) ? 'constructor' : nameText(ts, declaration.name);
  const owner = declaration.parent;
  const className = (ts.isClassDeclaration(owner) || ts.isClassExpression(owner)) ? owner.name?.text : undefined;
  return name !== null && className !== undefined ? className + '.' + name : name;
}

// The function or the method that holds a node, or the module when none holds it,
// such as a call at the top level or in a class field outside any function.
export function sourceContext(ts: Ts, node: Node): SourceContext {
  for (let holder = node.parent; holder !== undefined; holder = holder.parent) {
    const kind = ts.isMethodDeclaration(holder) || ts.isConstructorDeclaration(holder) || ts.isGetAccessorDeclaration(holder) ||
      ts.isSetAccessorDeclaration(holder) ? 'method'
      : ts.isFunctionDeclaration(holder) || ts.isFunctionExpression(holder) || ts.isArrowFunction(holder) ? 'function' : undefined;
    if (kind !== undefined) return { kind, name: holderName(ts, holder as TsMorph.ts.FunctionLikeDeclaration),
      range: nodeRange(holder.getSourceFile(), holder) };
  }
  return { kind: 'module', name: null, range: null };
}

// The call that holds the name: the call that the rule finds, or a call of the value path, counted back.
function nameHolder(call: Call, value: ValuePath, rule: ResourceAccessRule): Call | undefined {
  return rule.nameCall === 0 ? call : value.calls[value.calls.length - rule.nameCall] as Call | undefined;
}

// The calls of the rules in one file that the project holds, in source order and then in the order of the rules.
export function accessMatches(query: RuleQuery, path: string, rules: readonly ResourceAccessRule[]): AccessMatch[] {
  const { ts } = query;
  const entries = rules.flatMap(rule => [{ rule, path: rulePath(rule.importName, rule.callPath), confidence: 'receiver-import' as const },
    ...rule.typePath === null ? [] : [{ rule, path: typeRulePath(rule.importName, rule.typePath, rule.callPath),
      confidence: 'receiver-type' as const }]]);
  return ruleCalls(query, path, entries).map(({ call, entry: { rule, confidence }, value }) => {
    const holder = nameHolder(call, value, rule);
    const name = nameOf(ts, argumentAt(ts, holder?.arguments ?? [], rule.nameArgument, null), noName);
    return { call, rule, confidence, ...located(call.getSourceFile(), call), ...name, context: sourceContext(ts, call) };
  });
}
