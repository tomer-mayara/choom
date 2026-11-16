// The helpers of the contract suites of the pinned rule lists: a changed copy of a
// list that follows its contract, a rule of the copy, and whether the runtime check
// of the producer refuses an input.
export type Rule = Record<string, unknown>;
export type ListInput = { formatVersion: unknown; rules: Rule[] } & Record<string, unknown>;
export type Change = (input: ListInput) => void;

// A copy of the list after the change.
export function changedList(list: unknown, change: Change): unknown {
  const input = structuredClone(list) as ListInput;
  change(input);
  return input;
}

export function rule(input: ListInput, index: number): Rule {
  const item = input.rules[index];
  if (item === undefined) throw new Error(`The rule list fixture needs rule ${index}.`);
  return item;
}

export function refusedBy(check: (input: unknown) => unknown, input: unknown): boolean {
  try {
    check(input);
    return false;
  } catch {
    return true;
  }
}
