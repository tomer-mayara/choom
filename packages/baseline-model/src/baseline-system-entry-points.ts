import { z } from "zod";
import {
  baselineBoundedDescriptionSchema as description, baselineBoundedIdSchema as id,
  baselineBoundedReferenceSchema as reference, baselineSourceLocationSchema,
  baselineSourcePathSchema,
} from "./baseline-documentation.ts";
import { supportsSystemEntryPoints } from "./baseline-format.ts";
import type { Baseline } from "./generated/contracts.ts";

const encoder = new TextEncoder();
const evidenceRefs = z.array(reference).min(1).refine((refs) => new Set(refs).size === refs.length,
  "Evidence references must be distinct.");
const source = z.strictObject({
  evidenceRef: reference.refine((ref) => !ref.includes("#"), "A source location needs a direct source-record reference."),
  location: baselineSourceLocationSchema,
});
const entry = z.strictObject({
  id, kind: z.enum(["startup", "external"]), label: description, path: baselineSourcePathSchema,
  componentId: id, evidenceRefs, source: source.optional(), interfaceId: id.optional(), entryId: id.optional(),
});

export const baselineSystemEntryPointsSchema = z.strictObject({
  snapshotRef: reference, mappingRef: reference, scope: description,
  evidenceRefs, limitations: z.array(description), entries: z.array(entry).max(2000, "The system-entry limit is 2000 records."),
});

export function validateBaselineSystemEntryPoints(baseline: Baseline, context: z.RefinementCtx): void {
  if (!supportsSystemEntryPoints(baseline) || !baseline.systemEntryPoints) return;
  const assessment = baseline.systemEntryPoints;
  const issue = (path: (string | number)[], message: string) => context.addIssue({
    code: "custom", path: ["systemEntryPoints", ...path], message,
  });
  if (encoder.encode(JSON.stringify(assessment)).byteLength > 2 * 1024 * 1024) {
    issue([], "The combined system-entry limit is 2097152 UTF-8 bytes.");
  }
  if (baseline.sourceUsage) for (const field of ["snapshotRef", "mappingRef"] as const) {
    if (assessment[field] !== baseline.sourceUsage[field]) {
      issue([field], `The system-entry ${field} must match source use.`);
    }
  }
  const components = new Set(baseline.components.map(({ id }) => id));
  const interfaces = new Map(baseline.interfaces.map((item) => [item.id, item]));
  const ids = new Set<string>();
  assessment.entries.forEach((entry, index) => {
    const path = ["entries", index];
    if (ids.has(entry.id)) issue([...path, "id"], "System entry IDs must be unique within the assessment.");
    ids.add(entry.id);
    if (!components.has(entry.componentId)) issue([...path, "componentId"], "The system entry must name an existing component.");
    const linkedInterface = entry.interfaceId === undefined ? undefined : interfaces.get(entry.interfaceId);
    if (entry.interfaceId !== undefined && !linkedInterface) {
      issue([...path, "interfaceId"], "The system entry must name an existing interface.");
    }
    if (entry.entryId !== undefined) {
      if (entry.interfaceId === undefined) issue([...path, "entryId"], "An interface entry link needs an interface ID.");
      else if (linkedInterface && !linkedInterface.documentation?.entries.some(({ id }) => id === entry.entryId)) {
        issue([...path, "entryId"], "The linked entry must belong to this interface's documentation.");
      }
    }
    if (entry.source) {
      if (!entry.evidenceRefs.includes(entry.source.evidenceRef)) {
        issue([...path, "source", "evidenceRef"], "The source reference must be included in entry evidence.");
      }
      if (entry.source.location.snapshotRef !== assessment.snapshotRef) {
        issue([...path, "source", "location", "snapshotRef"], "The source location must use the system-entry snapshot.");
      }
      if (entry.source.location.path !== entry.path) {
        issue([...path, "source", "location", "path"], "The source path must match the system entry path.");
      }
    }
  });
}
