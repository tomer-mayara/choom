import { createHash } from 'node:crypto';

// The small checks that the shared record validator modules and the Stage 3
// finalizer use. Saved JSON and YAML stay unchecked values until these checks read them.
export type Fields = Record<string, unknown>;
export interface Artifact { path: string; bytes: Buffer; sha256: string }

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
export const object = (value: unknown): value is Fields => value !== null && typeof value === 'object' && !Array.isArray(value);
export const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(text);
export const exact = (value: unknown, keys: readonly string[]): value is Fields => object(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const json = (bytes: Buffer): unknown => JSON.parse(bytes.toString('utf8'));
// The path of a JavaScript or TypeScript source file: .js, .jsx, .mjs, .cjs, .ts, .tsx,
// .mts or .cts, which includes declaration files. stage-4-graph.ts keeps its own copy,
// because the graph container runs that file alone.
export const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
// True when the value is one of the listed values.
export const oneOf = (values: readonly unknown[], value: unknown): boolean => values.includes(value);

export function list(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), 'Missing ' + label + ' list.');
  return value;
}
