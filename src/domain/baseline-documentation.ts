import { z } from "zod";
import { baselineId, baselineStatement, baselineText } from "./baseline-statements.ts";
import type { Baseline, BaselineInterface } from "./generated/contracts.ts";

const encoder = new TextEncoder();
const documentationByteLimit = 2 * 1024 * 1024;
const boundedText = (schema: z.ZodString, limit: number) => schema.refine(
  (value) => encoder.encode(value).byteLength <= limit,
  `The UTF-8 text limit is ${limit} bytes.`,
);
const reference = boundedText(baselineText, 4 * 1024);
const localId = boundedText(baselineId, 4 * 1024);
const description = boundedText(baselineText, 8 * 1024);
const sampleText = boundedText(baselineText, 16 * 1024);
const nullableTextStatement = baselineStatement(description.nullable(), reference);

const interaction = z.strictObject({
  input: description.nullable(), success: description.nullable(),
  failures: description.nullable(), effects: description.nullable(),
});
const result = z.strictObject({
  text: sampleText, summary: description, scope: z.enum(["complete", "excerpt"]),
});
const example = z.strictObject({
  id: localId, name: description, basis: z.enum(["illustrative", "source-reviewed"]),
  content: baselineStatement(z.strictObject({ text: sampleText, input: sampleText.optional(), result: result.optional() }), reference),
});
const entry = z.strictObject({
  id: localId, name: description, accessPoint: reference,
  kind: baselineStatement(z.enum(["function", "command", "type", "data", "message", "workflow"]).nullable(), reference),
  description: nullableTextStatement,
  signature: nullableTextStatement.optional(),
  interaction: baselineStatement(interaction, reference).optional(),
  examples: z.array(example).max(8, "The limit is 8 examples per entry."),
});
const location = z.strictObject({
  snapshotRef: reference,
  path: reference.refine((path) => !/^[A-Za-z]:/.test(path) && !/[\\\u0000-\u001f\u007f]/.test(path)
    && path.split("/").every((part) => part !== "" && part !== "." && part !== ".."), "Expected a safe snapshot-relative path."),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  lines: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).length(2),
}).refine(({ lines }) => {
  const [first, last] = lines;
  return first !== undefined && last !== undefined && first <= last;
}, { path: ["lines"], message: "The source range must end at or after its first line." });
export const baselineSourceNoteSchema = z.strictObject({ evidenceRef: reference, description, location: location.optional() });

export const baselineDocumentationSchema = z.strictObject({
  summary: nullableTextStatement,
  entries: z.array(entry).max(32, "The limit is 32 entries per interface."), sourceNotes: z.array(baselineSourceNoteSchema),
});

function validateDocumentationLinks(item: BaselineInterface, index: number, context: z.RefinementCtx): void {
  const docs = item.documentation;
  if (!docs) return;
  const issue = (path: (string | number)[], message: string) => context.addIssue({
    code: "custom", path: ["interfaces", index, "documentation", ...path], message,
  });
  const statements = [item.owner, item.publicAccess, item.allowedConsumers, item.promises, docs.summary,
    ...docs.entries.flatMap((entry) => [entry.kind, entry.description, entry.signature, entry.interaction,
      ...entry.examples.map((example) => example.content)])];
  const evidence = new Set(statements.flatMap((statement) => statement?.evidenceRefs ?? []));
  const located = new Set(docs.sourceNotes.filter((note) => note.location && !note.evidenceRef.includes("#"))
    .map((note) => note.evidenceRef));
  const notes = new Set<string>();
  docs.sourceNotes.forEach((note, noteIndex) => {
    const path = ["sourceNotes", noteIndex, "evidenceRef"];
    if (notes.has(note.evidenceRef)) issue(path, "Source-note references must be unique within the interface.");
    notes.add(note.evidenceRef);
    if (!evidence.has(note.evidenceRef)) issue(path, "The source note must describe a cited evidence reference.");
    if (note.location && note.evidenceRef.includes("#")) issue(path, "A source location needs a direct source-record reference.");
  });
  const entries = new Set<string>();
  docs.entries.forEach((entry, entryIndex) => {
    const path = ["entries", entryIndex];
    if (entries.has(entry.id)) issue([...path, "id"], "Entry IDs must be unique within the interface.");
    entries.add(entry.id);
    if (!item.publicAccess.value?.includes(entry.accessPoint)) issue([...path, "accessPoint"], "Entry access must match this interface's recorded access.");
    if (entry.signature && entry.kind.value !== "function") {
      issue([...path, "signature"], "Only a function may record a signature.");
    }
    if (entry.interaction && !["function", "command", "workflow"].some((kind) => kind === entry.kind.value)) {
      issue([...path, "interaction"], "Only a function, command, or workflow may describe an interaction.");
    }
    const examples = new Set<string>();
    entry.examples.forEach((example, exampleIndex) => {
      const examplePath = [...path, "examples", exampleIndex];
      if (examples.has(example.id)) issue([...examplePath, "id"], "Example IDs must be unique within the entry.");
      examples.add(example.id);
      if (example.basis === "source-reviewed" && !example.content.evidenceRefs.some((ref) => located.has(ref))) {
        issue([...examplePath, "content", "evidenceRefs"], "A source-reviewed example needs its own cited source note with a location.");
      }
    });
  });
}

export function validateBaselineDocumentation(baseline: Baseline, context: z.RefinementCtx): void {
  if (baseline.formatVersion === 1) return;
  const docs = baseline.interfaces.flatMap((item) => item.documentation ? [item.documentation] : []);
  if (encoder.encode(JSON.stringify(docs)).byteLength > documentationByteLimit) {
    context.addIssue({
      code: "custom", path: ["interfaces"],
      message: `The combined documentation limit is ${documentationByteLimit} UTF-8 bytes.`,
    });
  }
  baseline.interfaces.forEach((item, index) => validateDocumentationLinks(item, index, context));
}
