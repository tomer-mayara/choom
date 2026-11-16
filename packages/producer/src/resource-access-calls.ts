import type * as TsMorph from 'ts-morph';
import { argumentAt, type Located, located, type Named, nameOf, ruleCalls, rulePath, type RuleQuery, typeRulePath, type ValuePath }
  from './call-rules.ts';
import type { ResourceAccessRule } from './generated/contracts.ts';

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
// name need not use the same table.
type Call = TsMorph.ts.CallExpression | TsMorph.ts.NewExpression;
export type Confidence = 'receiver-import' | 'receiver-type';
// A call that a rule finds: the rule, how its receiver was matched, the site and the name.
export interface AccessMatch extends Located, Named { call: Call; rule: ResourceAccessRule; confidence: Confidence }

// The contract requires a name argument, so a rule always names one.
const noName = 'The rule names no name argument.';

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
    return { call, rule, confidence, ...located(call.getSourceFile(), call), ...name };
  });
}
