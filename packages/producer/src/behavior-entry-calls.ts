import type * as TsMorph from 'ts-morph';
import type { BehaviorEntryCallRule } from './generated/contracts.ts';
import { assert } from './record-checks.ts';
import { nodeRange } from './snapshot-exports.ts';
import { type SnapshotProject, snapshotPath, virtualRoot } from './snapshot-project.ts';
import { type Checking, declared, referenceProgram, type SourceRange } from './snapshot-references.ts';
import { type Argument, argumentAt, located, member, nameOf, propertyName, rulePath, samePath, snapshotSource, unwrapped, valuePath }
  from './call-rules.ts';

// The call rules of the behavior entry rules on a snapshot project. A rule finds a
// call whose callee is its call path on the value of its import, such as app.get
// after const app = express(). The value paths of the import, and the names, come
// from call-rules.ts. The name and the handler are arguments of the call.
type Node = TsMorph.ts.Node;
export interface EntryQuery extends Checking { program: TsMorph.ts.Program }
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

function candidateOf(query: EntryQuery, source: TsMorph.ts.SourceFile, call: TsMorph.ts.CallExpression | TsMorph.ts.NewExpression,
  rule: BehaviorEntryCallRule): EntryCandidate | undefined {
  const args = call.arguments ?? [];
  const name = argumentAt(query.ts, args, rule.nameArgument, null);
  const handler = argumentAt(query.ts, args, rule.handlerArgument, rule.nameArgument);
  if (name.kind === 'missing' || handler.kind === 'missing') return undefined;
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
  const { ts, program } = query;
  const source = program.getSourceFile(virtualRoot + '/' + path);
  assert(source, 'The program of the query does not hold ' + path + '.');
  const paths = rules.map(rule => ({ rule, path: rulePath(rule.importName, rule.callPath) }));
  const found: EntryCandidate[] = [];
  const visit = (node: Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      // The property name of the callee must be the last name of the rule. Any other callee can be a renamed import.
      const property = member(ts, unwrapped(ts, node.expression))?.name.text;
      const applicable = paths.filter(({ path }) => path.newCall === ts.isNewExpression(node) &&
        (property === undefined || property === 'default' || path.steps.at(-1) === '.' + property));
      const value = applicable.length ? valuePath(query, node.expression) : undefined;
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
