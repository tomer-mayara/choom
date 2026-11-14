import { z } from "zod";
import { baselineSourceNoteSchema } from "./baseline-documentation.ts";
import { baselineId, baselineText } from "./baseline-statements.ts";
import type { Baseline, BaselineInterface, BaselineSourceAssessment } from "./generated/contracts.ts";

const encoder = new TextEncoder();
const bounded = (schema: z.ZodString, bytes: number) => schema.refine(
  (value) => encoder.encode(value).byteLength <= bytes,
  `The UTF-8 text limit is ${bytes} bytes.`,
);
const reference = bounded(baselineText, 4 * 1024);
const id = bounded(baselineId, 4 * 1024);
const description = bounded(baselineText, 8 * 1024);
const references = z.array(reference).min(1).refine((values) => new Set(values).size === values.length,
  "Evidence references must be distinct.");
const directReference = reference.refine((value) => !value.includes("#"), "A use needs a direct source-record reference without a fragment.");

const use = z.strictObject({
  id, consumerId: id.nullable(), kind: z.enum(["value", "type"]), context: z.enum(["application", "tooling", "test", "unknown"]),
  description, callerRef: directReference,
  evidenceRefs: z.array(directReference).min(1).refine((values) => new Set(values).size === values.length, "Evidence references must be distinct."),
  accessPoint: reference.optional(), entryId: id.optional(),
});
const assessment = z.strictObject({
  interfaceId: id, scope: description, evidenceRefs: references,
  limitations: z.array(description), uses: z.array(use), sourceNotes: z.array(baselineSourceNoteSchema),
});

export const baselineSourceUsageSchema = z.strictObject({
  snapshotRef: reference, mappingRef: reference, assessments: z.array(assessment),
});

function validateAssessment(assessment: BaselineSourceAssessment, snapshotRef: string,
  item: BaselineInterface | undefined, componentIds: Set<string>, issue: (path: (string | number)[], message: string) => void): void {
  const evidence = new Set([...assessment.evidenceRefs, ...assessment.uses.flatMap((use) => use.evidenceRefs)]);
  const notes = new Map<string, BaselineSourceAssessment["sourceNotes"][number]>();
  assessment.sourceNotes.forEach((note, noteIndex) => {
    const path = ["sourceNotes", noteIndex];
    if (notes.has(note.evidenceRef)) issue([...path, "evidenceRef"], "Source-note references must be unique within the assessment.");
    notes.set(note.evidenceRef, note);
    if (!evidence.has(note.evidenceRef)) issue([...path, "evidenceRef"], "The source note must describe a cited assessment or use reference.");
    if (note.location) {
      if (note.evidenceRef.includes("#")) issue([...path, "evidenceRef"], "A source location needs a direct source-record reference.");
      if (note.location.snapshotRef !== snapshotRef) issue([...path, "location", "snapshotRef"], "The source location must use the shared source-use snapshot.");
    }
  });
  const entries = new Map(item?.documentation?.entries.map((entry) => [entry.id, entry]));
  const uses = new Set<string>();
  assessment.uses.forEach((use, useIndex) => {
    const path = ["uses", useIndex];
    if (uses.has(use.id)) issue([...path, "id"], "Use IDs must be unique within the assessment.");
    uses.add(use.id);
    if (use.consumerId !== null && !componentIds.has(use.consumerId)) issue([...path, "consumerId"], "The source consumer must name an existing component.");
    if (!use.evidenceRefs.includes(use.callerRef)) issue([...path, "callerRef"], "The caller reference must be included in the use evidence.");
    use.evidenceRefs.forEach((reference, evidenceIndex) => {
      if (!notes.get(reference)?.location) issue([...path, "evidenceRefs", evidenceIndex], "Every use evidence reference needs a source note with a location.");
    });
    if (use.accessPoint !== undefined && !item?.publicAccess.value?.includes(use.accessPoint)) {
      issue([...path, "accessPoint"], "Use access must match this interface's recorded access.");
    }
    if (use.entryId !== undefined) {
      const entry = entries.get(use.entryId);
      if (!entry) issue([...path, "entryId"], "The use entry must belong to this interface's documentation.");
      else if (use.accessPoint !== undefined && use.accessPoint !== entry.accessPoint) {
        issue([...path, "accessPoint"], "The use entry and access point must identify the same entry.");
      }
    }
  });
}

export function validateBaselineSourceUsage(baseline: Baseline, context: z.RefinementCtx): void {
  if (baseline.formatVersion !== 3 || !baseline.sourceUsage) return;
  const source = baseline.sourceUsage;
  const counts = source.assessments.reduce((counts, item) => ({
    uses: counts.uses + item.uses.length, notes: counts.notes + item.sourceNotes.length,
  }), { uses: 0, notes: 0 });
  if (counts.uses > 2000) context.addIssue({
    code: "custom", path: ["sourceUsage", "assessments"], message: "The source-use limit is 2000 records.",
  });
  if (counts.notes > 4000) context.addIssue({
    code: "custom", path: ["sourceUsage", "assessments"], message: "The source-note limit is 4000 records.",
  });
  if (encoder.encode(JSON.stringify(source)).byteLength > 2 * 1024 * 1024) context.addIssue({
    code: "custom", path: ["sourceUsage"], message: "The combined source-use limit is 2097152 UTF-8 bytes.",
  });
  const interfaces = new Map(baseline.interfaces.map((item) => [item.id, item]));
  const components = new Set(baseline.components.map((item) => item.id));
  const assessments = new Set<string>();
  source.assessments.forEach((assessment, index) => {
    const item = interfaces.get(assessment.interfaceId);
    const issue = (path: (string | number)[], message: string) => context.addIssue({
      code: "custom", path: ["sourceUsage", "assessments", index, ...path], message,
    });
    if (!item || assessments.has(assessment.interfaceId)) issue(["interfaceId"],
      item ? "Each interface may have only one source assessment." : "The assessment must name an existing interface.");
    assessments.add(assessment.interfaceId);
    validateAssessment(assessment, source.snapshotRef, item, components, issue);
  });
}
