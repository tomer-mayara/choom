import type * as TsMorph from 'ts-morph';
import { type Argument, argumentAt, located, member, nameCallOf, nameOf, propertyName, type RuleCall, ruleCalls, rulePath,
  type RuleQuery, snapshotSource, unwrapped } from './call-rules.ts';
import type { BehaviorEntryCallRule } from './generated/contracts.ts';
import { nodeRange } from './snapshot-exports.ts';
import { type SnapshotProject, snapshotPath } from './snapshot-project.ts';
import { type Checking, declared, referenceProgram, type SourceRange } from './snapshot-references.ts';

// The call rules of the behavior entry rules on a snapshot project. A rule finds a
// call whose callee is its call path on the value of its import, such as app.get
// after const app = express(), and passes the calls of its same value methods, such
// as description in program.command('serve').description('Start').action(serve). The
// value paths of the import, and the names, come from call-rules.ts. The handler is an
// argument of the call. The name is an argument of the call at the name call of the
// rule: the call itself, or a call of its call path, such as command for action.
type Node = TsMorph.ts.Node;
export type EntryQuery = RuleQuery;
// A located declaration or function of the snapshot.
export interface SourceSite { path: string; range: SourceRange }
export interface EntryCandidate {
  ruleId: string; ruleVersion: number; entryKind: string; range: SourceRange; expression: string; truncated: boolean;
  name: string | null; nameReason: string | null; handler: SourceSite | null; handlerReason: string | null;
}
type Handled = Pick<EntryCandidate, 'handler' | 'handlerReason'>;

const reasons = {
  noName: 'The rule names no name argument.',
  noHandler: 'The rule names no handler argument.',
  handlerSpread: 'A spread argument comes at or before the handler argument, so the rule cannot tell which value is the handler.',
  otherHandler: 'The handler argument is not a function or a name, so the rule does not follow the value that it gives.',
  unresolved: 'The type checker does not resolve the handler to a declaration.',
  package: 'The handler is an import that the type checker does not resolve to a snapshot file.',
  parameter: 'The handler is a parameter, so its value comes from a caller.',
  outside: 'The handler is declared outside the snapshot source.',
};

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

function candidateOf(query: EntryQuery, found: RuleCall<{ rule: BehaviorEntryCallRule }>): EntryCandidate | undefined {
  const { call, entry: { rule } } = found;
  const nameCall = rule.nameCall ?? 0;
  const name = argumentAt(query.ts, nameCallOf(found, nameCall)?.arguments ?? [], rule.nameArgument, null);
  // The last argument must come after the name argument only when both are arguments of one call.
  const handler = argumentAt(query.ts, call.arguments ?? [], rule.handlerArgument, nameCall === 0 ? rule.nameArgument : null);
  if (name.kind === 'missing' || handler.kind === 'missing') return undefined;
  const source = call.getSourceFile();
  return { ruleId: rule.id, ruleVersion: rule.version, entryKind: rule.entryKind, ...located(source, call),
    ...nameOf(query.ts, name, reasons.noName), ...handlerOf(query, source, handler) };
}

// The program and the type checker of the files that the project holds.
export function entryQuery(project: SnapshotProject): EntryQuery {
  const program = referenceProgram(project);
  return { ts: project.ts, checker: program.getTypeChecker(), program };
}

// The candidates of the call rules in one file that the project holds, in source order.
export function callCandidates(query: EntryQuery, path: string, rules: readonly BehaviorEntryCallRule[]): EntryCandidate[] {
  const entries = rules.map(rule => ({ rule, path: rulePath(rule.importName, rule.callPath, rule.sameValueMethods) }));
  return ruleCalls(query, path, entries).flatMap(found => candidateOf(query, found) ?? []);
}
