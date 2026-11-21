import { createHash } from 'node:crypto';

// The small checks that the shared record validator modules and the Stage 3
// finalizer use, and the evidence reference resolver of every stage. Saved JSON
// and YAML stay unchecked values until these checks read them.
export type Fields = Record<string, unknown>;
export interface Artifact { path: string; bytes: Buffer; sha256: string }
// The words of one stage's messages for a JSON Pointer that it refuses. Each stage
// keeps its own words; the message ends with the reference.
export interface PointerMessages {
  // A pointer that is not empty and does not start with /.
  readonly invalid: string;
  // A ~ that is not ~0 or ~1.
  readonly escape: string;
  // A list index that is not 0 or a number without a leading zero.
  readonly index: string;
  // A missing key or list item, or a step into a value that is not an object or a list.
  readonly unresolved: string;
}
// The saved record that the ID of an evidence reference names: a saved source
// record, or a saved file with its path and its parsed document.
export type EvidenceTarget = { readonly record: unknown } | { readonly path: string; document(): unknown };

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Resolve a validated local record ID, retaining its identity in a refusal. */
export function referenced<Value>(records: ReadonlyMap<string, Value>, id: string): Value {
  const value = records.get(id);
  assert(value !== undefined, 'Missing selected record: ' + id);
  return value;
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

// A saved file holds a document only as JSON (.json) or YAML (.yaml or .yml).
const documentFile = (path: string): boolean => /\.(?:json|ya?ml)$/.test(path);

// The document of a saved JSON or YAML file, as every stage reads it. `parseYaml` is
// the trusted YAML parser of the stage.
export function savedDocument(path: string, text: string, parseYaml: (text: string) => unknown): unknown {
  assert(documentFile(path), 'Not a JSON or YAML file: ' + path);
  return path.endsWith('.json') ? JSON.parse(text) : parseYaml(text);
}

// The ID of the saved record that an evidence reference names: the text before the first #.
export function evidenceBase(ref: string): string {
  const split = ref.indexOf('#');
  return split < 0 ? ref : ref.slice(0, split);
}

// The value that an evidence reference names, as every stage resolves it. The ID of
// the target can be followed by # and a JSON Pointer (RFC 6901) in URI fragment form.
// The pointer starts at the source record, or at the document of a JSON or YAML file.
// A list index is 0 or a number without a leading zero. Any file can be cited whole,
// with no pointer or with an empty one; then the file is not read. Without a pointer
// the value is the source record, and nothing for a file.
export function resolveEvidence(ref: string, target: EvidenceTarget, messages: PointerMessages): unknown {
  const split = ref.indexOf('#');
  if (split < 0) return 'record' in target ? target.record : undefined;
  const pointer = decodeURIComponent(ref.slice(split + 1));
  assert(pointer === '' || pointer.startsWith('/'), messages.invalid + ref);
  if (!('record' in target) && !documentFile(target.path)) {
    assert(pointer === '', 'Only a .json, .yaml or .yml file can take a JSON Pointer: ' + ref);
    return undefined;
  }
  let value = 'record' in target ? target.record : target.document();
  for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
    assert(!/~(?:[^01]|$)/.test(part), messages.escape + ref);
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    assert(!Array.isArray(value) || /^(?:0|[1-9][0-9]*)$/.test(key), messages.index + ref);
    assert(value !== null && typeof value === 'object' && Object.hasOwn(value, key), messages.unresolved + ref);
    value = (value as Fields)[key];
  }
  return value;
}
