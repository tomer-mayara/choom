// The check of saved JSON data, such as recorded rule values. JSON data is null,
// text, a boolean, a finite number, or an array or plain object of JSON data,
// with no cycles. The check reads own data properties only: it does not run a
// getter, and it refuses symbol keys and extra array properties. It walks the
// value with a list, not recursion, so deep input cannot exhaust the call stack.

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataChildren(value: Record<string, unknown> | unknown[]): unknown[] | undefined {
  if (Object.getOwnPropertySymbols(value).length > 0) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const array = Array.isArray(value);
  if (array && Object.keys(descriptors).length !== value.length + 1) return undefined;
  const children: unknown[] = [];
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (array && key === "length") continue;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return undefined;
    if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return undefined;
    children.push(descriptor.value);
  }
  return children;
}

export function isJsonData(value: unknown): boolean {
  const pending: { value: unknown; exit?: boolean }[] = [{ value }];
  const ancestors = new Set<object>();
  const complete = new Set<object>();
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) break;
    const current = entry.value;
    if (current === null || typeof current === "string" || typeof current === "boolean") continue;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (!Array.isArray(current) && !isPlainRecord(current)) return false;
    if (entry.exit) {
      ancestors.delete(current);
      complete.add(current);
      continue;
    }
    if (ancestors.has(current)) return false;
    if (complete.has(current)) continue;
    const children = dataChildren(current);
    if (!children) return false;
    ancestors.add(current);
    pending.push({ value: current, exit: true });
    for (const child of children) pending.push({ value: child });
  }
  return true;
}

// True when two values of JSON data are the same data. The keys of an object can
// be in another order; the items of an array cannot.
export function sameJsonData(first: unknown, second: unknown): boolean {
  const pending: [unknown, unknown][] = [[first, second]];
  for (let pair = pending.pop(); pair !== undefined; pair = pending.pop()) {
    const [left, right] = pair;
    if (left === right) continue;
    if (Array.isArray(left)) {
      if (!Array.isArray(right) || left.length !== right.length) return false;
      left.forEach((item, index) => pending.push([item, right[index]]));
    } else if (isPlainRecord(left) && isPlainRecord(right)) {
      const keys = Object.keys(left);
      if (keys.length !== Object.keys(right).length || !keys.every((key) => Object.hasOwn(right, key))) return false;
      for (const key of keys) pending.push([left[key], right[key]]);
    } else return false;
  }
  return true;
}
