import { invalidEncoding, MAX_YAML_BYTES, MAX_YAML_DEPTH, MAX_YAML_NODES, structureLimit, utf8Bytes } from "./limits.ts";

export function assertJsonScalar(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))) return;
  invalidEncoding("The architecture document must contain JSON-compatible data.");
}

function dataProperty(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) {
    invalidEncoding("The architecture document must contain enumerable data properties.");
  }
  return descriptor.value;
}

export function assertBoundedJsonData(input: unknown): void {
  const ancestors = new WeakSet<object>();
  let remainingBytes = MAX_YAML_BYTES;
  let nodes = 0;

  function visit(value: unknown, depth: number): void {
    if (++nodes > MAX_YAML_NODES) structureLimit();
    if (typeof value === "string") remainingBytes -= utf8Bytes(value, remainingBytes);
    if (typeof value !== "object" || value === null) {
      assertJsonScalar(value);
      return;
    }
    if (depth >= MAX_YAML_DEPTH) structureLimit();
    if (ancestors.has(value)) invalidEncoding("The architecture document contains a cycle.");

    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      invalidEncoding("The architecture document must contain plain objects and arrays.");
    }

    ancestors.add(value);
    if (array) {
      if (value.length > MAX_YAML_NODES - nodes) structureLimit();
      if (Reflect.ownKeys(value).length !== value.length + 1) {
        invalidEncoding("The architecture document must contain dense arrays with no extra properties.");
      }
      for (let index = 0; index < value.length; index++) visit(dataProperty(value, index), depth + 1);
    } else {
      const keys = Reflect.ownKeys(value);
      if (keys.length > (MAX_YAML_NODES - nodes) / 2) structureLimit();
      for (const key of keys) {
        if (typeof key !== "string") invalidEncoding("Architecture document keys must be strings.");
        nodes++;
        remainingBytes -= utf8Bytes(key, remainingBytes);
        visit(dataProperty(value, key), depth + 1);
      }
    }
    ancestors.delete(value);
  }

  visit(input, 0);
}
